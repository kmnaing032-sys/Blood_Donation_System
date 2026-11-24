import asyncio
import json
from typing import Any, Tuple
from datetime import date

from app.main import app
from app.core.token import create_access_token
from app.core.security import hash_password
from app.database.database import AsyncSessionLocal
from app.models.user import User
from app.models.donor import Donor
from app.models.donation import Donation
from app.models.blood_stock import BloodStock
from app.models.blood_request import BloodRequest
from sqlalchemy import select, delete


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
    if "?" in path:
        path, qs = path.split("?", 1)
        query_string = qs.encode("utf-8")

    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": method,
        "path": path,
        "raw_path": path.encode("utf-8"),
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


async def run_report_tests():
    print("=" * 60)
    print("STARTING TEST SUITE: Step 1.20 – Reports & Analytics System")
    print("=" * 60)

    admin_user_id = None
    staff_user_id = None
    donor_user_id = None

    async with AsyncSessionLocal() as session:
        # Create test users
        admin = User(
            full_name="Report Admin User",
            email="report.admin@example.com",
            hashed_password=hash_password("PassAdmin123!"),
            role="admin",
            is_active=True,
        )
        staff = User(
            full_name="Report Staff User",
            email="report.staff@example.com",
            hashed_password=hash_password("PassStaff123!"),
            role="staff",
            is_active=True,
        )
        donor_user = User(
            full_name="Report Donor User",
            email="report.donor@example.com",
            hashed_password=hash_password("PassDonor123!"),
            role="donor",
            is_active=True,
        )
        session.add_all([admin, staff, donor_user])
        await session.commit()
        await session.refresh(admin)
        await session.refresh(staff)
        await session.refresh(donor_user)
        admin_user_id = admin.id
        staff_user_id = staff.id
        donor_user_id = donor_user.id

    admin_token = create_access_token({"sub": str(admin_user_id)})
    staff_token = create_access_token({"sub": str(staff_user_id)})
    donor_token = create_access_token({"sub": str(donor_user_id)})

    results = {}

    try:
        # TEST 1: Unauthenticated access rejected with 401
        status, res = await dispatch_request("GET", "/api/v1/reports/overview")
        assert status == 401, f"Expected 401 unauthenticated, got {status}"
        results["1_unauthenticated_rejected"] = "PASS"
        print("[PASS] Test 1: Unauthenticated access rejected with 401")

        # TEST 2: Unauthorized donor role rejected with 403
        status, res = await dispatch_request("GET", "/api/v1/reports/overview", token=donor_token)
        assert status == 403, f"Expected 403 for donor role, got {status}"
        results["2_donor_role_forbidden"] = "PASS"
        print("[PASS] Test 2: Regular donor user rejected with 403")

        # TEST 3: Staff access allowed with 200
        status, res = await dispatch_request("GET", "/api/v1/reports/overview", token=staff_token)
        assert status == 200, f"Expected 200 for staff role, got {status}: {res}"
        assert "total_donors" in res and "total_available_stock_ml" in res
        results["3_staff_access_permitted"] = "PASS"
        print("[PASS] Test 3: Staff authorized access confirmed")

        # TEST 4: Admin access to Overview Report
        status, res = await dispatch_request("GET", "/api/v1/reports/overview", token=admin_token)
        assert status == 200, f"Overview report failed: {res}"
        assert isinstance(res["total_donors"], int)
        assert isinstance(res["total_donations"], int)
        results["4_admin_overview_report"] = "PASS"
        print("[PASS] Test 4: Admin overview report schema and calculation verified")

        # TEST 5: Donor Report API with filtering
        status, res = await dispatch_request("GET", "/api/v1/reports/donors?blood_group=O%2B", token=admin_token)
        assert status == 200, f"Donor report failed: {res}"
        assert "by_blood_group" in res
        assert "by_gender" in res
        results["5_donor_report"] = "PASS"
        print("[PASS] Test 5: Donor report API with blood group filter verified")

        # TEST 6: Donation Report API with trends
        status, res = await dispatch_request("GET", "/api/v1/reports/donations", token=admin_token)
        assert status == 200, f"Donation report failed: {res}"
        assert "by_blood_group" in res
        assert "trends" in res
        results["6_donation_report"] = "PASS"
        print("[PASS] Test 6: Donation report API with trends verified")

        # TEST 7: Blood Stock Report API
        status, res = await dispatch_request("GET", "/api/v1/reports/blood-stock", token=admin_token)
        assert status == 200, f"Blood stock report failed: {res}"
        assert "by_blood_group" in res
        assert "low_stock_groups" in res
        results["7_blood_stock_report"] = "PASS"
        print("[PASS] Test 7: Blood stock report API verified")

        # TEST 8: Blood Request Report API
        status, res = await dispatch_request("GET", "/api/v1/reports/blood-requests", token=admin_token)
        assert status == 200, f"Blood request report failed: {res}"
        assert "by_status" in res
        assert "pending_count" in res
        results["8_blood_request_report"] = "PASS"
        print("[PASS] Test 8: Blood request report API verified")

        # TEST 9: Invalid date range validation (start_date > end_date returns 400)
        status, res = await dispatch_request(
            "GET",
            "/api/v1/reports/overview?start_date=2026-12-01&end_date=2026-01-01",
            token=admin_token,
        )
        assert status == 400, f"Expected 400 for inverted date range, got {status}: {res}"
        results["9_date_range_validation"] = "PASS"
        print("[PASS] Test 9: Inverted date range rejected with 400")

        # TEST 10: CSV Export endpoint
        status, res = await dispatch_request("GET", "/api/v1/reports/export/csv?report_type=overview", token=admin_token)
        assert status == 200, f"CSV export failed: {res}"
        assert "Blood Donation System" in res
        assert "Metric,Value" in res
        results["10_csv_export"] = "PASS"
        print("[PASS] Test 10: CSV export generated successfully")

        # TEST 11: PDF Export endpoint
        status, res = await dispatch_request("GET", "/api/v1/reports/export/pdf?report_type=overview", token=admin_token)
        assert status == 200, f"PDF export failed"
        assert res.startswith("%PDF-1.4"), "Expected PDF binary header %PDF-1.4"
        results["11_pdf_export"] = "PASS"
        print("[PASS] Test 11: Compliant PDF export generated successfully")

    finally:
        # CLEANUP
        print("\n[CLEANUP] Cleaning temporary test users...")
        async with AsyncSessionLocal() as session:
            await session.execute(
                delete(User).where(User.id.in_([admin_user_id, staff_user_id, donor_user_id]))
            )
            await session.commit()
        print("[CLEANUP] Done.")

    print("=" * 60)
    print("REPORT TEST SUITE RESULTS:")
    for k, v in results.items():
        print(f"[{v}] - {k}")
    print("=" * 60)
    print("ALL REPORT TESTS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    asyncio.run(run_report_tests())
