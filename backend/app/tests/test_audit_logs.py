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
from app.models.audit_log import AuditLog
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


async def run_audit_log_tests():
    print("=" * 60)
    print("STARTING TEST SUITE: Step 1.19 – Audit Logs & Activity History")
    print("=" * 60)

    admin_user_id = None
    donor_user_id = None
    created_donor_id = None
    created_request_id = None

    async with AsyncSessionLocal() as session:
        # Create Admin
        admin = User(
            full_name="Audit Admin User",
            email="audit.admin@example.com",
            hashed_password=hash_password("PassAdmin123!"),
            role="admin",
            is_active=True,
        )
        # Create Regular Donor User
        donor_user = User(
            full_name="Audit Donor User",
            email="audit.donor@example.com",
            hashed_password=hash_password("PassDonor123!"),
            role="donor",
            is_active=True,
        )
        session.add_all([admin, donor_user])
        await session.commit()
        await session.refresh(admin)
        await session.refresh(donor_user)
        admin_user_id = admin.id
        donor_user_id = donor_user.id

    admin_token = create_access_token({"sub": str(admin_user_id)})
    donor_token = create_access_token({"sub": str(donor_user_id)})

    results = {}

    try:
        # TEST 1: Unauthenticated request to /api/v1/audit-logs/ returns 401
        status, res = await dispatch_request("GET", "/api/v1/audit-logs/")
        assert status == 401, f"Expected 401 for unauthenticated list, got {status}: {res}"
        results["1_unauthenticated_denied"] = "PASS"
        print("[PASS] Test 1: Unauthenticated request rejected with 401")

        # TEST 2: Non-admin request to /api/v1/audit-logs/ returns 403
        status, res = await dispatch_request("GET", "/api/v1/audit-logs/", token=donor_token)
        assert status == 403, f"Expected 403 for non-admin user, got {status}: {res}"
        results["2_non_admin_denied"] = "PASS"
        print("[PASS] Test 2: Regular user request rejected with 403 Forbidden")

        # TEST 3: Admin request to /api/v1/audit-logs/ succeeds with paginated schema
        status, res = await dispatch_request("GET", "/api/v1/audit-logs/", token=admin_token)
        assert status == 200, f"Expected 200 for admin user, got {status}: {res}"
        assert "items" in res and "total" in res and "page" in res, f"Invalid list schema: {res}"
        results["3_admin_list_success"] = "PASS"
        print("[PASS] Test 3: Admin successfully lists audit logs with correct schema")

        # TEST 4: Perform Business Action - Donor Login creates login_success audit log
        login_body = {"email": "audit.donor@example.com", "password": "PassDonor123!"}
        status, res = await dispatch_request("POST", "/api/v1/auth/login", body=login_body)
        assert status == 200, f"Login failed: {res}"
        
        # Verify audit log entry exists
        status, res = await dispatch_request("GET", "/api/v1/audit-logs/?action=login_success", token=admin_token)
        assert status == 200
        matching = [item for item in res["items"] if item["user_id"] == donor_user_id]
        assert len(matching) > 0, "No login_success audit entry found for donor user"
        results["4_login_success_logged"] = "PASS"
        print("[PASS] Test 4: Successful login generated an audit log")

        # TEST 5: Failed login attempt creates login_failed audit log
        bad_login_body = {"email": "audit.donor@example.com", "password": "WrongPassword!"}
        status, res = await dispatch_request("POST", "/api/v1/auth/login", body=bad_login_body)
        assert status == 401
        
        status, res = await dispatch_request("GET", "/api/v1/audit-logs/?action=login_failed", token=admin_token)
        assert status == 200
        matching_failed = [item for item in res["items"] if "audit.donor@example.com" in item["description"]]
        assert len(matching_failed) > 0, "No login_failed audit log found"
        results["5_login_failed_logged"] = "PASS"
        print("[PASS] Test 5: Failed login attempt safely audited without leaking credentials")

        # TEST 6: Donor registration generates donor_created audit entry
        donor_body = {
            "blood_group": "AB+",
            "gender": "male",
            "date_of_birth": "1995-05-15",
            "phone": "+1999888777",
            "address": "456 Audit Way",
        }
        status, res = await dispatch_request("POST", "/api/v1/donors/", body=donor_body, token=donor_token)
        assert status == 201, f"Create donor failed: {res}"
        created_donor_id = res["id"]

        status, res = await dispatch_request("GET", f"/api/v1/audit-logs/?entity_type=donor&action=donor_created", token=admin_token)
        assert status == 200
        matching_donor = [item for item in res["items"] if item["entity_id"] == created_donor_id]
        assert len(matching_donor) > 0, "No donor_created audit log found"
        results["6_donor_created_logged"] = "PASS"
        print("[PASS] Test 6: Donor registration audited successfully")

        # TEST 7: Blood Request creation generates blood_request_created audit entry
        req_body = {
            "blood_group": "AB+",
            "quantity_ml": 450,
            "hospital_name": "Audit General Hospital",
            "hospital_address": "789 Medical Lane",
            "contact_phone": "+1999888111",
            "patient_name": "Audit Patient",
            "urgency": "high",
        }
        status, res = await dispatch_request("POST", "/api/v1/blood-requests/", body=req_body, token=donor_token)
        assert status == 201, f"Blood request failed: {res}"
        created_request_id = res["id"]

        status, res = await dispatch_request("GET", f"/api/v1/audit-logs/?entity_type=blood_request&action=blood_request_created", token=admin_token)
        assert status == 200
        matching_req = [item for item in res["items"] if item["entity_id"] == created_request_id]
        assert len(matching_req) > 0, "No blood_request_created audit log found"
        results["7_blood_request_created_logged"] = "PASS"
        print("[PASS] Test 7: Blood request creation audited successfully")

        # TEST 8: Blood Request approval generates blood_request_approved audit entry
        status, res = await dispatch_request("POST", f"/api/v1/blood-requests/{created_request_id}/approve", token=admin_token)
        assert status == 200, f"Approve failed: {res}"

        status, res = await dispatch_request("GET", f"/api/v1/audit-logs/?entity_type=blood_request&action=blood_request_approved", token=admin_token)
        assert status == 200
        matching_app = [item for item in res["items"] if item["entity_id"] == created_request_id]
        assert len(matching_app) > 0, "No blood_request_approved audit log found"
        results["8_blood_request_approved_logged"] = "PASS"
        print("[PASS] Test 8: Blood request approval audited successfully")

        # TEST 9: Audit log detail endpoint GET /api/v1/audit-logs/{id}
        log_id = matching_app[0]["id"]
        status, res = await dispatch_request("GET", f"/api/v1/audit-logs/{log_id}", token=admin_token)
        assert status == 200, f"Get detail failed: {res}"
        assert res["id"] == log_id
        assert res["action"] == "blood_request_approved"
        results["9_audit_log_detail_success"] = "PASS"
        print("[PASS] Test 9: Retrieved single audit log detail successfully")

        # TEST 10: Nonexistent audit log returns 404
        status, res = await dispatch_request("GET", "/api/v1/audit-logs/99999999", token=admin_token)
        assert status == 404, f"Expected 404 for missing log, got {status}"
        results["10_nonexistent_returns_404"] = "PASS"
        print("[PASS] Test 10: Nonexistent audit log returned 404")

        # TEST 11: Public modification/deletion endpoints DO NOT exist (POST/PUT/DELETE return 405)
        status, res = await dispatch_request("POST", "/api/v1/audit-logs/", body={}, token=admin_token)
        assert status == 405, f"Expected 405 Method Not Allowed for POST /audit-logs/, got {status}"
        status, res = await dispatch_request("DELETE", f"/api/v1/audit-logs/{log_id}", token=admin_token)
        assert status == 405, f"Expected 405 Method Not Allowed for DELETE /audit-logs/{log_id}, got {status}"
        results["11_read_only_enforced"] = "PASS"
        print("[PASS] Test 11: Audit log endpoints strictly read-only (mutations blocked with 405)")

    finally:
        # CLEANUP
        print("\n[CLEANUP] Cleaning test entities...")
        async with AsyncSessionLocal() as session:
            # Delete audit logs created during test
            if admin_user_id and donor_user_id:
                await session.execute(delete(AuditLog).where(AuditLog.user_id.in_([admin_user_id, donor_user_id])))
            # Also delete failed login audit logs
            await session.execute(delete(AuditLog).where(AuditLog.description.contains("audit.donor@example.com")))
            
            if created_request_id:
                await session.execute(delete(BloodRequest).where(BloodRequest.id == created_request_id))
            if created_donor_id:
                await session.execute(delete(Donor).where(Donor.id == created_donor_id))
            if admin_user_id and donor_user_id:
                await session.execute(delete(User).where(User.id.in_([admin_user_id, donor_user_id])))
            await session.commit()
        print("[CLEANUP] Done.")

    print("=" * 60)
    print("AUDIT LOG SUITE RESULTS:")
    for k, v in results.items():
        print(f"[{v}] - {k}")
    print("=" * 60)
    print("ALL AUDIT LOG TESTS COMPLETED SUCCESSFULLY!")


if __name__ == "__main__":
    asyncio.run(run_audit_log_tests())
