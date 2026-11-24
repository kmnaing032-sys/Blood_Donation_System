import asyncio
import json
from typing import Any, Tuple

from app.main import app
from app.core.token import create_access_token
from app.core.security import hash_password
from app.database.database import AsyncSessionLocal
from app.models.user import User
from app.models.blood_stock import BloodStock
from app.models.donor import Donor
from app.models.donation import Donation
from app.crud.blood_stock import (
    ensure_all_blood_stocks_initialized,
    reserve_stock_for_request,
    fulfill_stock_for_request,
    release_reserved_stock,
    get_blood_stock_by_group,
)
from sqlalchemy import select
from datetime import date


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
    print("STEP 5: BLOOD STOCK MANAGEMENT API & INTEGRATION TEST SUITE")
    print("=" * 75)

    created_user_ids = []
    results = {}

    try:
        # 1. SETUP: Users & Ensure all 8 blood groups exist
        async with AsyncSessionLocal() as session:
            # Ensure 8 groups
            await ensure_all_blood_stocks_initialized(session)

            # Get any active admin user
            res = await session.execute(select(User).where(User.role == "admin", User.is_active == True))
            admin = res.scalars().first()
            if not admin:
                raise RuntimeError("No active admin user found in the database")
            admin_id = admin.id

            # Create Staff
            staff = User(
                full_name="Staff StockTester",
                email="staff.stock@example.com",
                hashed_password=hash_password("StaffPass123!"),
                role="staff",
                is_active=True,
            )
            session.add(staff)

            # Create Regular User
            reg_user = User(
                full_name="User StockTester",
                email="user.stock@example.com",
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
        # 1. AUTHENTICATION & SUMMARY ENDPOINT
        # =====================================================================
        print("\n--- 1. AUTHENTICATION & INVENTORY SUMMARY ---")

        # 1.1 Unauthenticated request blocked
        status, body = await dispatch_request("GET", "/api/v1/blood-stock/summary")
        results["Auth: Missing token rejected (401 Unauthorized)"] = (status == 401)

        # 1.2 User views stock summary
        status, body = await dispatch_request("GET", "/api/v1/blood-stock/summary", token=tokens["user"])
        pass_1_2 = (
            status == 200
            and "total_available_ml" in body
            and "total_reserved_ml" in body
            and "stock_by_group" in body
            and len(body["stock_by_group"]) == 8  # All 8 groups represented
        )
        results["Stock: Summary across all 8 blood groups (200 OK)"] = pass_1_2

        # =====================================================================
        # 2. LIST & GROUP QUERY ENDPOINTS
        # =====================================================================
        print("\n--- 2. LIST & GROUP QUERY ---")

        # 2.1 List all blood stocks with pagination
        status, body = await dispatch_request("GET", "/api/v1/blood-stock/?page=1&page_size=8", token=tokens["staff"])
        pass_2_1 = (
            status == 200
            and "items" in body
            and len(body["items"]) == 8
            and all("total_quantity_ml" in item for item in body["items"])
        )
        results["Stock: Paginated stock query with total volume (200 OK)"] = pass_2_1

        # 2.2 Filter by blood group (?blood_group=O%2B)
        status, body = await dispatch_request("GET", "/api/v1/blood-stock/?blood_group=O%2B", token=tokens["admin"])
        pass_2_2 = (
            status == 200
            and len(body["items"]) == 1
            and body["items"][0]["blood_group"] == "O+"
        )
        results["Stock: Filter by blood group parameter (200 OK)"] = pass_2_2

        # 2.3 Query by blood group route /group/O+
        status, body = await dispatch_request("GET", "/api/v1/blood-stock/group/O+", token=tokens["user"])
        pass_2_3 = (
            status == 200
            and body.get("blood_group") == "O+"
            and "available_quantity_ml" in body
        )
        target_stock_id = body.get("id")
        results["Stock: Direct blood group query /group/O+ (200 OK)"] = pass_2_3

        # 2.4 Query invalid blood group /group/XYZ
        status, body = await dispatch_request("GET", "/api/v1/blood-stock/group/XYZ", token=tokens["user"])
        results["Validation: Invalid blood group query returns 400 Bad Request"] = (status == 400)

        # 2.5 Query stock by ID
        status, body = await dispatch_request("GET", f"/api/v1/blood-stock/{target_stock_id}", token=tokens["user"])
        results["Stock: Query by ID /blood-stock/{id} (200 OK)"] = (
            status == 200 and body.get("id") == target_stock_id
        )

        # =====================================================================
        # 3. RBAC & MANUAL CALIBRATION (PATCH)
        # =====================================================================
        print("\n--- 3. RBAC & MANUAL CALIBRATION ---")

        # 3.1 Regular User CANNOT update blood stock (403 Forbidden)
        status, body = await dispatch_request(
            "PATCH",
            f"/api/v1/blood-stock/{target_stock_id}",
            body={"available_quantity_ml": 2000},
            token=tokens["user"],
        )
        results["RBAC: Regular user blocked from updating stock (403 Forbidden)"] = (status == 403)

        # 3.2 Staff CAN update blood stock
        status, body = await dispatch_request(
            "PATCH",
            f"/api/v1/blood-stock/{target_stock_id}",
            body={"available_quantity_ml": 1500, "reserved_quantity_ml": 500},
            token=tokens["staff"],
        )
        pass_3_2 = (
            status == 200
            and body.get("available_quantity_ml") == 1500
            and body.get("reserved_quantity_ml") == 500
            and body.get("total_quantity_ml") == 2000
        )
        results["RBAC: Staff updates stock volume (200 OK)"] = pass_3_2

        # 3.3 Negative stock validation (400 / 422)
        status, body = await dispatch_request(
            "PATCH",
            f"/api/v1/blood-stock/{target_stock_id}",
            body={"available_quantity_ml": -100},
            token=tokens["admin"],
        )
        results["Validation: Negative stock update rejected (422/400)"] = (status in [400, 422])

        # =====================================================================
        # 4. BLOOD REQUEST INTEGRATION READINESS (RESERVE, FULFILL, RELEASE)
        # =====================================================================
        print("\n--- 4. BLOOD REQUEST INTEGRATION READINESS ---")

        async with AsyncSessionLocal() as session:
            # Current O+ state: available=1500, reserved=500
            # 4.1 Reserve 450ml for blood request
            reserved_stock = await reserve_stock_for_request(session, "O+", 450)
            pass_4_1 = (
                reserved_stock.available_quantity_ml == 1050
                and reserved_stock.reserved_quantity_ml == 950
            )

            # 4.2 Attempt to reserve more than available (e.g. 2000ml when available is 1050) -> Rejected
            insufficient_caught = False
            try:
                await reserve_stock_for_request(session, "O+", 2000)
            except ValueError as ve:
                if "Insufficient available stock" in str(ve):
                    insufficient_caught = True

            # 4.3 Fulfill 450ml for blood request -> Reserved decreases by 450ml
            fulfilled_stock = await fulfill_stock_for_request(session, "O+", 450)
            pass_4_3 = (
                fulfilled_stock.available_quantity_ml == 1050
                and fulfilled_stock.reserved_quantity_ml == 500
            )

            # 4.4 Release reserved stock (e.g. 200ml released on cancel) -> Reserved -200, Available +200
            released_stock = await release_reserved_stock(session, "O+", 200)
            pass_4_4 = (
                released_stock.available_quantity_ml == 1250
                and released_stock.reserved_quantity_ml == 300
            )

        results["Request Integration: Reserve stock for request (available -> reserved)"] = pass_4_1
        results["Request Integration: Prevent over-reservation / negative available stock"] = insufficient_caught
        results["Request Integration: Fulfill request (deduct reserved volume)"] = pass_4_3
        results["Request Integration: Release reserved stock back to available"] = pass_4_4

        # =====================================================================
        # 5. CONCURRENCY & ROW-LEVEL LOCKING
        # =====================================================================
        print("\n--- 5. CONCURRENCY & ROW-LEVEL LOCKING ---")

        # Simulate concurrent attempts to reserve blood stock using separate async sessions
        async def concurrent_reserve(qty: int) -> bool:
            try:
                async with AsyncSessionLocal() as s:
                    await reserve_stock_for_request(s, "O+", qty)
                    return True
            except ValueError:
                return False

        # Available is 1250ml. If three concurrent requests each try to reserve 500ml:
        # exactly 2 should succeed (500 + 500 = 1000 <= 1250), and 1 must fail (1000 + 500 = 1500 > 1250)
        res_list = await asyncio.gather(
            concurrent_reserve(500),
            concurrent_reserve(500),
            concurrent_reserve(500),
        )
        successes = res_list.count(True)
        fails = res_list.count(False)
        pass_5 = (successes == 2 and fails == 1)

        # Check resulting DB values
        async with AsyncSessionLocal() as session:
            final_stock = await get_blood_stock_by_group(session, "O+")
            pass_5_db = (
                final_stock.available_quantity_ml == 250  # 1250 - 1000
                and final_stock.reserved_quantity_ml == 1300  # 300 + 1000
            )

        results["Concurrency: Row-level locking prevents race conditions and over-allocation"] = (
            pass_5 and pass_5_db
        )

        # Reset O+ back to clean state
        async with AsyncSessionLocal() as session:
            clean_stock = await get_blood_stock_by_group(session, "O+", for_update=True)
            clean_stock.available_quantity_ml = 0
            clean_stock.reserved_quantity_ml = 0
            await session.commit()

    finally:
        # Cleanup temporary users
        async with AsyncSessionLocal() as cleanup_session:
            for uid in created_user_ids:
                u = await cleanup_session.get(User, uid)
                if u:
                    await cleanup_session.delete(u)
            await cleanup_session.commit()
            print(f"[CLEANUP] Removed temporary test users: {created_user_ids}")

    print("\n" + "=" * 75)
    print("STEP 5 SUMMARY OF BLOOD STOCK MANAGEMENT TEST RESULTS:")
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
