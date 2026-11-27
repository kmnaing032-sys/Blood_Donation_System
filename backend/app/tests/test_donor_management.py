import asyncio
import json
from datetime import date
from typing import Any, Tuple

from app.main import app
from app.core.token import create_access_token
from app.core.security import hash_password
from app.database.database import AsyncSessionLocal
from app.models.user import User
from app.models.donor import Donor
from sqlalchemy import select


async def dispatch_request(
    method: str,
    path: str,
    body: dict | None = None,
    token: str | None = None,
) -> Tuple[int, Any]:
    """Execute an ASGI request directly against the FastAPI app."""
    headers = []
    if token:
        headers.append((b"authorization", f"Bearer {token}".encode("utf-8")))

    if body is not None:
        body_bytes = json.dumps(body).encode("utf-8")
        headers.append((b"content-type", b"application/json"))
        headers.append((b"content-length", str(len(body_bytes)).encode("utf-8")))
    else:
        body_bytes = b""

    # Split path and query_string for ASGI compliance
    query_string = b""
    raw_path_str = path
    if "?" in path:
        path_part, qs_part = path.split("?", 1)
        raw_path_str = path_part
        query_string = qs_part.encode("utf-8")
    else:
        path_part = path

    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": method,
        "path": path_part,
        "raw_path": raw_path_str.encode("utf-8"),
        "query_string": query_string,
        "headers": headers,
        "client": ("127.0.0.1", 12345),
        "server": ("127.0.0.1", 80),
        "scheme": "http",
        "app": app,
    }

    status_code: int = 500
    res_chunks: list[bytes] = []

    async def receive():
        return {"type": "http.request", "body": body_bytes, "more_body": False}

    async def send(message):
        nonlocal status_code
        if message["type"] == "http.response.start":
            status_code = message["status"]
        elif message["type"] == "http.response.body":
            res_chunks.append(message.get("body", b""))

    await app(scope, receive, send)
    raw_res = b"".join(res_chunks).decode("utf-8", errors="replace")
    try:
        parsed_res = json.loads(raw_res)
    except Exception:
        parsed_res = raw_res
    return status_code, parsed_res


