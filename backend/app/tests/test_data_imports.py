import asyncio
import json
import time
from datetime import datetime, timezone
from typing import Any, Tuple
from sqlalchemy import select

from app.main import app
from app.database.database import AsyncSessionLocal
from app.models.user import User
from app.models.donor import Donor
from app.models.data_import import DataImportLog
from app.core.token import create_access_token


async def dispatch_multipart(
    method: str,
    path: str,
    filename: str,
    file_bytes: bytes,
    token: str | None = None,
) -> Tuple[int, Any]:
    """Execute multipart/form-data request directly against ASGI app."""
    boundary = "----WebKitFormBoundaryTest1234567890"
    delimiter = f"--{boundary}\r\n".encode("utf-8")
    footer = f"\r\n--{boundary}--\r\n".encode("utf-8")

    part_header = (
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: text/csv\r\n\r\n"
    ).encode("utf-8")

    body_bytes = delimiter + part_header + file_bytes + footer

    headers = [
        (b"content-type", f"multipart/form-data; boundary={boundary}".encode("utf-8")),
        (b"content-length", str(len(body_bytes)).encode("utf-8")),
    ]
    if token:
        headers.append((b"authorization", f"Bearer {token}".encode("utf-8")))

    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": method,
        "path": path,
        "raw_path": path.encode("utf-8"),
        "query_string": b"",
        "headers": headers,
        "client": ("127.0.0.1", 12345),
    }

    response_status = 500
    response_body = bytearray()
    sent_request = False

    async def receive():
        nonlocal sent_request
        if not sent_request:
            sent_request = True
            return {"type": "http.request", "body": body_bytes, "more_body": False}
        return {"type": "http.disconnect"}

    async def send(message):
        nonlocal response_status, response_body
        if message["type"] == "http.response.start":
            response_status = message["status"]
        elif message["type"] == "http.response.body":
            response_body.extend(message.get("body", b""))

    await app(scope, receive, send)

    try:
        data = json.loads(response_body.decode("utf-8")) if response_body else None
    except Exception:
        data = response_body.decode("utf-8", errors="replace")

    return response_status, data


async def dispatch_request(
    method: str,
    path: str,
    token: str | None = None,
) -> Tuple[int, Any]:
    headers = []
    if token:
        headers.append((b"authorization", f"Bearer {token}".encode("utf-8")))

    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": method,
        "path": path,
        "raw_path": path.encode("utf-8"),
        "query_string": b"",
        "headers": headers,
        "client": ("127.0.0.1", 12345),
    }

    response_status = 500
    response_body = bytearray()
    sent_request = False

    async def receive():
        nonlocal sent_request
        if not sent_request:
            sent_request = True
            return {"type": "http.request", "body": b"", "more_body": False}
        return {"type": "http.disconnect"}

    async def send(message):
        nonlocal response_status, response_body
        if message["type"] == "http.response.start":
            response_status = message["status"]
        elif message["type"] == "http.response.body":
            response_body.extend(message.get("body", b""))

    await app(scope, receive, send)

    try:
        data = json.loads(response_body.decode("utf-8")) if response_body else None
    except Exception:
        data = response_body.decode("utf-8", errors="replace")

    return response_status, data


