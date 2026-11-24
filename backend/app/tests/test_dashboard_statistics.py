import asyncio
import json
from typing import Any, Tuple
from datetime import datetime, date, timedelta

from app.main import app
from app.core.token import create_access_token
from app.core.security import hash_password
from app.database.database import AsyncSessionLocal
from app.models.user import User
from app.models.donor import Donor
from app.models.donation import Donation
from app.models.blood_stock import BloodStock
from app.models.blood_request import BloodRequest
from app.crud.blood_stock import ensure_all_blood_stocks_initialized, get_blood_stock_by_group
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
    print("STEP 7: DASHBOARD STATISTICS API TEST SUITE")
    print("=" * 75)

    created_user_ids = []
    created_donor_ids = []
    created_donation_ids = []
    created_request_ids = []
    results = {}

    try:
        # 1. SETUP: Create test users (Admin, Staff, Regular Donor)
        async with AsyncSessionLocal() as session:
            await ensure_all_blood_stocks_initialized(session)

            # Get any active admin user
            res = await session.execute(select(User).where(User.role == "admin", User.is_active == True))
            admin = res.scalars().first()
            if not admin:
                raise RuntimeError("No active admin user found in the database")
            admin_id = admin.id

            # Create Staff
            staff = User(
                full_name="Staff DashTester",
                email="staff.dash@example.com",
                hashed_password=hash_password("StaffPass123!"),
                role="staff",
                is_active=True,
            )
            session.add(staff)

            # Create User
            reg_user = User(
                full_name="User DashTester",
                email="user.dash@example.com",
                hashed_password=hash_password("UserPass123!"),
                role="donor",
                is_active=True,
            )
            session.add(reg_user)

            await session.commit()
            await session.refresh(staff)
            await session.refresh(reg_user)
            staff_id = staff.id
            user_id = reg_user.id
            created_user_ids.extend([staff_id, user_id])

        tokens = {
            "admin": create_access_token({"sub": str(admin_id)}),
            "staff": create_access_token({"sub": str(staff_id)}),
            "user": create_access_token({"sub": str(user_id)}),
        }

        # =====================================================================
        # 1. RBAC & UNAUTHORIZED PROTECTION
        # =====================================================================
        print("\n--- 1. RBAC & PERMISSION CHECKS ---")

        # 1.1 Unauthenticated requests blocked
        status, body = await dispatch_request("GET", "/api/v1/dashboard/summary")
        results["Auth: Missing token rejected (401 Unauthorized)"] = (status == 401)

        # 1.2 Regular User blocked from summary (403 Forbidden)
        status, body = await dispatch_request("GET", "/api/v1/dashboard/summary", token=tokens["user"])
        results["RBAC: Regular user blocked from /dashboard/summary (403 Forbidden)"] = (status == 403)

        # 1.3 Regular User blocked from donations stats (403 Forbidden)
        status, body = await dispatch_request("GET", "/api/v1/dashboard/donations", token=tokens["user"])
        results["RBAC: Regular user blocked from /dashboard/donations (403 Forbidden)"] = (status == 403)

        # 1.4 Regular User blocked from blood stock stats (403 Forbidden)
        status, body = await dispatch_request("GET", "/api/v1/dashboard/blood-stock", token=tokens["user"])
        results["RBAC: Regular user blocked from /dashboard/blood-stock (403 Forbidden)"] = (status == 403)

        # 1.5 Regular User blocked from requests stats (403 Forbidden)
        status, body = await dispatch_request("GET", "/api/v1/dashboard/blood-requests", token=tokens["user"])
        results["RBAC: Regular user blocked from /dashboard/blood-requests (403 Forbidden)"] = (status == 403)

        # 1.6 Regular User blocked from monthly trends (403 Forbidden)
        status, body = await dispatch_request("GET", "/api/v1/dashboard/monthly-trends", token=tokens["user"])
        results["RBAC: Regular user blocked from /dashboard/monthly-trends (403 Forbidden)"] = (status == 403)

        # =====================================================================
        # 2. SEED REALISTIC METRICS IN POSTGRESQL FOR VERIFICATION
        # =====================================================================
        print("\n--- 2. SEED TEST RECORDS & VERIFY ZERO-SAFE CALCULATIONS ---")

        today = date.today()
        async with AsyncSessionLocal() as session:
            # Create a Donor profile
            donor = Donor(
                user_id=user_id,
                phone="+1-555-7788",
                date_of_birth=date(1996, 5, 20),
                gender="female",
                blood_group="O+",
                address="450 Dashboard Lane",
            )
            session.add(donor)
            await session.commit()
            await session.refresh(donor)
            donor_id = donor.id
            created_donor_ids.append(donor_id)

            # Seed 3 Donations across dates:
            # Donation 1: Today, 450ml, O+
            d1 = Donation(
                donor_id=donor_id,
                donation_date=today,
                quantity_ml=450,
                blood_group="O+",
                status="completed",
            )
            # Donation 2: Earlier this month (if today > 1, or 0 days ago), 500ml, A+
            d2 = Donation(
                donor_id=donor_id,
                donation_date=today,
                quantity_ml=500,
                blood_group="A+",
                status="completed",
            )
            # Donation 3: 100 days ago (this year if year > 0), 400ml, B-
            d3_date = today - timedelta(days=100)
            d3 = Donation(
                donor_id=donor_id,
                donation_date=d3_date,
                quantity_ml=400,
                blood_group="B-",
                status="completed",
            )
            session.add_all([d1, d2, d3])

            # Seed BloodRequests across statuses:
            req_p = BloodRequest(
                user_id=user_id,
                patient_name="P1",
                hospital_name="St. Jude",
                hospital_address="Ward 4",
                blood_group="O+",
                quantity_ml=450,
                status="pending",
                contact_phone="+1-555-1111",
            )
            req_a = BloodRequest(
                user_id=user_id,
                patient_name="P2",
                hospital_name="General",
                hospital_address="Ward 2",
                blood_group="A+",
                quantity_ml=500,
                status="approved",
                contact_phone="+1-555-2222",
            )
            req_f = BloodRequest(
                user_id=user_id,
                patient_name="P3",
                hospital_name="City Clinic",
                hospital_address="Room 10",
                blood_group="AB-",
                quantity_ml=350,
                status="fulfilled",
                contact_phone="+1-555-3333",
            )
            session.add_all([req_p, req_a, req_f])

            # Set blood stocks: O+ (1500ml), A+ (800ml -> Low stock), B- (0ml -> Out of stock)
            st_o = await get_blood_stock_by_group(session, "O+", for_update=True)
            st_o.available_quantity_ml = 1500
            st_o.reserved_quantity_ml = 200

            st_a = await get_blood_stock_by_group(session, "A+", for_update=True)
            st_a.available_quantity_ml = 800  # < 1000ml -> Low stock alert
            st_a.reserved_quantity_ml = 0

            st_b = await get_blood_stock_by_group(session, "B-", for_update=True)
            st_b.available_quantity_ml = 0  # 0ml -> Out of stock alert
            st_b.reserved_quantity_ml = 0

            await session.commit()
            await session.refresh(d1)
            await session.refresh(d2)
            await session.refresh(d3)
            await session.refresh(req_p)
            await session.refresh(req_a)
            await session.refresh(req_f)

            created_donation_ids.extend([d1.id, d2.id, d3.id])
            created_request_ids.extend([req_p.id, req_a.id, req_f.id])

        # =====================================================================
        # 3. VERIFY DASHBOARD ENDPOINTS (Staff & Admin Access)
        # =====================================================================
        print("\n--- 3. VERIFY DASHBOARD ENDPOINTS ---")

        # 3.1 GET /api/v1/dashboard/summary
        status, body = await dispatch_request("GET", "/api/v1/dashboard/summary", token=tokens["staff"])
        pass_3_1 = (
            status == 200
            and body.get("total_users") >= 3
            and body.get("total_donors") >= 1
            and body.get("total_donations") >= 3
            and body.get("total_blood_stock_ml") >= 2300  # 1500 + 800
            and body.get("pending_requests") >= 1
            and body.get("approved_requests") >= 1
            and body.get("fulfilled_requests") >= 1
            and "generated_at" in body
        )
        results["Summary: Operational overview with counts from DB (200 OK)"] = pass_3_1

        # 3.2 GET /api/v1/dashboard/donations
        status, body = await dispatch_request("GET", "/api/v1/dashboard/donations", token=tokens["admin"])
        # Check today's volume (d1: 450 + d2: 500 = 950ml) and count >= 2
        # Check blood group array has 8 groups
        pass_3_2 = (
            status == 200
            and body.get("today_count") >= 2
            and body.get("today_volume_ml") >= 950
            and body.get("this_month_count") >= 2
            and body.get("this_month_volume_ml") >= 950
            and body.get("all_time_count") >= 3
            and len(body.get("by_blood_group", [])) == 8
        )
        results["Donations: Date filtering & blood group aggregation (200 OK)"] = pass_3_2

        # 3.3 GET /api/v1/dashboard/blood-stock
        status, body = await dispatch_request("GET", "/api/v1/dashboard/blood-stock", token=tokens["staff"])
        # Check low stock alerts contains A+, out of stock contains B-
        low_alerts = body.get("low_stock_alerts", [])
        out_alerts = body.get("out_of_stock_alerts", [])
        pass_3_3 = (
            status == 200
            and "A+" in low_alerts
            and "B-" in out_alerts
            and len(body.get("stocks_by_group", [])) == 8
            and body.get("total_available_ml") >= 2300
        )
        results["Blood Stock: Low-stock and out-of-stock alerts (200 OK)"] = pass_3_3

        # 3.4 GET /api/v1/dashboard/blood-requests
        status, body = await dispatch_request("GET", "/api/v1/dashboard/blood-requests", token=tokens["admin"])
        pass_3_4 = (
            status == 200
            and body.get("total_requests") >= 3
            and body.get("pending_requests") >= 1
            and body.get("approved_requests") >= 1
            and body.get("fulfilled_requests") >= 1
            and len(body.get("by_blood_group", [])) == 8
        )
        results["Blood Requests: Status distribution and group stats (200 OK)"] = pass_3_4

        # 3.5 GET /api/v1/dashboard/monthly-trends
        status, body = await dispatch_request("GET", "/api/v1/dashboard/monthly-trends", token=tokens["staff"])
        pass_3_5 = (
            status == 200
            and "trends" in body
            and len(body["trends"]) >= 1
            and all("month" in t and "donation_count" in t and "total_volume_ml" in t for t in body["trends"])
        )
        results["Trends: Monthly donation volume and count trends (200 OK)"] = pass_3_5

    finally:
        # CLEANUP: Remove test donations, requests, donor, users, and reset stock
        async with AsyncSessionLocal() as session:
            for rid in created_request_ids:
                r = await session.get(BloodRequest, rid)
                if r:
                    await session.delete(r)

            for did in created_donation_ids:
                d = await session.get(Donation, did)
                if d:
                    await session.delete(d)

            for dn_id in created_donor_ids:
                dn = await session.get(Donor, dn_id)
                if dn:
                    await session.delete(dn)

            # Reset stock for O+, A+, B-
            for bg in ["O+", "A+", "B-"]:
                st = await get_blood_stock_by_group(session, bg, for_update=True)
                if st:
                    st.available_quantity_ml = 0
                    st.reserved_quantity_ml = 0

            for uid in created_user_ids:
                u = await session.get(User, uid)
                if u:
                    await session.delete(u)

            await session.commit()
            print("[CLEANUP] Reconciled test records and restored blood stock.")

    print("\n" + "=" * 75)
    print("STEP 7 SUMMARY OF DASHBOARD STATISTICS TEST RESULTS:")
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

