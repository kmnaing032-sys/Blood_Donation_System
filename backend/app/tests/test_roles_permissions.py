import asyncio
import json
from typing import Any, Tuple

from app.main import app
from app.core.token import create_access_token, create_refresh_token
from app.core.security import hash_password
from app.database.database import AsyncSessionLocal
from app.models.user import User
from app.models.refresh_token import RefreshToken
from app.api.v1.endpoints.auth import save_refresh_token
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
    print("=" * 70)
    print("STEP 2.8.15: ROLE & PERMISSION TEST SUITE (Admin, Staff, User)")
    print("=" * 70)

    test_users = {}
    created_user_ids = []

    # 1. Setup Test Users: Admin, Staff, User (Donor)
    async with AsyncSessionLocal() as session:
        # Get any existing active admin
        res = await session.execute(select(User).where(User.role == "admin", User.is_active == True))
        existing_admin = res.scalars().first()
        if not existing_admin:
            raise RuntimeError("No active admin user found in the database")
        test_users["admin_1"] = existing_admin.id

        # Create a second temporary Admin to test deletion/last-admin rules safely
        temp_admin = User(
            full_name="Temp Second Admin",
            email="temp.admin2@example.com",
            hashed_password=hash_password("AdminPass123!"),
            role="admin",
            is_active=True,
        )
        session.add(temp_admin)

        # Create temporary Staff
        temp_staff = User(
            full_name="Hospital Staff Member",
            email="temp.staff@example.com",
            hashed_password=hash_password("StaffPass123!"),
            role="staff",
            is_active=True,
        )
        session.add(temp_staff)

        # Create temporary User / Donor
        temp_user = User(
            full_name="Regular Donor User",
            email="temp.donor@example.com",
            hashed_password=hash_password("UserPass123!"),
            role="donor",
            is_active=True,
        )
        session.add(temp_user)

        await session.commit()
        await session.refresh(temp_admin)
        await session.refresh(temp_staff)
        await session.refresh(temp_user)

        test_users["admin_2"] = temp_admin.id
        test_users["staff"] = temp_staff.id
        test_users["user"] = temp_user.id
        created_user_ids.extend([temp_admin.id, temp_staff.id, temp_user.id])
        print(f"[SETUP] Created temporary users: admin_2={temp_admin.id}, staff={temp_staff.id}, user={temp_user.id}")

    # Generate JWT Tokens
    tokens = {
        "admin_1": create_access_token({"sub": str(test_users["admin_1"])}),
        "admin_2": create_access_token({"sub": str(test_users["admin_2"])}),
        "staff": create_access_token({"sub": str(test_users["staff"])}),
        "user": create_access_token({"sub": str(test_users["user"])}),
    }

    results = {}

    try:
        # =====================================================================
        # PART A: ADMIN PERMISSION TESTS
        # =====================================================================
        print("\n--- PART A: ADMIN PERMISSIONS ---")

        # A1: Admin can access /admin-check
        status, body = await dispatch_request("GET", "/api/v1/auth/admin-check", token=tokens["admin_1"])
        pass_a1 = (status == 200 and body.get("message") == "Welcome Admin")
        results["Admin: GET /admin-check (200 OK)"] = pass_a1

        # A2: Admin can access GET /api/v1/users/
        status, body = await dispatch_request("GET", "/api/v1/users/", token=tokens["admin_1"])
        pass_a2 = (status == 200 and isinstance(body, list) and len(body) >= 4)
        results["Admin: View all users GET /api/v1/users/ (200 OK)"] = pass_a2

        # A3: Admin can view any user by ID
        status, body = await dispatch_request("GET", f"/api/v1/users/{test_users['user']}", token=tokens["admin_1"])
        pass_a3 = (status == 200 and body.get("id") == test_users["user"])
        results["Admin: View any user by ID (200 OK)"] = pass_a3

        # A4: Admin can update another user's info & role
        status, body = await dispatch_request(
            "PATCH",
            f"/api/v1/users/{test_users['user']}",
            body={"full_name": "Updated Regular Donor", "role": "staff"},
            token=tokens["admin_1"],
        )
        pass_a4 = (status == 200 and body.get("full_name") == "Updated Regular Donor" and body.get("role") == "staff")
        results["Admin: Update another user (200 OK)"] = pass_a4

        # Revert role back to donor for downstream tests
        await dispatch_request(
            "PATCH",
            f"/api/v1/users/{test_users['user']}",
            body={"role": "donor"},
            token=tokens["admin_1"],
        )

        # =====================================================================
        # PART B: STAFF PERMISSION TESTS
        # =====================================================================
        print("\n--- PART B: STAFF PERMISSIONS ---")

        # B1: Staff can access /staff-check
        status, body = await dispatch_request("GET", "/api/v1/auth/staff-check", token=tokens["staff"])
        pass_b1 = (status == 200 and body.get("message") == "Staff access granted")
        results["Staff: GET /staff-check (200 OK)"] = pass_b1

        # B2: Staff CANNOT access /admin-check (403 Forbidden)
        status, body = await dispatch_request("GET", "/api/v1/auth/admin-check", token=tokens["staff"])
        pass_b2 = (status == 403)
        results["Staff: Blocked from /admin-check (403 Forbidden)"] = pass_b2

        # B3: Staff CANNOT view all users GET /api/v1/users/ (403 Forbidden)
        status, body = await dispatch_request("GET", "/api/v1/users/", token=tokens["staff"])
        pass_b3 = (status == 403)
        results["Staff: Blocked from viewing all users (403 Forbidden)"] = pass_b3

        # B4: Staff CANNOT update another user (403 Forbidden)
        status, body = await dispatch_request(
            "PATCH",
            f"/api/v1/users/{test_users['user']}",
            body={"full_name": "Staff Attempted Change"},
            token=tokens["staff"],
        )
        pass_b4 = (status == 403)
        results["Staff: Blocked from updating other users (403 Forbidden)"] = pass_b4

        # B5: Staff CANNOT delete another user (403 Forbidden)
        status, body = await dispatch_request(
            "DELETE",
            f"/api/v1/users/{test_users['user']}",
            token=tokens["staff"],
        )
        pass_b5 = (status == 403)
        results["Staff: Blocked from deleting users (403 Forbidden)"] = pass_b5

        # =====================================================================
        # PART C: USER / DONOR PERMISSION TESTS
        # =====================================================================
        print("\n--- PART C: REGULAR USER PERMISSIONS ---")

        # C1: User CANNOT access /admin-check (403 Forbidden)
        status, body = await dispatch_request("GET", "/api/v1/auth/admin-check", token=tokens["user"])
        pass_c1 = (status == 403)
        results["User: Blocked from /admin-check (403 Forbidden)"] = pass_c1

        # C2: User CANNOT access /staff-check (403 Forbidden)
        status, body = await dispatch_request("GET", "/api/v1/auth/staff-check", token=tokens["user"])
        pass_c2 = (status == 403)
        results["User: Blocked from /staff-check (403 Forbidden)"] = pass_c2

        # C3: User CANNOT view all users (403 Forbidden)
        status, body = await dispatch_request("GET", "/api/v1/users/", token=tokens["user"])
        pass_c3 = (status == 403)
        results["User: Blocked from viewing all users (403 Forbidden)"] = pass_c3

        # C4: User CANNOT view another user's profile (403 Forbidden)
        status, body = await dispatch_request("GET", f"/api/v1/users/{test_users['admin_1']}", token=tokens["user"])
        pass_c4 = (status == 403)
        results["User: Blocked from viewing other user profile (403 Forbidden)"] = pass_c4

        # C5: User CAN view their OWN profile
        status, body = await dispatch_request("GET", f"/api/v1/users/{test_users['user']}", token=tokens["user"])
        pass_c5 = (status == 200 and body.get("id") == test_users["user"])
        results["User: Allowed to view own profile (200 OK)"] = pass_c5

        # C6: User CANNOT change their own role (self-promotion attempt blocked: 403)
        status, body = await dispatch_request(
            "PATCH",
            f"/api/v1/users/{test_users['user']}",
            body={"role": "admin"},
            token=tokens["user"],
        )
        pass_c6 = (status == 403)
        results["User: Prevented from self-promotion to admin (403 Forbidden)"] = pass_c6

        # C7: User CAN update their own name/email (non-role fields)
        status, body = await dispatch_request(
            "PATCH",
            f"/api/v1/users/{test_users['user']}",
            body={"full_name": "My Valid New Name"},
            token=tokens["user"],
        )
        pass_c7 = (status == 200 and body.get("full_name") == "My Valid New Name")
        results["User: Allowed to update own profile fields (200 OK)"] = pass_c7

        # C8: User CANNOT delete users (403 Forbidden)
        status, body = await dispatch_request("DELETE", f"/api/v1/users/{test_users['user']}", token=tokens["user"])
        pass_c8 = (status == 403)
        results["User: Blocked from deleting users (403 Forbidden)"] = pass_c8

        # =====================================================================
        # PART D: SAFEGUARDS & EDGE CASES (Last Admin Protection & Self-Role Change)
        # =====================================================================
        print("\n--- PART D: SAFEGUARDS ---")

        # D1: Admin cannot change their OWN role
        status, body = await dispatch_request(
            "PATCH",
            f"/api/v1/users/{test_users['admin_1']}",
            body={"role": "donor"},
            token=tokens["admin_1"],
        )
        pass_d1 = (status == 403)
        results["Admin: Prevented from changing own role (403 Forbidden)"] = pass_d1

        # D2: Delete temporary admin_2 while admin_1 is still active -> Allowed
        status, body = await dispatch_request(
            "DELETE",
            f"/api/v1/users/{test_users['admin_2']}",
            token=tokens["admin_1"],
        )
        pass_d2 = (status == 200 and body.get("message") == "User deleted successfully")
        results["Admin: Delete admin when another active admin exists (200 OK)"] = pass_d2

        # D3: Attempt to delete the LAST remaining active admin (admin_1) -> Blocked (400 Bad Request)
        status, body = await dispatch_request(
            "DELETE",
            f"/api/v1/users/{test_users['admin_1']}",
            token=tokens["admin_1"],
        )
        pass_d3 = (status == 400 and "last active administrator" in str(body))
        results["Safeguard: Block deleting the last active admin (400 Bad Request)"] = pass_d3

        # D4: Registration never automatically promotes user to Admin
        status, body = await dispatch_request(
            "POST",
            "/api/v1/auth/register",
            body={
                "full_name": "New Registered Member",
                "email": "new.member.donor@example.com",
                "password": "ValidPassword123!",
            },
        )
        pass_d4 = (status == 201 and body.get("role") == "donor")
        if pass_d4 and body.get("id"):
            created_user_ids.append(body["id"])
        results["Registration: Automatically defaults to 'donor', never 'admin'"] = pass_d4

        # =====================================================================
        # PART E: JWT & REFRESH TOKEN ROTATION VERIFICATION
        # =====================================================================
        print("\n--- PART E: JWT & REFRESH TOKEN ROTATION ---")

        # E1: Normal login and receive access & refresh tokens
        status, login_res = await dispatch_request(
            "POST",
            "/api/v1/auth/login",
            body={"email": "new.member.donor@example.com", "password": "ValidPassword123!"},
        )
        pass_e1 = (
            status == 200
            and "access_token" in login_res
            and "refresh_token" in login_res
        )
        results["Auth: Login generates access and refresh tokens (200 OK)"] = pass_e1

        # E2: Refresh token rotation
        refresh_token = login_res["refresh_token"]
        status, rot_res = await dispatch_request(
            "POST",
            "/api/v1/auth/refresh",
            body={"refresh_token": refresh_token},
        )
        pass_e2 = (
            status == 200
            and "access_token" in rot_res
            and "refresh_token" in rot_res
            and rot_res["refresh_token"] != refresh_token
        )
        results["Auth: Refresh token rotation returns new pair (200 OK)"] = pass_e2

        # E3: Replay of old refresh token is rejected (Revoked: 401)
        status, replay_res = await dispatch_request(
            "POST",
            "/api/v1/auth/refresh",
            body={"refresh_token": refresh_token},
        )
        pass_e3 = (status == 401)
        results["Auth: Revoked refresh token replay rejected (401 Unauthorized)"] = pass_e3

    finally:
        # Cleanup temporary users created
        async with AsyncSessionLocal() as cleanup_session:
            for uid in created_user_ids:
                res = await cleanup_session.execute(select(User).where(User.id == uid))
                u = res.scalar_one_or_none()
                if u:
                    await cleanup_session.delete(u)
            await cleanup_session.commit()
            print(f"[CLEANUP] Safely removed temporary test user IDs: {created_user_ids}")

    print("\n" + "=" * 70)
    print("STEP 2.8.15 SUMMARY OF PERMISSION TEST RESULTS:")
    print("=" * 70)
    all_success = True
    for name, passed in results.items():
        status_tag = "SUCCESS" if passed else "FAILED"
        if not passed:
            all_success = False
        print(f"[{status_tag}] - {name}")
    print("=" * 70)
    print("ALL TESTS COMPLETED SUCCESSFULLY!" if all_success else "SOME TESTS FAILED!")


if __name__ == "__main__":
    asyncio.run(main())