async def run_data_import_tests():
    print("=== Running Data Import & Bulk Operations Verification Suite ===")

    # Setup tokens
    async with AsyncSessionLocal() as session:
        admin_res = await session.execute(select(User).where(User.role == "admin", User.is_active == True))
        admin = admin_res.scalars().first()
        staff_res = await session.execute(select(User).where(User.role == "staff", User.is_active == True))
        staff = staff_res.scalars().first()
        donor_res = await session.execute(select(User).where(User.role == "donor", User.is_active == True))
        donor = donor_res.scalars().first()

    admin_token = create_access_token(data={"sub": str(admin.id)})
    staff_token = create_access_token(data={"sub": str(staff.id)})
    donor_token = create_access_token(data={"sub": str(donor.id)})

    # 1. Test Template Download
    print("1. Testing Template Download...")
    st, data = await dispatch_request("GET", "/api/v1/imports/donors/template")
    assert st == 200
    assert "full_name,email,phone" in data
    print("   -> PASSED: CSV template download works.")

    # 2. Test Unauthenticated & Unauthorized Role Access
    print("2. Testing RBAC Access Control...")
    valid_csv = (
        "full_name,email,phone,date_of_birth,gender,blood_group,address\n"
        "Alex Rider,alex.rider@example.com,+1-555-8888,1996-04-12,male,O+,742 Evergreen Terrace\n"
    ).encode("utf-8")

    st, _ = await dispatch_multipart("POST", "/api/v1/imports/donors/preview", "donors.csv", valid_csv)
    assert st == 401

    st, _ = await dispatch_multipart("POST", "/api/v1/imports/donors/preview", "donors.csv", valid_csv, token=donor_token)
    assert st == 403
    print("   -> PASSED: Unauthenticated (401) and Non-Staff/Admin (403) rejected.")

    # 3. Test Invalid File Extension
    print("3. Testing Invalid File Extension Rejection...")
    st, data = await dispatch_multipart("POST", "/api/v1/imports/donors/preview", "donors.exe", b"fake", token=admin_token)
    assert st == 400
    assert "Only .csv files are supported" in data.get("detail", "")
    print("   -> PASSED: Rejected non-csv extension.")

    # 4. Test Missing Headers & Malformed CSV
    print("4. Testing Missing Headers & Malformed CSV...")
    bad_headers = "name,email_addr,tel\nJohn,j@b.com,1234567\n".encode("utf-8")
    st, data = await dispatch_multipart("POST", "/api/v1/imports/donors/preview", "bad.csv", bad_headers, token=admin_token)
    assert st == 400
    assert "Missing required column headers" in data.get("detail", "")
    print("   -> PASSED: Header validation caught missing required columns.")

    # 5. Test Dry-Run Preview with Valid, Invalid, and Duplicate Records
    print("5. Testing Dry-Run Preview Validation...")
    ts = int(time.time())
    preview_csv = f"""full_name,email,phone,date_of_birth,gender,blood_group,address
Valid Donor,valid_{ts}@example.com,+1-555-11{ts % 1000:03d},1994-01-01,male,A+,100 Pine Street
Underage Donor,underage_{ts}@example.com,+1-555-22{ts % 1000:03d},2015-01-01,female,B+,200 Pine Street
Invalid Blood,invalidbg_{ts}@example.com,+1-555-33{ts % 1000:03d},1990-01-01,other,Z+,300 Pine Street
Valid Donor 2,valid2_{ts}@example.com,+1-555-44{ts % 1000:03d},1992-06-15,female,O-,400 Pine Street
""".encode("utf-8")

    st, data = await dispatch_multipart("POST", "/api/v1/imports/donors/preview", "preview.csv", preview_csv, token=admin_token)
    assert st == 200
    assert data["total_rows"] == 4
    assert data["valid_rows"] == 2
    assert data["invalid_rows"] == 2
    assert data["can_commit"] is True
    print("   -> PASSED: Preview accurately flagged valid and invalid records.")

    # 6. Verify Preview did NOT modify database
    print("6. Verifying Preview is Read-Only...")
    async with AsyncSessionLocal() as session:
        check_user = await session.execute(select(User).where(User.email == f"valid_{ts}@example.com"))
        assert check_user.scalar_one_or_none() is None
    print("   -> PASSED: Database was NOT modified during preview.")

    # 7. Test Successful Commit
    print("7. Testing Commit Workflow...")
    commit_csv = f"""full_name,email,phone,date_of_birth,gender,blood_group,address,last_donation_date
Imported Donor 1,imp1_{ts}@example.com,+1-555-71{ts % 1000:03d},1993-02-14,female,AB+,500 Maple St,2025-01-10
Imported Donor 2,imp2_{ts}@example.com,+1-555-72{ts % 1000:03d},1988-11-20,male,O+,600 Maple St,
""".encode("utf-8")

    st, data = await dispatch_multipart("POST", "/api/v1/imports/donors/commit", "commit.csv", commit_csv, token=admin_token)
    assert st == 200
    assert data["created_count"] == 2
    assert data["skipped_count"] == 0
    assert data["failed_count"] == 0
    import_id = data["import_id"]

    # Verify donors actually exist in database
    async with AsyncSessionLocal() as session:
        created_donor = await session.execute(select(User).where(User.email == f"imp1_{ts}@example.com"))
        assert created_donor.scalar_one_or_none() is not None
    print("   -> PASSED: Donors committed successfully into database.")

    # 8. Test Duplicate Handling on Re-Import
    print("8. Testing Duplicate Skipping on Re-Import...")
    st, data = await dispatch_multipart("POST", "/api/v1/imports/donors/commit", "commit.csv", commit_csv, token=staff_token)
    assert st == 200
    assert data["created_count"] == 0
    assert data["skipped_count"] == 2
    print("   -> PASSED: Duplicate donors safely skipped.")

    # 9. Test Import History
    print("9. Testing Import History...")
    st, data = await dispatch_request("GET", "/api/v1/imports/history", token=staff_token)
    assert st == 200
    assert data["total"] >= 1
    assert any(item["id"] == import_id for item in data["items"])
    print("   -> PASSED: Import history listed successfully.")

    print("=== All Data Import & Bulk Operations Verification Tests PASSED ===")


if __name__ == "__main__":
    asyncio.run(run_data_import_tests())
