import asyncio
import json
import pytest
from typing import Any, Tuple

from app.main import app
from app.core.token import create_access_token, create_refresh_token
from app.core.security import hash_password, verify_password
from app.database.database import AsyncSessionLocal
from app.models.user import User
from app.models.refresh_token import RefreshToken
from app.api.v1.endpoints.auth import save_refresh_token
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


@pytest.mark.asyncio
async def test_password_management_flows():
    print("=" * 60)
    print("RUNNING PASSWORD MANAGEMENT TESTS (SELF-SERVICE & ADMIN RESET)")
    print("=" * 60)

    emails_to_cleanup = [
        "pwd_test_admin@example.com",
        "pwd_test_staff@example.com",
        "pwd_test_donor@example.com",
        "pwd_test_user@example.com",
    ]

    async with AsyncSessionLocal() as session:
        # Cleanup any previous artifacts
        await session.execute(
            delete(User).where(User.email.in_(emails_to_cleanup))
        )
        await session.commit()

        # Create 4 test users for each role
        admin_u = User(
            full_name="Pwd Admin",
            email="pwd_test_admin@example.com",
            hashed_password=hash_password("OldAdminPass123!"),
            role="admin",
            is_active=True,
        )
        staff_u = User(
            full_name="Pwd Staff",
            email="pwd_test_staff@example.com",
            hashed_password=hash_password("OldStaffPass123!"),
            role="staff",
            is_active=True,
        )
        donor_u = User(
            full_name="Pwd Donor",
            email="pwd_test_donor@example.com",
            hashed_password=hash_password("OldDonorPass123!"),
            role="donor",
            is_active=True,
        )
        user_u = User(
            full_name="Pwd User",
            email="pwd_test_user@example.com",
            hashed_password=hash_password("OldUserPass123!"),
            role="user",
            is_active=True,
        )
        session.add_all([admin_u, staff_u, donor_u, user_u])
        await session.commit()
        await session.refresh(admin_u)
        await session.refresh(staff_u)
        await session.refresh(donor_u)
        await session.refresh(user_u)

        admin_id = admin_u.id
        staff_id = staff_u.id
        donor_id = donor_u.id
        user_id = user_u.id

        # Seed an active refresh token for donor to verify revocation
        rt = create_refresh_token(data={"sub": str(donor_id)})
        await save_refresh_token(session, donor_id, rt)
        await session.commit()

    # Generate JWT access tokens
    admin_token = create_access_token(data={"sub": str(admin_id)})
    staff_token = create_access_token(data={"sub": str(staff_id)})
    donor_token = create_access_token(data={"sub": str(donor_id)})
    user_token = create_access_token(data={"sub": str(user_id)})

    # 1. Unauthenticated change-password is rejected
    status, res = await dispatch_request(
        "POST",
        "/api/v1/auth/change-password",
        body={
            "current_password": "OldAdminPass123!",
            "new_password": "NewAdminPass123!",
            "confirm_password": "NewAdminPass123!",
        },
    )
    assert status == 401, f"Expected 401, got {status}: {res}"

    # 2. Incorrect current password is rejected
    status, res = await dispatch_request(
        "POST",
        "/api/v1/auth/change-password",
        body={
            "current_password": "WrongPassword123!",
            "new_password": "NewAdminPass123!",
            "confirm_password": "NewAdminPass123!",
        },
        token=admin_token,
    )
    assert status == 400, f"Expected 400, got {status}: {res}"
    assert "Incorrect current password" in res.get("detail", "")

    # 3. Mismatched confirmation is rejected
    status, res = await dispatch_request(
        "POST",
        "/api/v1/auth/change-password",
        body={
            "current_password": "OldAdminPass123!",
            "new_password": "NewAdminPass123!",
            "confirm_password": "DifferentPass123!",
        },
        token=admin_token,
    )
    assert status == 400, f"Expected 400, got {status}: {res}"
    assert "do not match" in res.get("detail", "")

    # 4. Weak password is rejected (no special char or no uppercase)
    status, res = await dispatch_request(
        "POST",
        "/api/v1/auth/change-password",
        body={
            "current_password": "OldAdminPass123!",
            "new_password": "weakpassword123",
            "confirm_password": "weakpassword123",
        },
        token=admin_token,
    )
    assert status == 422, f"Expected 422, got {status}: {res}"

    # 5. Admin can change own password
    status, res = await dispatch_request(
        "POST",
        "/api/v1/auth/change-password",
        body={
            "current_password": "OldAdminPass123!",
            "new_password": "NewAdminPass123!",
            "confirm_password": "NewAdminPass123!",
        },
        token=admin_token,
    )
    assert status == 200, f"Expected 200, got {status}: {res}"
    assert "Password changed successfully" in res.get("message", "")

    # 6. Staff can change own password
    status, res = await dispatch_request(
        "POST",
        "/api/v1/auth/change-password",
        body={
            "current_password": "OldStaffPass123!",
            "new_password": "NewStaffPass123!",
            "confirm_password": "NewStaffPass123!",
        },
        token=staff_token,
    )
    assert status == 200, f"Expected 200, got {status}: {res}"

    # 7. Donor can change own password + verify refresh tokens revoked
    status, res = await dispatch_request(
        "POST",
        "/api/v1/auth/change-password",
        body={
            "current_password": "OldDonorPass123!",
            "new_password": "NewDonorPass123!",
            "confirm_password": "NewDonorPass123!",
        },
        token=donor_token,
    )
    assert status == 200, f"Expected 200, got {status}: {res}"

    async with AsyncSessionLocal() as session:
        # Check active tokens for donor are revoked
        tokens = (
            await session.execute(
                select(RefreshToken).where(
                    RefreshToken.user_id == donor_id,
                    RefreshToken.revoked_at.is_(None),
                )
            )
        ).scalars().all()
        assert len(tokens) == 0, "All previous refresh tokens should be revoked"

    # 8. User can change own password
    status, res = await dispatch_request(
        "POST",
        "/api/v1/auth/change-password",
        body={
            "current_password": "OldUserPass123!",
            "new_password": "NewUserPass123!",
            "confirm_password": "NewUserPass123!",
        },
        token=user_token,
    )
    assert status == 200, f"Expected 200, got {status}: {res}"

    # 9. Non-admin (Staff) cannot reset another user's password (403)
    status, res = await dispatch_request(
        "POST",
        f"/api/v1/users/{donor_id}/reset-password",
        body={
            "new_password": "ResetPass123!",
            "confirm_password": "ResetPass123!",
        },
        token=staff_token,
    )
    assert status == 403, f"Expected 403, got {status}: {res}"

    # 10. Non-admin (Donor) cannot reset another user's password (403)
    status, res = await dispatch_request(
        "POST",
        f"/api/v1/users/{user_id}/reset-password",
        body={
            "new_password": "ResetPass123!",
            "confirm_password": "ResetPass123!",
        },
        token=donor_token,
    )
    assert status == 403, f"Expected 403, got {status}: {res}"

    # 11. Admin can reset another user's password (Donor)
    status, res = await dispatch_request(
        "POST",
        f"/api/v1/users/{donor_id}/reset-password",
        body={
            "new_password": "AdminResetDonor123!",
            "confirm_password": "AdminResetDonor123!",
        },
        token=admin_token,
    )
    assert status == 200, f"Expected 200, got {status}: {res}"
    assert "was reset successfully" in res.get("message", "")

    # 12. Password hash verification in DB & verify plaintext/hashes never exposed
    async with AsyncSessionLocal() as session:
        donor_db = (
            await session.execute(select(User).where(User.id == donor_id))
        ).scalar_one()
        assert verify_password("AdminResetDonor123!", donor_db.hashed_password)
        assert "hashed_password" not in res
        assert "password" not in res

    # 13. Admin reset with invalid target user ID (404)
    status, res = await dispatch_request(
        "POST",
        "/api/v1/users/9999999/reset-password",
        body={
            "new_password": "AdminResetDonor123!",
            "confirm_password": "AdminResetDonor123!",
        },
        token=admin_token,
    )
    assert status == 404, f"Expected 404, got {status}: {res}"

    # 14. Verify rate limiting on both password endpoints
    # auth:change-password allows 15 requests per 60s
    for _ in range(16):
        status, res = await dispatch_request(
            "POST",
            "/api/v1/auth/change-password",
            body={
                "current_password": "OldAdminPass123!",
                "new_password": "NewAdminPass123!",
                "confirm_password": "NewAdminPass123!",
            },
            token=admin_token,
        )
    # The 16th attempt should be rate limited (429)
    assert status == 429, f"Expected rate limit (429) on change-password, got {status}: {res}"

    # users:reset-password allows 20 requests per 60s
    for _ in range(21):
        status, res = await dispatch_request(
            "POST",
            f"/api/v1/users/{donor_id}/reset-password",
            body={
                "new_password": "AdminResetDonor123!",
                "confirm_password": "AdminResetDonor123!",
            },
            token=admin_token,
        )
    assert status == 429, f"Expected rate limit (429) on admin reset-password, got {status}: {res}"

    # Cleanup test users
    async with AsyncSessionLocal() as session:
        await session.execute(
            delete(User).where(User.email.in_(emails_to_cleanup))
        )
        await session.commit()

    print("All backend password management tests passed successfully!")


if __name__ == "__main__":
    asyncio.run(test_password_management_flows())
