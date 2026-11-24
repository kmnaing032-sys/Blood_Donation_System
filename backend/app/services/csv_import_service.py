import csv
import io
import re
from datetime import date, datetime
from typing import List, Dict, Tuple, Optional, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User
from app.models.donor import Donor
from app.models.data_import import DataImportLog
from app.schemas.data_import import (
    DonorImportRowPreview,
    DonorImportPreviewResponse,
    DonorImportCommitResponse,
)
from app.core.security import hash_password
from app.schemas.donor import calculate_age

# Strict CSV configuration limits
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
MAX_ROW_COUNT = 1000

# Canonical header mappings (case-insensitive)
REQUIRED_HEADERS = {"full_name", "email", "phone", "date_of_birth", "gender", "blood_group", "address"}
OPTIONAL_HEADERS = {"last_donation_date"}
VALID_BLOOD_GROUPS = {"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}
VALID_GENDERS = {"male", "female", "other"}
EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
PHONE_REGEX = re.compile(r"^\+?[0-9\s\-()]{7,20}$")


class CSVImportService:
    @staticmethod
    def parse_csv_content(content_bytes: bytes) -> Tuple[List[str], List[Dict[str, str]], Optional[str]]:
        """Decode and parse raw bytes into headers and rows with UTF-8 / UTF-8-BOM support."""
        if len(content_bytes) > MAX_FILE_SIZE_BYTES:
            return [], [], f"File size exceeds maximum permitted limit of {MAX_FILE_SIZE_BYTES // (1024*1024)}MB."

        # Decode handling UTF-8 BOM if present
        try:
            if content_bytes.startswith(b"\xef\xbb\xbf"):
                text = content_bytes.decode("utf-8-sig")
            else:
                text = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            return [], [], "File encoding is not valid UTF-8. Please save the CSV file with UTF-8 encoding."

        if not text.strip():
            return [], [], "Uploaded CSV file is completely empty."

        stream = io.StringIO(text.strip())
        try:
            reader = csv.reader(stream)
            raw_headers = next(reader, None)
            if not raw_headers:
                return [], [], "CSV file has no header row."

            # Normalize headers
            headers = [h.strip().lower() for h in raw_headers]
            missing_req = REQUIRED_HEADERS - set(headers)
            if missing_req:
                return [], [], f"Missing required column headers: {', '.join(sorted(missing_req))}"

            rows = []
            for row_idx, row in enumerate(reader, start=2):
                if not row or all(c.strip() == "" for c in row):
                    continue  # skip blank lines
                if len(row) > len(headers):
                    return [], [], f"Row {row_idx} contains more columns than defined in the header."
                
                # Pad short rows with empty strings
                padded = row + [""] * (len(headers) - len(row))
                row_dict = {headers[i]: padded[i].strip() for i in range(len(headers))}
                row_dict["_row_number"] = row_idx
                rows.append(row_dict)

                if len(rows) > MAX_ROW_COUNT:
                    return [], [], f"CSV exceeds maximum permitted row count of {MAX_ROW_COUNT} records."

            if not rows:
                return [], [], "CSV file contains headers but no data rows."

            return headers, rows, None
        except Exception as e:
            return [], [], f"Malformed CSV structure: {str(e)}"

    @classmethod
    async def validate_and_preview_donors(
        cls,
        db: AsyncSession,
        content_bytes: bytes,
        filename: str,
    ) -> Tuple[Optional[DonorImportPreviewResponse], Optional[str]]:
        """Dry-run validation of donor CSV records without database persistence."""
        headers, rows, err = cls.parse_csv_content(content_bytes)
        if err:
            return None, err

        # Load existing emails and phones from DB to detect duplicates
        existing_emails_res = await db.execute(select(User.email))
        existing_emails = set(existing_emails_res.scalars().all())

        existing_phones_res = await db.execute(select(Donor.phone))
        existing_phones = set(existing_phones_res.scalars().all())

        seen_in_batch_emails = set()
        seen_in_batch_phones = set()

        preview_items = []
        val_errors: Dict[int, List[str]] = {}
        valid_count = 0
        invalid_count = 0
        duplicate_count = 0

        for r in rows:
            row_num = r["_row_number"]
            row_errors = []
            is_dup = False
            dup_reason = None

            full_name = r.get("full_name", "")
            email = r.get("email", "")
            phone = r.get("phone", "")
            dob_str = r.get("date_of_birth", "")
            gender = r.get("gender", "").lower()
            blood_group = r.get("blood_group", "").upper()
            address = r.get("address", "")
            last_don_str = r.get("last_donation_date", "")

            # 1. Validation checks
            if not full_name or len(full_name) < 2 or len(full_name) > 100:
                row_errors.append("Full name must be between 2 and 100 characters")

            if not email or not EMAIL_REGEX.match(email):
                row_errors.append("Invalid email address format")

            if not phone or not PHONE_REGEX.match(phone):
                row_errors.append("Invalid phone number format (7-20 digits)")

            parsed_dob = None
            if not dob_str:
                row_errors.append("Date of birth is required (YYYY-MM-DD)")
            else:
                try:
                    parsed_dob = datetime.strptime(dob_str, "%Y-%m-%d").date()
                    if parsed_dob >= date.today():
                        row_errors.append("Date of birth must be in the past")
                    else:
                        age = calculate_age(parsed_dob)
                        if age < 18 or age > 65:
                            row_errors.append(f"Donor age must be 18–65 years (current calculated age: {age})")
                except ValueError:
                    row_errors.append("Invalid date_of_birth format; must be YYYY-MM-DD")

            if gender not in VALID_GENDERS:
                row_errors.append(f"Invalid gender '{gender}'. Allowed: {', '.join(sorted(VALID_GENDERS))}")

            if blood_group not in VALID_BLOOD_GROUPS:
                row_errors.append(f"Invalid blood group '{blood_group}'. Allowed: {', '.join(sorted(VALID_BLOOD_GROUPS))}")

            if not address or len(address) < 5 or len(address) > 500:
                row_errors.append("Address must be between 5 and 500 characters")

            if last_don_str:
                try:
                    parsed_last = datetime.strptime(last_don_str, "%Y-%m-%d").date()
                    if parsed_last > date.today():
                        row_errors.append("Last donation date cannot be in the future")
                except ValueError:
                    row_errors.append("Invalid last_donation_date format; must be YYYY-MM-DD")

            # 2. Duplicate checks (Database and In-Batch)
            if email in existing_emails:
                is_dup = True
                dup_reason = f"User account with email '{email}' already registered"
            elif email in seen_in_batch_emails:
                is_dup = True
                dup_reason = f"Duplicate email '{email}' within import file"

            if phone in existing_phones:
                is_dup = True
                dup_reason = f"Donor with phone '{phone}' already exists in database"
            elif phone in seen_in_batch_phones:
                is_dup = True
                dup_reason = f"Duplicate phone '{phone}' within import file"

            seen_in_batch_emails.add(email)
            seen_in_batch_phones.add(phone)

            is_valid = len(row_errors) == 0 and not is_dup
            if is_valid:
                valid_count += 1
            elif is_dup:
                duplicate_count += 1
                row_errors.append(dup_reason)
            else:
                invalid_count += 1

            if row_errors:
                val_errors[row_num] = row_errors

            # Build preview item (first 10 rows only)
            if len(preview_items) < 10:
                preview_items.append(
                    DonorImportRowPreview(
                        row_number=row_num,
                        full_name=full_name,
                        email=email,
                        phone=phone,
                        date_of_birth=dob_str,
                        gender=gender,
                        blood_group=blood_group,
                        address=address,
                        last_donation_date=last_don_str if last_don_str else None,
                        is_valid=is_valid,
                        errors=row_errors,
                        is_duplicate=is_dup,
                        duplicate_reason=dup_reason,
                    )
                )

        response = DonorImportPreviewResponse(
            filename=filename,
            total_rows=len(rows),
            valid_rows=valid_count,
            invalid_rows=invalid_count,
            duplicate_rows=duplicate_count,
            validation_errors=val_errors,
            preview_items=preview_items,
            can_commit=(valid_count > 0),
        )
        return response, None

    @classmethod
    async def commit_donor_import(
        cls,
        db: AsyncSession,
        content_bytes: bytes,
        filename: str,
        current_user: User,
    ) -> Tuple[Optional[DonorImportCommitResponse], Optional[str]]:
        """Atomically commit valid donor records from CSV into PostgreSQL database."""
        headers, rows, err = cls.parse_csv_content(content_bytes)
        if err:
            return None, err

        # Load fresh constraints
        existing_emails_res = await db.execute(select(User.email))
        existing_emails = set(existing_emails_res.scalars().all())

        existing_phones_res = await db.execute(select(Donor.phone))
        existing_phones = set(existing_phones_res.scalars().all())

        seen_in_batch_emails = set()
        seen_in_batch_phones = set()

        created_count = 0
        skipped_count = 0
        failed_count = 0
        error_messages = []

        try:
            for r in rows:
                row_num = r["_row_number"]
                full_name = r.get("full_name", "")
                email = r.get("email", "")
                phone = r.get("phone", "")
                dob_str = r.get("date_of_birth", "")
                gender = r.get("gender", "").lower()
                blood_group = r.get("blood_group", "").upper()
                address = r.get("address", "")
                last_don_str = r.get("last_donation_date", "")

                # Validate
                if (
                    not full_name
                    or not email
                    or not EMAIL_REGEX.match(email)
                    or not phone
                    or not PHONE_REGEX.match(phone)
                    or gender not in VALID_GENDERS
                    or blood_group not in VALID_BLOOD_GROUPS
                    or not address
                ):
                    failed_count += 1
                    error_messages.append(f"Row {row_num}: validation failed")
                    continue

                try:
                    parsed_dob = datetime.strptime(dob_str, "%Y-%m-%d").date()
                    age = calculate_age(parsed_dob)
                    if age < 18 or age > 65:
                        failed_count += 1
                        error_messages.append(f"Row {row_num}: age {age} out of range")
                        continue
                except Exception:
                    failed_count += 1
                    error_messages.append(f"Row {row_num}: invalid date format")
                    continue

                parsed_last = None
                if last_don_str:
                    try:
                        parsed_last = datetime.strptime(last_don_str, "%Y-%m-%d").date()
                    except Exception:
                        pass

                # Check duplicates
                if (
                    email in existing_emails
                    or email in seen_in_batch_emails
                    or phone in existing_phones
                    or phone in seen_in_batch_phones
                ):
                    skipped_count += 1
                    continue

                seen_in_batch_emails.add(email)
                seen_in_batch_phones.add(phone)

                # 1. Create User account for donor
                new_user = User(
                    full_name=full_name,
                    email=email,
                    hashed_password=hash_password("TempDonorPass123!"),  # Safe initial default hash
                    role="donor",
                    is_active=True,
                )
                db.add(new_user)
                await db.flush()  # assign new_user.id

                # 2. Create Donor profile linked to new user
                new_donor = Donor(
                    user_id=new_user.id,
                    phone=phone,
                    date_of_birth=parsed_dob,
                    gender=gender,
                    blood_group=blood_group,
                    address=address,
                    last_donation_date=parsed_last,
                )
                db.add(new_donor)
                created_count += 1
                existing_emails.add(email)
                existing_phones.add(phone)

            # Record import metadata in data_import_logs table
            status_str = "completed" if failed_count == 0 else "partial" if created_count > 0 else "failed"
            summary_err = "; ".join(error_messages[:5]) if error_messages else None

            log_entry = DataImportLog(
                import_type="donors",
                filename=filename,
                total_rows=len(rows),
                created_rows=created_count,
                skipped_rows=skipped_count,
                failed_rows=failed_count,
                status=status_str,
                error_summary=summary_err[:1000] if summary_err else None,
                created_by_id=current_user.id,
            )
            db.add(log_entry)
            await db.commit()
            await db.refresh(log_entry)

            response = DonorImportCommitResponse(
                import_id=log_entry.id,
                filename=filename,
                total_rows=len(rows),
                created_count=created_count,
                skipped_count=skipped_count,
                failed_count=failed_count,
                status=status_str,
                summary_message=(
                    f"Successfully imported {created_count} donors. "
                    f"Skipped {skipped_count} duplicates. {failed_count} failed."
                ),
            )
            return response, None

        except Exception as e:
            await db.rollback()
            return None, f"Database transaction error during commit: {str(e)}"