async def main():
    print("=" * 70)
    print("STEP 3: DONOR MANAGEMENT API & RBAC TEST SUITE")
    print("=" * 70)

    test_users = {}
    created_user_ids = []
    created_donor_ids = []

    # Setup: Admin, Staff, Donor User 1, Donor User 2
    async with AsyncSessionLocal() as session:
        # Existing admin check (by role, any active admin)
        res = await session.execute(
            select(User).where(
            User.role == "admin", User.is_active == True
            ))
        admin = res.scalars().first()
        if not admin:
            raise RuntimeError("No active admin user found in the database")
        test_users["admin"] = admin.id

        # Staff user
        staff_user = User(
            full_name="Hospital Staff DonorTester",
            email="donor.staff@example.com",
            hashed_password=hash_password("StaffPass123!"),
            role="staff",
            is_active=True,
        )
        session.add(staff_user)

        # Donor User 1
        donor_user_1 = User(
            full_name="Alex Donor One",
            email="donor.alex@example.com",
            hashed_password=hash_password("DonorPass123!"),
            role="donor",
            is_active=True,
        )
        session.add(donor_user_1)

        # Donor User 2
        donor_user_2 = User(
            full_name="Beth Donor Two",
            email="donor.beth@example.com",
            hashed_password=hash_password("DonorPass123!"),
            role="donor",
            is_active=True,
        )
        session.add(donor_user_2)

        await session.commit()
        await session.refresh(staff_user)
        await session.refresh(donor_user_1)
        await session.refresh(donor_user_2)

        test_users["staff"] = staff_user.id
        test_users["donor_1"] = donor_user_1.id
        test_users["donor_2"] = donor_user_2.id
        created_user_ids.extend([staff_user.id, donor_user_1.id, donor_user_2.id])
        print(f"[SETUP] Created users: staff={staff_user.id}, donor_1={donor_user_1.id}, donor_2={donor_user_2.id}")

    tokens = {
        "admin": create_access_token({"sub": str(test_users["admin"])}),
        "staff": create_access_token({"sub": str(test_users["staff"])}),
        "donor_1": create_access_token({"sub": str(test_users["donor_1"])}),
        "donor_2": create_access_token({"sub": str(test_users["donor_2"])}),
    }

    results = {}
    donor_1_id = None
    donor_2_id = None

    try:
        # =====================================================================
        # 1. AUTHENTICATION & VALIDATION TESTS
        # =====================================================================
        print("\n--- 1. AUTHENTICATION & VALIDATION ---")

        # 1.1 Unauthenticated request blocked
        status, body = await dispatch_request("GET", "/api/v1/donors/")
        pass_1_1 = (status == 401)
        results["Auth: Missing token blocked (401 Unauthorized)"] = pass_1_1

        # 1.2 Invalid phone number format
        status, body = await dispatch_request(
            "POST",
            "/api/v1/donors/",
            body={
                "phone": "invalid#phone!",
                "date_of_birth": "1995-05-15",
                "gender": "male",
                "blood_group": "O+",
                "address": "123 Main Street, Suite 4B",
            },
            token=tokens["donor_1"],
        )
        pass_1_2 = (status == 422)
        results["Validation: Invalid phone format rejected (422)"] = pass_1_2

        # 1.3 Underage donor (< 18 years old)
        status, body = await dispatch_request(
            "POST",
            "/api/v1/donors/",
            body={
                "phone": "+1-555-0101",
                "date_of_birth": "2015-01-01",  # ~11 years old
                "gender": "male",
                "blood_group": "O+",
                "address": "123 Main Street, Suite 4B",
            },
            token=tokens["donor_1"],
        )
        pass_1_3 = (status == 422)
        results["Validation: Underage (<18) donor rejected (422)"] = pass_1_3

        # 1.4 Over-age donor (> 65 years old)
        status, body = await dispatch_request(
            "POST",
            "/api/v1/donors/",
            body={
                "phone": "+1-555-0102",
                "date_of_birth": "1950-01-01",  # ~76 years old
                "gender": "male",
                "blood_group": "O+",
                "address": "123 Main Street, Suite 4B",
            },
            token=tokens["donor_1"],
        )
        pass_1_4 = (status == 422)
        results["Validation: Over-age (>65) donor rejected (422)"] = pass_1_4

        # 1.5 Invalid blood group
        status, body = await dispatch_request(
            "POST",
            "/api/v1/donors/",
            body={
                "phone": "+1-555-0103",
                "date_of_birth": "1995-05-15",
                "gender": "male",
                "blood_group": "XYZ+",
                "address": "123 Main Street, Suite 4B",
            },
            token=tokens["donor_1"],
        )
        pass_1_5 = (status == 422)
        results["Validation: Invalid blood group rejected (422)"] = pass_1_5

        # =====================================================================
        # 2. CRUD OPERATIONS & CREATION
        # =====================================================================
        print("\n--- 2. CRUD OPERATIONS & CREATION ---")

        # 2.1 Donor 1 registers own profile (POST /api/v1/donors/)
        donor_1_payload = {
            "phone": "+1-555-0199",
            "date_of_birth": "1996-04-12",
            "gender": "male",
            "blood_group": "O+",
            "address": "456 Oak Avenue, Metropolis",
        }
        status, body = await dispatch_request(
            "POST", "/api/v1/donors/", body=donor_1_payload, token=tokens["donor_1"]
        )
        pass_2_1 = (
            status == 201
            and isinstance(body, dict)
            and body.get("blood_group") == "O+"
            and body.get("user_id") == test_users["donor_1"]
            and body.get("full_name") == "Alex Donor One"
            and body.get("age") == 30
        )
        if pass_2_1:
            donor_1_id = body["id"]
            created_donor_ids.append(donor_1_id)
        results["CRUD: User registers own donor profile (201 Created)"] = pass_2_1

        # 2.2 Duplicate profile registration for same user blocked (409 Conflict)
        status, body = await dispatch_request(
            "POST", "/api/v1/donors/", body=donor_1_payload, token=tokens["donor_1"]
        )
        pass_2_2 = (status == 409 and "already exists" in str(body))
        results["Safeguard: Duplicate donor profile for user rejected (409 Conflict)"] = pass_2_2

        # 2.3 Duplicate phone number blocked across different users (409 Conflict)
        donor_2_duplicate_phone = {
            "phone": "+1-555-0199",  # Same as donor 1
            "date_of_birth": "1998-09-20",
            "gender": "female",
            "blood_group": "A-",
            "address": "789 Pine Road, Metropolis",
        }
        status, body = await dispatch_request(
            "POST", "/api/v1/donors/", body=donor_2_duplicate_phone, token=tokens["donor_2"]
        )
        pass_2_3 = (status == 409 and "phone number" in str(body))
        results["Safeguard: Duplicate phone number rejected (409 Conflict)"] = pass_2_3

        # 2.4 Staff registers profile for Donor 2 (Staff permission test)
        donor_2_valid = {
            "user_id": test_users["donor_2"],
            "phone": "+1-555-0288",
            "date_of_birth": "1998-09-20",
            "gender": "female",
            "blood_group": "A-",
            "address": "789 Pine Road, Metropolis",
        }
        status, body = await dispatch_request(
            "POST", "/api/v1/donors/", body=donor_2_valid, token=tokens["staff"]
        )
        pass_2_4 = (
            status == 201
            and isinstance(body, dict)
            and body.get("blood_group") == "A-"
            and body.get("user_id") == test_users["donor_2"]
        )
        if pass_2_4:
            donor_2_id = body["id"]
            created_donor_ids.append(donor_2_id)
        results["RBAC: Staff registers profile for another user (201 Created)"] = pass_2_4

        # 2.5 Regular user blocked from registering for another user (403 Forbidden)
        status, body = await dispatch_request(
            "POST",
            "/api/v1/donors/",
            body={
                "user_id": test_users["donor_2"],
                "phone": "+1-555-0999",
                "date_of_birth": "1992-01-01",
                "gender": "other",
                "blood_group": "B+",
                "address": "Somewhere Else",
            },
            token=tokens["donor_1"],
        )
        pass_2_5 = (status == 403)
        results["RBAC: Regular user blocked from registering for others (403 Forbidden)"] = pass_2_5

        # =====================================================================
        # 3. RBAC & DATA PROTECTION ON READ ENDPOINTS
        # =====================================================================
        print("\n--- 3. READ ENDPOINTS & PRIVACY PROTECTION ---")

        # 3.1 Admin lists donors (receives full details: phone, full address, email)
        status, body = await dispatch_request("GET", "/api/v1/donors/", token=tokens["admin"])
        pass_3_1 = (
            status == 200
            and "items" in body
            and len(body["items"]) >= 2
            and all("phone" in item and "address" in item and "full_name" in item for item in body["items"])
        )
        results["RBAC: Admin views full donor list with contact details (200 OK)"] = pass_3_1

        # 3.2 Staff lists donors (receives full details)
        status, body = await dispatch_request("GET", "/api/v1/donors/", token=tokens["staff"])
        pass_3_2 = (
            status == 200
            and "items" in body
            and all("phone" in item and "address" in item for item in body["items"])
        )
        results["RBAC: Staff views full donor list with contact details (200 OK)"] = pass_3_2

        # 3.3 Regular User lists donors (PRIVACY MASKING: phone, address, email EXCLUDED)
        status, body = await dispatch_request("GET", "/api/v1/donors/", token=tokens["donor_1"])
        pass_3_3 = (
            status == 200
            and "items" in body
            and all(
                "phone" not in item and "address" not in item and "email" not in item
                and "blood_group" in item and "age" in item
                for item in body["items"]
            )
        )
        results["Privacy: Regular user receives masked public donor list (200 OK)"] = pass_3_3

        # 3.4 Filter by blood group: ?blood_group=A-
        status, body = await dispatch_request("GET", "/api/v1/donors/?blood_group=A-", token=tokens["admin"])
        pass_3_4 = (
            status == 200
            and all(item["blood_group"] == "A-" for item in body["items"])
            and any(item["id"] == donor_2_id for item in body["items"])
        )
        results["Search & Filter: Filter by blood group (A-) (200 OK)"] = pass_3_4

        # 3.5 Donor views OWN full profile by ID
        status, body = await dispatch_request("GET", f"/api/v1/donors/{donor_1_id}", token=tokens["donor_1"])
        pass_3_5 = (
            status == 200
            and body.get("id") == donor_1_id
            and "phone" in body
            and "address" in body
        )
        results["RBAC: Donor views own full profile by ID (200 OK)"] = pass_3_5

        # 3.6 Donor views ANOTHER donor's profile by ID -> Masked public view
        status, body = await dispatch_request("GET", f"/api/v1/donors/{donor_2_id}", token=tokens["donor_1"])
        pass_3_6 = (
            status == 200
            and body.get("id") == donor_2_id
            and "phone" not in body
            and "address" not in body
            and "blood_group" in body
        )
        results["Privacy: Donor viewing another donor gets masked details (200 OK)"] = pass_3_6

        # 3.7 Non-existent donor ID returns 404
        status, body = await dispatch_request("GET", "/api/v1/donors/999999", token=tokens["admin"])
        pass_3_7 = (status == 404 and body.get("detail") == "Donor not found")
        results["Error Handling: Non-existent donor ID returns 404 Not Found"] = pass_3_7

        # =====================================================================
        # 4. UPDATE (PATCH) & VALIDATION
        # =====================================================================
        print("\n--- 4. UPDATE & PERMISSIONS ---")

        # 4.1 Donor updates own address and phone
        status, body = await dispatch_request(
            "PATCH",
            f"/api/v1/donors/{donor_1_id}",
            body={"address": "777 New City Blvd, Metropolis", "phone": "+1-555-0777"},
            token=tokens["donor_1"],
        )
        pass_4_1 = (
            status == 200
            and body.get("address") == "777 New City Blvd, Metropolis"
            and body.get("phone") == "+1-555-0777"
        )
        results["CRUD: Donor updates own profile (200 OK)"] = pass_4_1

        # 4.2 Donor CANNOT update another donor's profile (403 Forbidden)
        status, body = await dispatch_request(
            "PATCH",
            f"/api/v1/donors/{donor_2_id}",
            body={"address": "Malicious Hijack Attempt"},
            token=tokens["donor_1"],
        )
        pass_4_2 = (status == 403)
        results["RBAC: Donor blocked from updating other donor profile (403 Forbidden)"] = pass_4_2

        # 4.3 Staff CAN update another donor's profile
        status, body = await dispatch_request(
            "PATCH",
            f"/api/v1/donors/{donor_2_id}",
            body={"last_donation_date": "2026-05-10"},
            token=tokens["staff"],
        )
        pass_4_3 = (status == 200 and body.get("last_donation_date") == "2026-05-10")
        results["RBAC: Staff updates donor profile (200 OK)"] = pass_4_3

        # 4.4 Update validation: Future last_donation_date rejected (422)
        status, body = await dispatch_request(
            "PATCH",
            f"/api/v1/donors/{donor_1_id}",
            body={"last_donation_date": "2099-01-01"},
            token=tokens["donor_1"],
        )
        pass_4_4 = (status == 422)
        results["Validation: Future donation date rejected (422)"] = pass_4_4

        # =====================================================================
        # 5. DELETE (RBAC & DATABASE INTEGRITY)
        # =====================================================================
        print("\n--- 5. DELETE & DATABASE INTEGRITY ---")

        # 5.1 Staff CANNOT delete donor (Admin only: 403 Forbidden)
        status, body = await dispatch_request(
            "DELETE", f"/api/v1/donors/{donor_2_id}", token=tokens["staff"]
        )
        pass_5_1 = (status == 403)
        results["RBAC: Staff blocked from deleting donor (403 Forbidden)"] = pass_5_1

        # 5.2 Regular User CANNOT delete donor (403 Forbidden)
        status, body = await dispatch_request(
            "DELETE", f"/api/v1/donors/{donor_1_id}", token=tokens["donor_1"]
        )
        pass_5_2 = (status == 403)
        results["RBAC: Regular user blocked from deleting donor (403 Forbidden)"] = pass_5_2

        # 5.3 Admin deletes donor 2 (200 OK)
        status, body = await dispatch_request(
            "DELETE", f"/api/v1/donors/{donor_2_id}", token=tokens["admin"]
        )
        # Check DB directly
        async with AsyncSessionLocal() as session:
            check_d2 = await session.execute(select(Donor).where(Donor.id == donor_2_id))
            d2_in_db = check_d2.scalar_one_or_none()

        pass_5_3 = (
            status == 200
            and body.get("message") == "Donor profile deleted successfully"
            and d2_in_db is None
        )
        if pass_5_3:
            created_donor_ids.remove(donor_2_id)
        results["CRUD: Admin deletes donor profile & verified in DB (200 OK)"] = pass_5_3

        # 5.4 Deleting non-existent donor returns 404
        status, body = await dispatch_request(
            "DELETE", "/api/v1/donors/999999", token=tokens["admin"]
        )
        pass_5_4 = (status == 404)
        results["Error Handling: Delete non-existent donor returns 404"] = pass_5_4

        # ====================================================================
        # 6. FULL DONOR REGISTRATION (USER + DONOR PROFILE ATOMIC TRANSACTION)
        # ====================================================================
        print("\n--- Testing Full Donor Registration Workflow ---")

        # 6.1 Regular donor user cannot use full registration endpoint
        status, body = await dispatch_request(
            "POST",
            "/api/v1/donors/",
            body={
                "full_name": "Unauthorized User",
                "email": "unauth.donor@example.com",
                "password": "ValidPass123!",
                "phone": "+1-555-8881",
                "date_of_birth": "1995-03-10",
                "gender": "male",
                "blood_group": "B+",
                "address": "123 Restricted Street",
            },
            token=tokens["donor_1"],
        )
        pass_6_1 = (status == 403)
        results["Full Registration: Regular donor blocked from registering others (403 Forbidden)"] = pass_6_1

        # 6.2 Admin successfully registers full donor account (User + Profile in 1 step)
        status, body = await dispatch_request(
            "POST",
            "/api/v1/donors/",
            body={
                "full_name": "Charlie Full Registered",
                "email": "charlie.full@example.com",
                "password": "SecurePassword123!",
                "phone": "+1-555-8882",
                "date_of_birth": "1993-07-20",
                "gender": "male",
                "blood_group": "O+",
                "address": "456 Atomic Hospital Blvd",
            },
            token=tokens["admin"],
        )
        pass_6_2 = (
            status == 201
            and body.get("email") == "charlie.full@example.com"
            and body.get("full_name") == "Charlie Full Registered"
            and body.get("phone") == "+1-555-8882"
            and body.get("blood_group") == "O+"
        )
        if pass_6_2:
            created_donor_ids.append(body["id"])
            created_user_ids.append(body["user_id"])
        results["Full Registration: Admin registers new donor with User account (201 Created)"] = pass_6_2

        # 6.3 Verify login works for the newly registered donor
        status, login_res = await dispatch_request(
            "POST",
            "/api/v1/auth/login",
            body={
                "email": "charlie.full@example.com",
                "password": "SecurePassword123!",
            },
        )
        pass_6_3 = (status == 200 and "access_token" in login_res)
        results["Full Registration: Login succeeds for newly created donor account (200 OK)"] = pass_6_3

        # 6.4 Staff successfully registers full donor account
        status, body = await dispatch_request(
            "POST",
            "/api/v1/donors/",
            body={
                "full_name": "Diana Staff Registered",
                "email": "diana.staff.registered@example.com",
                "password": "StaffPass456!",
                "phone": "+1-555-8883",
                "date_of_birth": "1990-11-15",
                "gender": "female",
                "blood_group": "AB+",
                "address": "789 Clinical Center Lane",
            },
            token=tokens["staff"],
        )
        pass_6_4 = (
            status == 201
            and body.get("email") == "diana.staff.registered@example.com"
            and body.get("phone") == "+1-555-8883"
        )
        if pass_6_4:
            created_donor_ids.append(body["id"])
            created_user_ids.append(body["user_id"])
        results["Full Registration: Staff registers new donor with User account (201 Created)"] = pass_6_4

        # 6.5 Duplicate email rejection (409 Conflict)
        status, body = await dispatch_request(
            "POST",
            "/api/v1/donors/",
            body={
                "full_name": "Duplicate Email Donor",
                "email": "charlie.full@example.com",
                "password": "AnotherPassword123!",
                "phone": "+1-555-8884",
                "date_of_birth": "1992-04-10",
                "gender": "other",
                "blood_group": "A+",
                "address": "999 Duplication Ave",
            },
            token=tokens["admin"],
        )
        pass_6_5 = (status == 409)
        results["Full Registration: Duplicate email rejected (409 Conflict)"] = pass_6_5

        # 6.6 Duplicate phone rejection (409 Conflict)
        status, body = await dispatch_request(
            "POST",
            "/api/v1/donors/",
            body={
                "full_name": "Duplicate Phone Donor",
                "email": "unique.phone.donor@example.com",
                "password": "AnotherPassword123!",
                "phone": "+1-555-8882",  # Already used by Charlie
                "date_of_birth": "1992-04-10",
                "gender": "other",
                "blood_group": "A+",
                "address": "999 Duplication Ave",
            },
            token=tokens["admin"],
        )
        pass_6_6 = (status == 409)
        results["Full Registration: Duplicate phone rejected (409 Conflict)"] = pass_6_6

        # 6.7 Invalid email format rejection (422)
        status, body = await dispatch_request(
            "POST",
            "/api/v1/donors/",
            body={
                "full_name": "Invalid Email Donor",
                "email": "invalid-email-no-at-domain",
                "password": "ValidPassword123!",
                "phone": "+1-555-8885",
                "date_of_birth": "1992-04-10",
                "gender": "female",
                "blood_group": "B-",
                "address": "123 Invalid Email Lane",
            },
            token=tokens["admin"],
        )
        pass_6_7 = (status == 422)
        results["Full Registration: Invalid email format rejected (422)"] = pass_6_7

        # 6.8 Weak password rejection (422)
        status, body = await dispatch_request(
            "POST",
            "/api/v1/donors/",
            body={
                "full_name": "Weak Pass Donor",
                "email": "weakpass@example.com",
                "password": "short",
                "phone": "+1-555-8886",
                "date_of_birth": "1992-04-10",
                "gender": "male",
                "blood_group": "O-",
                "address": "123 Weak Password Lane",
            },
            token=tokens["admin"],
        )
        pass_6_8 = (status == 422)
        results["Full Registration: Weak password rejected (422)"] = pass_6_8


    finally:
        # Cleanup
        async with AsyncSessionLocal() as cleanup_session:
            # Delete created donors
            for did in created_donor_ids:
                res = await cleanup_session.execute(select(Donor).where(Donor.id == did))
                d = res.scalar_one_or_none()
                if d:
                    await cleanup_session.delete(d)
            # Delete created users (cascade deletes any attached donor records)
            for uid in created_user_ids:
                res = await cleanup_session.execute(select(User).where(User.id == uid))
                u = res.scalar_one_or_none()
                if u:
                    await cleanup_session.delete(u)
            await cleanup_session.commit()
            print(f"[CLEANUP] Cleaned up temporary test donors ({created_donor_ids}) and users ({created_user_ids})")

    print("\n" + "=" * 70)
    print("STEP 3 SUMMARY OF DONOR MANAGEMENT TEST RESULTS:")
    print("=" * 70)
    all_success = True
    for name, passed in results.items():
        status_tag = "SUCCESS" if passed else "FAILED"
        if not passed:
            all_success = False
        print(f"[{status_tag}] - {name}")
    print("=" * 70)
    print("ALL TESTS PASSED!" if all_success else "SOME TESTS FAILED!")


if __name__ == "__main__":
    asyncio.run(main())
