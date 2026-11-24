import asyncio
import json
from datetime import date, timedelta
from typing import Any, Tuple

from app.main import app
from app.core.token import create_access_token
from app.core.security import hash_password
from app.database.database import AsyncSessionLocal
from app.models.user import User
from app.models.donor import Donor
from app.models.donation import Donation
from app.models.blood_stock import BloodStock
from sqlalchemy import select


async def dispatch_request(
    method: str,
    path: str,
    body: dict | None = None,
    token: str | None = None,
) -> Tuple[int, Any]:
    """Execute an ASGI request directly against FastAPI app."""
    headers = []
    if token:
        headers.append((b"authorization", f"Bearer {token}".encode("utf-8")))

    if body is not None:
        body_bytes = json.dumps(body).encode("utf-8")
        headers.append((b"content-type", b"application/json"))
        headers.append((b"content-length", str(len(body_bytes)).encode("utf-8")))
    else:
        body_bytes = b""

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
    print("=" * 75)
    print("STEP 4: DONATION MANAGEMENT API & BLOOD STOCK INTEGRATION TEST SUITE")
    print("=" * 75)

    created_user_ids = []
    created_donor_ids = []
    created_donation_ids = []
    initial_stock_ml = 0

    results = {}

    try:
        # 1. SETUP: Create Admin, Staff, Donor User and Donor Profile
        async with AsyncSessionLocal() as session:
            # Get any active admin user
            res = await session.execute(select(User).where(User.role == "admin", User.is_active == True))
            admin = res.scalars().first()
            if not admin:
                raise RuntimeError("No active admin user found in the database")
            admin_id = admin.id

            # Create Staff
            staff = User(
                full_name="Hospital Nurse Donation",
                email="staff.donation@example.com",
                hashed_password=hash_password("StaffPass123!"),
                role="staff",
                is_active=True,
            )
            session.add(staff)

            # Create Donor User
            donor_user = User(
                full_name="John Donation Tester",
                email="donor.john@example.com",
                hashed_password=hash_password("JohnPass123!"),
                role="donor",
                is_active=True,
            )
            session.add(donor_user)

            await session.commit()
            await session.refresh(staff)
            await session.refresh(donor_user)
            staff_id = staff.id
            donor_user_id = donor_user.id
            created_user_ids.extend([staff_id, donor_user_id])

            # Create Donor profile (blood group: B+)
            donor = Donor(
                user_id=donor_user_id,
                phone="+1-555-8888",
                date_of_birth=date(1995, 3, 10),
                gender="male",
                blood_group="B+",
                address="100 Donation Way",
                last_donation_date=None,
            )
            session.add(donor)
            await session.commit()
            await session.refresh(donor)
            donor_id = donor.id
            created_donor_ids.append(donor_id)

            # Record initial B+ blood stock
            st_res = await session.execute(select(BloodStock).where(BloodStock.blood_group == "B+"))
            stock_b = st_res.scalar_one_or_none()
            initial_stock_ml = stock_b.available_quantity_ml if stock_b else 0

        # Tokens
        tokens = {
            "admin": create_access_token({"sub": str(admin_id)}),
            "staff": create_access_token({"sub": str(staff_id)}),
            "donor": create_access_token({"sub": str(donor_user_id)}),
        }

        # =====================================================================
        # 1. AUTHENTICATION & VALIDATION TESTS
        # =====================================================================
        print("\n--- 1. AUTHENTICATION & VALIDATION ---")

        # 1.1 Unauthenticated request blocked
        status, body = await dispatch_request("GET", "/api/v1/donations/")
        results["Auth: Missing token rejected (401 Unauthorized)"] = (status == 401)

        # 1.2 Non-existent donor ID
        status, body = await dispatch_request(
            "POST",
            "/api/v1/donations/",
            body={
                "donor_id": 999999,
                "donation_date": str(date.today()),
                "quantity_ml": 450,
                "blood_group": "B+",
                "status": "completed",
            },
            token=tokens["staff"],
        )
        results["Validation: Non-existent donor rejected (404 Not Found)"] = (status == 404)

        # 1.3 Future donation date rejected
        status, body = await dispatch_request(
            "POST",
            "/api/v1/donations/",
            body={
                "donor_id": donor_id,
                "donation_date": str(date.today() + timedelta(days=2)),
                "quantity_ml": 450,
                "blood_group": "B+",
                "status": "completed",
            },
            token=tokens["staff"],
        )
        results["Validation: Future donation date rejected (422)"] = (status == 422)

        # 1.4 Invalid quantity (< 100ml or > 800ml)
        status, body = await dispatch_request(
            "POST",
            "/api/v1/donations/",
            body={
                "donor_id": donor_id,
                "donation_date": str(date.today()),
                "quantity_ml": 50,  # Below minimum whole blood volume
                "blood_group": "B+",
                "status": "completed",
            },
            token=tokens["staff"],
        )
        results["Validation: Quantity out of range rejected (422)"] = (status == 422)

        # 1.5 Blood group mismatch with donor (donor is B+, payload is A+)
        status, body = await dispatch_request(
            "POST",
            "/api/v1/donations/",
            body={
                "donor_id": donor_id,
                "donation_date": str(date.today()),
                "quantity_ml": 450,
                "blood_group": "A+",  # Mismatch!
                "status": "completed",
            },
            token=tokens["staff"],
        )
        results["Relationship: Blood group mismatch rejected (400 Bad Request)"] = (
            status == 400 and "mismatch" in str(body)
        )

        # =====================================================================
        # 2. CRUD OPERATIONS & ATOMIC BLOOD STOCK INTEGRATION
        # =====================================================================
        print("\n--- 2. CRUD & BLOOD STOCK INTEGRATION ---")

        # 2.1 Staff records successful 450ml completed donation (donation date: 70 days ago to test interval later)
        first_date = date.today() - timedelta(days=70)
        status, body = await dispatch_request(
            "POST",
            "/api/v1/donations/",
            body={
                "donor_id": donor_id,
                "donation_date": str(first_date),
                "quantity_ml": 450,
                "blood_group": "B+",
                "status": "completed",
                "notes": "First successful whole blood donation",
            },
            token=tokens["staff"],
        )
        first_donation_id = body.get("id") if isinstance(body, dict) else None
        if first_donation_id:
            created_donation_ids.append(first_donation_id)

        # Verify blood stock increased by exactly 450ml in PostgreSQL
        async with AsyncSessionLocal() as session:
            st_res = await session.execute(select(BloodStock).where(BloodStock.blood_group == "B+"))
            stock_b = st_res.scalar_one_or_none()
            after_stock_ml = stock_b.available_quantity_ml if stock_b else 0
            # Also check donor last_donation_date updated
            d_res = await session.execute(select(Donor).where(Donor.id == donor_id))
            d_obj = d_res.scalar_one_or_none()
            donor_date_updated = d_obj.last_donation_date == first_date

        pass_2_1 = (
            status == 201
            and first_donation_id is not None
            and after_stock_ml == initial_stock_ml + 450
            and donor_date_updated
        )
        results["Blood Stock: Successful donation updates blood stock exactly once (201 Created)"] = pass_2_1
        results["Relationship: Donor last_donation_date synchronized on donation"] = donor_date_updated

        # =====================================================================
        # 3. ELIGIBILITY VALIDATION (56 DAYS INTERVAL RULE)
        # =====================================================================
        print("\n--- 3. ELIGIBILITY VALIDATION ---")

        # 3.1 Attempt second donation only 20 days after the first one -> Blocked (400)
        too_soon_date = first_date + timedelta(days=20)
        status, body = await dispatch_request(
            "POST",
            "/api/v1/donations/",
            body={
                "donor_id": donor_id,
                "donation_date": str(too_soon_date),
                "quantity_ml": 450,
                "blood_group": "B+",
                "status": "completed",
            },
            token=tokens["staff"],
        )
        results["Eligibility: Donation before 56-day interval blocked (400 Bad Request)"] = (
            status == 400 and "not eligible yet" in str(body).lower()
        )

        # 3.2 Attempt donation today (70 days after first_date >= 56 days) -> Allowed
        status, body = await dispatch_request(
            "POST",
            "/api/v1/donations/",
            body={
                "donor_id": donor_id,
                "donation_date": str(date.today()),
                "quantity_ml": 500,
                "blood_group": "B+",
                "status": "completed",
                "notes": "Second eligible donation",
            },
            token=tokens["staff"],
        )
        second_donation_id = body.get("id") if isinstance(body, dict) else None
        if second_donation_id:
            created_donation_ids.append(second_donation_id)

        # Verify blood stock increased by an additional 500ml
        async with AsyncSessionLocal() as session:
            st_res = await session.execute(select(BloodStock).where(BloodStock.blood_group == "B+"))
            stock_b = st_res.scalar_one_or_none()
            second_stock_ml = stock_b.available_quantity_ml if stock_b else 0

        pass_3_2 = (
            status == 201
            and second_donation_id is not None
            and second_stock_ml == initial_stock_ml + 450 + 500
        )
        results["Eligibility: Donation after 56-day interval accepted & stock updated (201 Created)"] = pass_3_2

        # =====================================================================
        # 4. RBAC & PERMISSION CHECKS ON ENDPOINTS
        # =====================================================================
        print("\n--- 4. RBAC & PERMISSION CHECKS ---")

        # 4.1 Admin lists all donations
        status, body = await dispatch_request("GET", "/api/v1/donations/", token=tokens["admin"])
        results["RBAC: Admin lists all donations (200 OK)"] = (
            status == 200 and "items" in body and len(body["items"]) >= 2
        )

        # 4.2 Staff lists all donations
        status, body = await dispatch_request("GET", "/api/v1/donations/", token=tokens["staff"])
        results["RBAC: Staff lists all donations (200 OK)"] = (
            status == 200 and "items" in body and len(body["items"]) >= 2
        )

        # 4.3 Donor lists donations -> Restricts to their own donations only
        status, body = await dispatch_request("GET", "/api/v1/donations/", token=tokens["donor"])
        results["RBAC: Donor user views only own donation history (200 OK)"] = (
            status == 200 and all(item["donor_id"] == donor_id for item in body["items"])
        )

        # 4.4 Filter donations by blood group (?blood_group=B+)
        status, body = await dispatch_request("GET", "/api/v1/donations/?blood_group=B+", token=tokens["admin"])
        results["Search & Filter: Filter donations by blood group (200 OK)"] = (
            status == 200 and all(item["blood_group"] == "B+" for item in body["items"])
        )

        # 4.5 Donor user CANNOT update a donation record (Admin & Staff only: 403)
        status, body = await dispatch_request(
            "PATCH",
            f"/api/v1/donations/{first_donation_id}",
            body={"notes": "Donor attempted edit"},
            token=tokens["donor"],
        )
        results["RBAC: Donor user blocked from updating donation (403 Forbidden)"] = (status == 403)

        # 4.6 Staff updates donation quantity from 500ml to 450ml -> Stock adjusts -50ml
        status, body = await dispatch_request(
            "PATCH",
            f"/api/v1/donations/{second_donation_id}",
            body={"quantity_ml": 450},
            token=tokens["staff"],
        )
        async with AsyncSessionLocal() as session:
            st_res = await session.execute(select(BloodStock).where(BloodStock.blood_group == "B+"))
            stock_b = st_res.scalar_one_or_none()
            adjusted_stock_ml = stock_b.available_quantity_ml if stock_b else 0

        pass_4_6 = (
            status == 200
            and body.get("quantity_ml") == 450
            and adjusted_stock_ml == initial_stock_ml + 450 + 450
        )
        results["Transaction: Quantity update adjusts blood stock atomically (200 OK)"] = pass_4_6

        # 4.7 Staff CANNOT delete donation (Admin only: 403 Forbidden)
        status, body = await dispatch_request(
            "DELETE",
            f"/api/v1/donations/{second_donation_id}",
            token=tokens["staff"],
        )
        results["RBAC: Staff blocked from deleting donation (403 Forbidden)"] = (status == 403)

        # 4.8 Admin deletes second donation -> Blood stock refunded (-450ml) atomically
        status, body = await dispatch_request(
            "DELETE",
            f"/api/v1/donations/{second_donation_id}",
            token=tokens["admin"],
        )
        async with AsyncSessionLocal() as session:
            st_res = await session.execute(select(BloodStock).where(BloodStock.blood_group == "B+"))
            stock_b = st_res.scalar_one_or_none()
            after_delete_stock = stock_b.available_quantity_ml if stock_b else 0
            don_res = await session.execute(select(Donation).where(Donation.id == second_donation_id))
            deleted_don = don_res.scalar_one_or_none()

        pass_4_8 = (
            status == 200
            and deleted_don is None
            and after_delete_stock == initial_stock_ml + 450
        )
        if pass_4_8:
            created_donation_ids.remove(second_donation_id)
        results["Transaction: Admin deletes donation and reconciles stock atomically (200 OK)"] = pass_4_8

    finally:
        # CLEANUP: Safely remove created donations, donor, and users, and restore stock
        async with AsyncSessionLocal() as session:
            # Delete donations
            for did in created_donation_ids:
                d = await session.get(Donation, did)
                if d:
                    # rollback stock
                    if d.status == "completed":
                        st = await session.execute(select(BloodStock).where(BloodStock.blood_group == d.blood_group))
                        stock = st.scalar_one_or_none()
                        if stock:
                            stock.available_quantity_ml -= d.quantity_ml
                    await session.delete(d)

            # Delete donors
            for did in created_donor_ids:
                dn = await session.get(Donor, did)
                if dn:
                    await session.delete(dn)

            # Delete users
            for uid in created_user_ids:
                u = await session.get(User, uid)
                if u:
                    await session.delete(u)

            await session.commit()
            print(f"[CLEANUP] Cleaned up temporary records and reconciled blood stock.")

    print("\n" + "=" * 75)
    print("STEP 4 SUMMARY OF DONATION MANAGEMENT TEST RESULTS:")
    print("=" * 75)
    all_success = True
    for name, passed in results.items():
        status_tag = "SUCCESS" if passed else "FAILED"
        if not passed:
            all_success = False
        print(f"[{status_tag}] - {name}")
    print("=" * 75)
    print("ALL TESTS PASSED!" if all_success else "SOME TESTS FAILED!")


if __name__ == "__main__":
    asyncio.run(main())

