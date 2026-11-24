import asyncio
import json
from typing import Any, Tuple
from datetime import datetime, date

from app.main import app
from app.core.token import create_access_token
from app.core.security import hash_password
from app.database.database import AsyncSessionLocal
from app.models.user import User
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
    print("STEP 6: BLOOD REQUEST MANAGEMENT API & BLOOD STOCK INTEGRATION TEST SUITE")
    print("=" * 75)

    created_user_ids = []
    created_request_ids = []
    results = {}

    try:
        # 1. SETUP: Create Users, initialize stocks, and calibrate initial stock for testing
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
                full_name="Staff RequestTester",
                email="staff.request@example.com",
                hashed_password=hash_password("StaffPass123!"),
                role="staff",
                is_active=True,
            )
            session.add(staff)

            # Create User A (Patient / Requester)
            user_a = User(
                full_name="Requester Alice",
                email="alice.requester@example.com",
                hashed_password=hash_password("UserPass123!"),
                role="donor",
                is_active=True,
            )
            session.add(user_a)

            # Create User B (Another User)
            user_b = User(
                full_name="Requester Bob",
                email="bob.requester@example.com",
                hashed_password=hash_password("UserPass123!"),
                role="donor",
                is_active=True,
            )
            session.add(user_b)

            await session.commit()
            await session.refresh(staff)
            await session.refresh(user_a)
            await session.refresh(user_b)
            created_user_ids.extend([staff.id, user_a.id, user_b.id])

            # Set AB+ blood stock to 1000ml for fulfillment tests
            st = await get_blood_stock_by_group(session, "AB+", for_update=True)
            st.available_quantity_ml = 1000
            st.reserved_quantity_ml = 0
            await session.commit()

        tokens = {
            "admin": create_access_token({"sub": str(admin_id)}),
            "staff": create_access_token({"sub": str(staff.id)}),
            "alice": create_access_token({"sub": str(user_a.id)}),
            "bob": create_access_token({"sub": str(user_b.id)}),
        }

        # =====================================================================
        # 1. AUTHENTICATION & VALIDATION
        # =====================================================================
        print("\n--- 1. AUTHENTICATION & VALIDATION ---")

        # 1.1 Unauthenticated request blocked
        status, body = await dispatch_request("GET", "/api/v1/blood-requests/")
        results["Auth: Missing token rejected (401 Unauthorized)"] = (status == 401)

        # 1.2 Invalid phone number
        status, body = await dispatch_request(
            "POST",
            "/api/v1/blood-requests/",
            body={
                "patient_name": "Emergency Patient",
                "hospital_name": "General Hospital",
                "hospital_address": "123 Medical Center Way",
                "blood_group": "AB+",
                "quantity_ml": 450,
                "contact_phone": "invalid#phone",
            },
            token=tokens["alice"],
        )
        results["Validation: Invalid phone format rejected (422)"] = (status == 422)

        # 1.3 Invalid quantity (e.g. <= 0 or > 5000ml)
        status, body = await dispatch_request(
            "POST",
            "/api/v1/blood-requests/",
            body={
                "patient_name": "Emergency Patient",
                "hospital_name": "General Hospital",
                "hospital_address": "123 Medical Center Way",
                "blood_group": "AB+",
                "quantity_ml": 6000,
                "contact_phone": "+1-555-4321",
            },
            token=tokens["alice"],
        )
        results["Validation: Quantity over limit rejected (422)"] = (status == 422)

        # 1.4 Invalid blood group (e.g. XYZ+)
        status, body = await dispatch_request(
            "POST",
            "/api/v1/blood-requests/",
            body={
                "patient_name": "Emergency Patient",
                "hospital_name": "General Hospital",
                "hospital_address": "123 Medical Center Way",
                "blood_group": "XYZ+",
                "quantity_ml": 450,
                "contact_phone": "+1-555-4321",
            },
            token=tokens["alice"],
        )
        results["Validation: Invalid blood group rejected (422)"] = (status == 422)

        # =====================================================================
        # 2. CREATE & ZERO-DEDUCTION RULE
        # =====================================================================
        print("\n--- 2. CREATE & VERIFY ZERO STOCK DEDUCTION ---")

        # 2.1 Alice creates blood request for 450ml AB+
        req_payload = {
            "patient_name": "Jane Patient",
            "hospital_name": "City General Hospital",
            "hospital_address": "500 Healthcare Blvd",
            "blood_group": "AB+",
            "quantity_ml": 450,
            "urgency": "high",
            "contact_phone": "+1-555-9876",
            "notes": "Urgent surgery scheduled",
        }
        status, body = await dispatch_request(
            "POST", "/api/v1/blood-requests/", body=req_payload, token=tokens["alice"]
        )
        req_1_id = body.get("id") if isinstance(body, dict) else None
        if req_1_id:
            created_request_ids.append(req_1_id)

        # Verify stock was NOT deducted (must still be 1000ml)
        async with AsyncSessionLocal() as session:
            stock_ab = await get_blood_stock_by_group(session, "AB+")
            stock_unchanged_on_create = (stock_ab.available_quantity_ml == 1000)

        pass_2_1 = (
            status == 201
            and req_1_id is not None
            and body.get("status") == "pending"
            and stock_unchanged_on_create
        )
        results["CRUD: Create blood request in pending status (201 Created)"] = pass_2_1
        results["Stock Rule: Creating request does NOT deduct blood stock"] = stock_unchanged_on_create

        # =====================================================================
        # 3. RBAC ON LIST & GET
        # =====================================================================
        print("\n--- 3. RBAC & PERMISSIONS ---")

        # 3.1 Alice sees her own request
        status, body = await dispatch_request("GET", "/api/v1/blood-requests/", token=tokens["alice"])
        pass_3_1 = (
            status == 200
            and len(body.get("items", [])) == 1
            and body["items"][0]["id"] == req_1_id
        )
        results["RBAC: User views only their own submitted requests (200 OK)"] = pass_3_1

        # 3.2 Bob sees 0 requests (cannot see Alice's)
        status, body = await dispatch_request("GET", "/api/v1/blood-requests/", token=tokens["bob"])
        pass_3_2 = (status == 200 and len(body.get("items", [])) == 0)
        results["RBAC: Other users cannot see another user's requests (200 OK)"] = pass_3_2

        # 3.3 Bob blocked from viewing Alice's request by ID (403 Forbidden)
        status, body = await dispatch_request("GET", f"/api/v1/blood-requests/{req_1_id}", token=tokens["bob"])
        results["RBAC: Other user blocked from GET /blood-requests/{id} (403 Forbidden)"] = (status == 403)

        # 3.4 Staff and Admin see all requests
        status, body = await dispatch_request("GET", "/api/v1/blood-requests/", token=tokens["staff"])
        results["RBAC: Staff views all requests across all users (200 OK)"] = (
            status == 200 and len(body.get("items", [])) >= 1
        )

        # 3.5 Filtering by hospital name search & blood group
        status, body = await dispatch_request(
            "GET", "/api/v1/blood-requests/?hospital_name=City&blood_group=AB%2B", token=tokens["admin"]
        )
        results["Search & Filter: Hospital name and blood group filter (200 OK)"] = (
            status == 200 and len(body.get("items", [])) >= 1 and body["items"][0]["blood_group"] == "AB+"
        )

        # =====================================================================
        # 4. APPROVAL & ZERO-DEDUCTION RULE
        # =====================================================================
        print("\n--- 4. APPROVAL & AUDIT TRAIL ---")

        # 4.1 Regular User CANNOT approve requests (403 Forbidden)
        status, body = await dispatch_request(
            "POST", f"/api/v1/blood-requests/{req_1_id}/approve", token=tokens["alice"]
        )
        results["RBAC: Regular user blocked from approving request (403 Forbidden)"] = (status == 403)

        # 4.2 Staff approves request
        status, body = await dispatch_request(
            "POST",
            f"/api/v1/blood-requests/{req_1_id}/approve",
            body={"notes": "Doctor reviewed and approved"},
            token=tokens["staff"],
        )
        # Verify stock was NOT deducted (must still be 1000ml)
        async with AsyncSessionLocal() as session:
            stock_ab = await get_blood_stock_by_group(session, "AB+")
            stock_unchanged_on_approve = (stock_ab.available_quantity_ml == 1000)

        pass_4_2 = (
            status == 200
            and body.get("status") == "approved"
            and "Status changed to 'approved'" in body.get("notes", "")
            and stock_unchanged_on_approve
        )
        results["Workflow: Staff approves pending request with audit note (200 OK)"] = pass_4_2
        results["Stock Rule: Approving request does NOT deduct blood stock"] = stock_unchanged_on_approve

        # =====================================================================
        # 5. FULFILLMENT & EXACT-ONCE ATOMIC STOCK DEDUCTION
        # =====================================================================
        print("\n--- 5. FULFILLMENT & STOCK DEDUCTION ---")

        # 5.1 Regular User CANNOT fulfill request (403 Forbidden)
        status, body = await dispatch_request(
            "POST", f"/api/v1/blood-requests/{req_1_id}/fulfill", token=tokens["alice"]
        )
        results["RBAC: Regular user blocked from fulfilling request (403 Forbidden)"] = (status == 403)

        # 5.2 Staff fulfills approved request for 450ml AB+
        status, body = await dispatch_request(
            "POST",
            f"/api/v1/blood-requests/{req_1_id}/fulfill",
            body={"notes": "Dispensed 1 unit (450ml) to ambulance team"},
            token=tokens["staff"],
        )
        # Verify stock WAS deducted exactly once: 1000 - 450 = 550ml in PostgreSQL
        async with AsyncSessionLocal() as session:
            stock_ab = await get_blood_stock_by_group(session, "AB+")
            stock_after_fulfill = stock_ab.available_quantity_ml

        pass_5_2 = (
            status == 200
            and body.get("status") == "fulfilled"
            and "Status changed to 'fulfilled'" in body.get("notes", "")
            and stock_after_fulfill == 550
        )
        results["Fulfillment: Staff fulfills request & stock deducted exactly once (200 OK)"] = pass_5_2

        # 5.3 Attempt repeated fulfillment of already fulfilled request -> Rejected (400)
        status, body = await dispatch_request(
            "POST", f"/api/v1/blood-requests/{req_1_id}/fulfill", token=tokens["staff"]
        )
        # Verify stock remains 550ml (NO double deduction)
        async with AsyncSessionLocal() as session:
            stock_ab = await get_blood_stock_by_group(session, "AB+")
            no_double_deduct = (stock_ab.available_quantity_ml == 550)

        results["Safeguard: Repeated fulfillment blocked (400 Bad Request)"] = (status == 400 and no_double_deduct)
        results["Stock Rule: Duplicate stock deduction prevented"] = no_double_deduct

        # =====================================================================
        # 6. INSUFFICIENT STOCK & STATUS TRANSITION CHECKS
        # =====================================================================
        print("\n--- 6. INSUFFICIENT STOCK & INVALID STATUS TRANSITIONS ---")

        # 6.1 Create Request 2 for 800ml AB+ (Current stock is 550ml < 800ml)
        status, body = await dispatch_request(
            "POST",
            "/api/v1/blood-requests/",
            body={
                "patient_name": "Large Volume Patient",
                "hospital_name": "Memorial Hospital",
                "hospital_address": "800 Main Street",
                "blood_group": "AB+",
                "quantity_ml": 800,
                "contact_phone": "+1-555-1212",
            },
            token=tokens["alice"],
        )
        req_2_id = body.get("id")
        created_request_ids.append(req_2_id)

        # 6.2 Attempt fulfilling a 'pending' request without approval -> Blocked (400)
        status, body = await dispatch_request(
            "POST", f"/api/v1/blood-requests/{req_2_id}/fulfill", token=tokens["staff"]
        )
        results["Workflow: Cannot fulfill a pending request without approval (400)"] = (status == 400)

        # 6.3 Approve Request 2
        await dispatch_request("POST", f"/api/v1/blood-requests/{req_2_id}/approve", token=tokens["staff"])

        # 6.4 Fulfill Request 2 when available stock (550ml) is less than requested (800ml) -> Blocked (400)
        status, body = await dispatch_request(
            "POST", f"/api/v1/blood-requests/{req_2_id}/fulfill", token=tokens["staff"]
        )
        async with AsyncSessionLocal() as session:
            stock_ab = await get_blood_stock_by_group(session, "AB+")
            stock_prevented_negative = (stock_ab.available_quantity_ml == 550)

        pass_6_4 = (
            status == 400
            and "Insufficient available stock" in str(body)
            and stock_prevented_negative
        )
        results["Stock Rule: Insufficient stock prevents fulfillment & negative stock (400)"] = pass_6_4

        # 6.5 Cancel Request 2
        status, body = await dispatch_request(
            "POST",
            f"/api/v1/blood-requests/{req_2_id}/cancel",
            body={"notes": "Patient transferred out"},
            token=tokens["alice"],
        )
        pass_6_5 = (status == 200 and body.get("status") == "cancelled")
        results["Workflow: User cancels approved request (200 OK)"] = pass_6_5

        # 6.6 Attempt to fulfill a cancelled request -> Blocked (400)
        status, body = await dispatch_request(
            "POST", f"/api/v1/blood-requests/{req_2_id}/fulfill", token=tokens["staff"]
        )
        results["Workflow: Cannot fulfill a cancelled request (400 Bad Request)"] = (status == 400)

        # 6.7 Create Request 3 & Reject it
        status, body = await dispatch_request(
            "POST",
            "/api/v1/blood-requests/",
            body={
                "patient_name": "Rejected Case",
                "hospital_name": "Clinic",
                "hospital_address": "Street 9",
                "blood_group": "AB+",
                "quantity_ml": 200,
                "contact_phone": "+1-555-0000",
            },
            token=tokens["alice"],
        )
        req_3_id = body.get("id")
        created_request_ids.append(req_3_id)

        # Reject
        status, body = await dispatch_request(
            "POST",
            f"/api/v1/blood-requests/{req_3_id}/reject",
            body={"notes": "Duplicate clinical request"},
            token=tokens["staff"],
        )
        pass_6_7 = (status == 200 and body.get("status") == "rejected")
        results["Workflow: Staff rejects pending request (200 OK)"] = pass_6_7

        # 6.8 Attempt to fulfill rejected request -> Blocked (400)
        status, body = await dispatch_request(
            "POST", f"/api/v1/blood-requests/{req_3_id}/fulfill", token=tokens["staff"]
        )
        results["Workflow: Cannot fulfill a rejected request (400 Bad Request)"] = (status == 400)

    finally:
        # CLEANUP: Remove test requests, restore AB+ stock, remove test users
        async with AsyncSessionLocal() as session:
            for rid in created_request_ids:
                r = await session.get(BloodRequest, rid)
                if r:
                    await session.delete(r)

            # Reset AB+ stock back to 0
            st = await get_blood_stock_by_group(session, "AB+", for_update=True)
            if st:
                st.available_quantity_ml = 0
                st.reserved_quantity_ml = 0

            for uid in created_user_ids:
                u = await session.get(User, uid)
                if u:
                    await session.delete(u)

            await session.commit()
            print("[CLEANUP] Reconciled test blood requests, stock, and users.")

    print("\n" + "=" * 75)
    print("STEP 6 SUMMARY OF BLOOD REQUEST MANAGEMENT TEST RESULTS:")
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

