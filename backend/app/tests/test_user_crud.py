import asyncio
import json
from typing import Any, Tuple

from app.main import app
from app.core.token import create_access_token
from app.core.security import hash_password
from app.database.database import AsyncSessionLocal
from app.models.user import User
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

    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": method,
        "path": path,
        "raw_path": path.encode("utf-8"),
        "query_string": b"",
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
    print("=" * 60)
    print("STARTING TEST SUITE: Step 2.8.14.4 – User Management CRUD")
    print("=" * 60)

    # 1. Setup Safe Test Users in PostgreSQL
    test_user_id = None
    clean_up_needed = []

    async with AsyncSessionLocal() as session:
        # Create a disposable test user for update & delete
        test_user = User(
            full_name="Test Subject CRUD",
            email="test.crud.subject@example.com",
            hashed_password=hash_password("TemporaryPass123!"),
            role="donor",
            is_active=True,
        )
        session.add(test_user)
        await session.commit()
        await session.refresh(test_user)
        test_user_id = test_user.id
        clean_up_needed.append(test_user_id)
        print(f"[SETUP] Created temporary test user ID: {test_user_id}")

    # Generate JWT access tokens
    # Token 1: using existing admin user (ID 1)
    admin_token = create_access_token({"sub": "1"})
    # Invalid token
    invalid_token = "invalid.bearer.token"

    test_results = {}

    try:
        # --- TEST 1: JWT Authentication Requirement (Unauthorized) ---
        print("\n--- TEST 1: JWT Authentication Requirements ---")
        status, body = await dispatch_request("GET", "/api/v1/users/")
        success_1a = status == 401
        print(f"1a. GET /api/v1/users/ without token -> Status: {status} (Expected 401)")

        status, body = await dispatch_request("GET", "/api/v1/users/", token=invalid_token)
        success_1b = status == 401
        print(f"1b. GET /api/v1/users/ with invalid token -> Status: {status} (Expected 401)")

        test_results["JWT Authentication Requirement"] = success_1a and success_1b

        # --- TEST 2: GET /api/v1/users/ (List users with valid token) ---
        print("\n--- TEST 2: GET /api/v1/users/ ---")
        status, body = await dispatch_request("GET", "/api/v1/users/", token=admin_token)
        # Check that response is list, contains test user, and password is excluded
        no_password_leaked = isinstance(body, list) and all("hashed_password" not in u for u in body)
        contains_users = isinstance(body, list) and len(body) >= 2
        success_2 = (status == 200) and no_password_leaked and contains_users
        print(f"2. GET /api/v1/users/ -> Status: {status}, Total users: {len(body) if isinstance(body, list) else 0}")
        print(f"   Hashed password excluded from response: {no_password_leaked}")
        test_results["GET /api/v1/users/"] = success_2

        # --- TEST 3: GET /api/v1/users/{user_id} (Valid user ID) ---
        print(f"\n--- TEST 3: GET /api/v1/users/{test_user_id} (Valid ID) ---")
        status, body = await dispatch_request("GET", f"/api/v1/users/{test_user_id}", token=admin_token)
        success_3 = (
            status == 200
            and isinstance(body, dict)
            and body.get("id") == test_user_id
            and "hashed_password" not in body
            and body.get("email") == "test.crud.subject@example.com"
        )
        print(f"3. GET /api/v1/users/{test_user_id} -> Status: {status}, User: {body.get('full_name') if isinstance(body, dict) else body}")
        test_results["GET /api/v1/users/{user_id} (Valid)"] = success_3

        # --- TEST 4: GET /api/v1/users/{user_id} (Invalid / Non-existent ID) ---
        invalid_id = 9999999
        print(f"\n--- TEST 4: GET /api/v1/users/{invalid_id} (Invalid ID) ---")
        status, body = await dispatch_request("GET", f"/api/v1/users/{invalid_id}", token=admin_token)
        success_4 = status == 404 and isinstance(body, dict) and body.get("detail") == "User not found"
        print(f"4. GET /api/v1/users/{invalid_id} -> Status: {status}, Detail: {body.get('detail') if isinstance(body, dict) else body}")
        test_results["GET /api/v1/users/{user_id} (Invalid ID 404)"] = success_4

        # --- TEST 5: PATCH /api/v1/users/{user_id} (Valid update) ---
        print(f"\n--- TEST 5: PATCH /api/v1/users/{test_user_id} (Valid Update) ---")
        update_payload = {
            "full_name": "Updated Test Subject",
            "role": "staff",
            "is_active": True,
        }
        status, body = await dispatch_request(
            "PATCH", f"/api/v1/users/{test_user_id}", body=update_payload, token=admin_token
        )
        # Verify in DB directly as well
        async with AsyncSessionLocal() as session:
            db_res = await session.execute(select(User).where(User.id == test_user_id))
            updated_db_user = db_res.scalar_one_or_none()
            db_verified = (
                updated_db_user is not None
                and updated_db_user.full_name == "Updated Test Subject"
                and updated_db_user.role == "staff"
            )

        success_5 = (
            status == 200
            and isinstance(body, dict)
            and body.get("full_name") == "Updated Test Subject"
            and body.get("role") == "staff"
            and "hashed_password" not in body
            and db_verified
        )
        print(f"5. PATCH /api/v1/users/{test_user_id} -> Status: {status}, DB verified: {db_verified}")
        test_results["PATCH /api/v1/users/{user_id} (Valid Update)"] = success_5

        # --- TEST 6: PATCH /api/v1/users/{user_id} (Validation Error on update) ---
        print(f"\n--- TEST 6: PATCH /api/v1/users/{test_user_id} (Validation Error) ---")
        invalid_payload = {
            "full_name": "A",  # min_length=2 required
            "role": "invalid_role",  # Literal["admin", "staff", "donor"]
        }
        status, body = await dispatch_request(
            "PATCH", f"/api/v1/users/{test_user_id}", body=invalid_payload, token=admin_token
        )
        success_6 = status == 422
        print(f"6. PATCH /api/v1/users/{test_user_id} with invalid data -> Status: {status} (Expected 422)")
        test_results["PATCH /api/v1/users/{user_id} (Schema Validation 422)"] = success_6

        # --- TEST 7: PATCH /api/v1/users/{invalid_id} (Non-existent ID) ---
        print(f"\n--- TEST 7: PATCH /api/v1/users/{invalid_id} (Non-existent ID) ---")
        status, body = await dispatch_request(
            "PATCH", f"/api/v1/users/{invalid_id}", body={"full_name": "Valid Name"}, token=admin_token
        )
        success_7 = status == 404
        print(f"7. PATCH /api/v1/users/{invalid_id} -> Status: {status} (Expected 404)")
        test_results["PATCH /api/v1/users/{user_id} (Non-existent 404)"] = success_7

        # --- TEST 8: DELETE /api/v1/users/{user_id} (Valid delete) ---
        print(f"\n--- TEST 8: DELETE /api/v1/users/{test_user_id} ---")
        status, body = await dispatch_request("DELETE", f"/api/v1/users/{test_user_id}", token=admin_token)
        
        # Verify in DB directly
        async with AsyncSessionLocal() as session:
            db_res = await session.execute(select(User).where(User.id == test_user_id))
            db_user_after_delete = db_res.scalar_one_or_none()

        success_8 = (
            status == 200
            and isinstance(body, dict)
            and body.get("message") == "User deleted successfully"
            and db_user_after_delete is None
        )
        print(f"8. DELETE /api/v1/users/{test_user_id} -> Status: {status}, Exists in DB: {db_user_after_delete is not None}")
        test_results["DELETE /api/v1/users/{user_id} (Valid Delete & DB Check)"] = success_8

        # --- TEST 9: DELETE /api/v1/users/{invalid_id} (Non-existent ID) ---
        print(f"\n--- TEST 9: DELETE /api/v1/users/{invalid_id} (Non-existent ID) ---")
        status, body = await dispatch_request("DELETE", f"/api/v1/users/{invalid_id}", token=admin_token)
        success_9 = status == 404
        print(f"9. DELETE /api/v1/users/{invalid_id} -> Status: {status} (Expected 404)")
        test_results["DELETE /api/v1/users/{user_id} (Non-existent 404)"] = success_9

    finally:
        # Cleanup any remaining test user safely
        async with AsyncSessionLocal() as cleanup_session:
            for uid in clean_up_needed:
                res = await cleanup_session.execute(select(User).where(User.id == uid))
                u = res.scalar_one_or_none()
                if u:
                    await cleanup_session.delete(u)
                    await cleanup_session.commit()
                    print(f"[CLEANUP] Cleaned up temporary test user ID: {uid}")

    print("\n" + "=" * 60)
    print("FINAL SUMMARY OF RESULTS:")
    print("=" * 60)
    all_passed = True
    for test_name, passed in test_results.items():
        status_label = "SUCCESS" if passed else "FAILED"
        if not passed:
            all_passed = False
        print(f"[{status_label}] - {test_name}")
    print("=" * 60)
    print("ALL TESTS PASSED!" if all_passed else "SOME TESTS FAILED!")


if __name__ == "__main__":
    asyncio.run(main())

