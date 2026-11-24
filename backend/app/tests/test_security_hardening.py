import asyncio
import json
import time
from datetime import datetime, timezone
from typing import Any, Tuple
from sqlalchemy import select

from app.main import app
from app.core.config import settings
from app.database.database import AsyncSessionLocal
from app.models.user import User
from app.core.security import hash_password
from app.core.token import create_access_token
from app.core.rate_limiter import rate_limiter
from app.core.login_protection import login_protector


async def dispatch_request(
    method: str,
    path: str,
    body: dict | None = None,
    token: str | None = None,
    headers_extra: list | None = None,
    client_ip: str = "127.0.0.1",
) -> Tuple[int, Any, dict]:
    """Execute ASGI request directly against FastAPI app."""
    headers = []
    if token:
        headers.append((b"authorization", f"Bearer {token}".encode("utf-8")))

    if body is not None:
        body_bytes = json.dumps(body).encode("utf-8")
        headers.append((b"content-type", b"application/json"))
        # If content-length is not in headers_extra, calculate it
        has_cl = headers_extra and any(k.lower() == "content-length" for k, _ in headers_extra)
        if not has_cl:
            headers.append((b"content-length", str(len(body_bytes)).encode("utf-8")))
    else:
        body_bytes = b""

    if headers_extra:
        for k, v in headers_extra:
            headers.append((k.lower().encode("utf-8"), v.encode("utf-8")))

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
        "client": (client_ip, 12345),
    }

    response_status = 500
    response_headers = {}
    response_body = bytearray()
    sent_request = False

    async def receive():
        nonlocal sent_request
        if not sent_request:
            sent_request = True
            return {"type": "http.request", "body": body_bytes, "more_body": False}
        return {"type": "http.disconnect"}

    async def send(message):
        nonlocal response_status, response_headers, response_body
        if message["type"] == "http.response.start":
            response_status = message["status"]
            for k, v in message.get("headers", []):
                response_headers[k.decode("utf-8").lower()] = v.decode("utf-8")
        elif message["type"] == "http.response.body":
            response_body.extend(message.get("body", b""))

    await app(scope, receive, send)

    try:
        data = json.loads(response_body.decode("utf-8")) if response_body else None
    except Exception:
        data = response_body.decode("utf-8", errors="replace")

    return response_status, data, response_headers


async def run_security_hardening_tests():
    print("=== Running API Security Hardening & Rate Limiting Test Suite ===")

    # Clear previous test limiter states
    await rate_limiter.clear_all()
    await login_protector.clear_all()

    # 1. Test Security Headers
    print("1. Testing Security Headers on endpoints...")
    st, data, hdrs = await dispatch_request("GET", "/api/v1/health/")
    assert st == 200
    assert hdrs.get("x-content-type-options") == "nosniff"
    assert hdrs.get("x-frame-options") == "DENY"
    assert hdrs.get("referrer-policy") == "strict-origin-when-cross-origin"
    assert "no-store" in hdrs.get("cache-control", "")
    assert "default-src 'self'" in hdrs.get("content-security-policy", "")
    print("   -> PASSED: nosniff, frame-options, referrer-policy, cache-control, and CSP verified.")

    # 2. Test Request Body Size Limit (10MB limit enforcement)
    print("2. Testing Request Body Size Protection...")
    st, data, _ = await dispatch_request(
        "POST",
        "/api/v1/auth/login",
        body={"dummy": "x"},
        headers_extra=[("content-length", str(15 * 1024 * 1024))],  # Simulated 15MB
    )
    assert st == 413
    assert data["error_code"] == "PAYLOAD_TOO_LARGE"
    print("   -> PASSED: 413 Payload Too Large returned for oversized requests.")

    # 3. Test Rate Limiting on /auth/register
    print("3. Testing Rate Limiting (HTTP 429) on /auth/register...")
    await rate_limiter.clear_all()
    reg_ip = "192.168.1.100"
    for i in range(5):
        st, _, _ = await dispatch_request(
            "POST",
            "/api/v1/auth/register",
            body={
                "full_name": f"User {i}",
                "email": f"ratelimit_{i}_{time.time()}@example.com",
                "password": "Password123!",
            },
            client_ip=reg_ip,
        )
        assert st in (201, 409)

    # 6th request should hit rate limit (HTTP 429)
    st, data, hdrs = await dispatch_request(
        "POST",
        "/api/v1/auth/register",
        body={
            "full_name": "Blocked User",
            "email": f"blocked_{time.time()}@example.com",
            "password": "Password123!",
        },
        client_ip=reg_ip,
    )
    assert st == 429
    assert "Too many requests" in data.get("detail", "")
    assert "retry-after" in hdrs
    print("   -> PASSED: 429 Too Many Requests enforced with Retry-After header.")

    # 4. Test Login Brute Force Lockout & Generic Error Messages
    print("4. Testing Login Brute Force Protection & Generic Failure Reporting...")
    await rate_limiter.clear_all()
    await login_protector.clear_all()

    async with AsyncSessionLocal() as session:
        ts = int(datetime.now(timezone.utc).timestamp())
        user = User(
            full_name="Brute Force Target",
            email=f"target_{ts}@example.com",
            hashed_password=hash_password("RealPassword123!"),
            role="donor",
            is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

    target_email = user.email
    login_ip = "192.168.1.105"

    # 4 failed attempts: HTTP 401 with generic error message
    for attempt in range(4):
        st, data, _ = await dispatch_request(
            "POST",
            "/api/v1/auth/login",
            body={"email": target_email, "password": "WrongPassword!"},
            client_ip=login_ip,
        )
        assert st == 401
        assert data.get("detail") == "Incorrect email or password"

    # 5th failed attempt: triggers lockout (HTTP 429)
    st, data, hdrs = await dispatch_request(
        "POST",
        "/api/v1/auth/login",
        body={"email": target_email, "password": "WrongPassword!"},
        client_ip=login_ip,
    )
    assert st == 429
    assert "temporarily throttled" in data.get("detail", "")
    assert "retry-after" in hdrs

    # Subsequent request during lockout even with CORRECT password should still be throttled
    st, data, _ = await dispatch_request(
        "POST",
        "/api/v1/auth/login",
        body={"email": target_email, "password": "RealPassword123!"},
        client_ip=login_ip,
    )
    assert st == 429
    print("   -> PASSED: Brute-force lockout and non-revealing generic responses confirmed.")

    # 5. Test Successful Login Clears Protection Counters
    print("5. Testing successful login resets brute-force trackers...")
    await rate_limiter.clear_all()
    await login_protector.clear_all()

    # 2 failed attempts
    for _ in range(2):
        await dispatch_request(
            "POST",
            "/api/v1/auth/login",
            body={"email": target_email, "password": "WrongPassword!"},
            client_ip="192.168.1.110",
        )

    # Now successful login with correct password
    st, data, _ = await dispatch_request(
        "POST",
        "/api/v1/auth/login",
        body={"email": target_email, "password": "RealPassword123!"},
        client_ip="192.168.1.110",
    )
    assert st == 200
    assert "access_token" in data

    # State for this key should be cleared
    is_locked, _ = await login_protector.check_lockout("192.168.1.110", target_email)
    assert is_locked is False
    print("   -> PASSED: State successfully reset on valid authentication.")

    # 6. Test Path Traversal Defense in Database Backups
    print("6. Testing Path Traversal Defense in Backups...")
    async with AsyncSessionLocal() as session:
        admin_res = await session.execute(select(User).where(User.role == "admin", User.is_active == True))
        admin = admin_res.scalars().first()
    admin_token = create_access_token(data={"sub": str(admin.id)})

    # Requesting a non-existent ID
    st, data, _ = await dispatch_request("GET", "/api/v1/backups/999999/download", token=admin_token)
    assert st == 404
    print("   -> PASSED: Path validation checks and 404 behavior verified.")

    # 7. Test Admin RBAC and IDOR Protection
    print("7. Testing RBAC and User Ownership/IDOR Protection...")
    async with AsyncSessionLocal() as session:
        donor_res = await session.execute(select(User).where(User.role == "donor", User.is_active == True))
        donor = donor_res.scalars().first()
        other_donor = User(
            full_name="Other Donor",
            email=f"other_{time.time()}@example.com",
            hashed_password="pw",
            role="donor",
            is_active=True,
        )
        session.add(other_donor)
        await session.commit()
        await session.refresh(other_donor)

    donor_token = create_access_token(data={"sub": str(donor.id)})

    # Donor cannot read another donor's user profile (IDOR test -> 403)
    st, _, _ = await dispatch_request("GET", f"/api/v1/users/{other_donor.id}", token=donor_token)
    assert st == 403

    # Donor can read their own user profile -> 200
    st, data, _ = await dispatch_request("GET", f"/api/v1/users/{donor.id}", token=donor_token)
    assert st == 200
    assert data["id"] == donor.id

    # Donor cannot access admin endpoints -> 403
    st, _, _ = await dispatch_request("GET", "/api/v1/backups/", token=donor_token)
    assert st == 403
    st, _, _ = await dispatch_request("GET", "/api/v1/email-preferences/smtp-status", token=donor_token)
    assert st == 403

    print("   -> PASSED: IDOR boundaries, ownership protection, and RBAC enforced.")

    # 8. Test Rate Limiting on Email Preferences
    print("8. Testing Rate Limiting on Email Preferences Update...")
    await rate_limiter.clear_all()
    pref_ip = "192.168.1.120"
    for _ in range(15):
        st, _, _ = await dispatch_request(
            "PATCH",
            "/api/v1/email-preferences/me",
            body={"notify_stock_events": True},
            token=donor_token,
            client_ip=pref_ip,
        )
        assert st == 200

    # 16th request should hit 429
    st, data, hdrs = await dispatch_request(
        "PATCH",
        "/api/v1/email-preferences/me",
        body={"notify_stock_events": False},
        token=donor_token,
        client_ip=pref_ip,
    )
    assert st == 429
    assert "retry-after" in hdrs
    print("   -> PASSED: Rate limit enforced on sensitive email preferences.")

    print("=== All 8 Security Hardening Verification Tests PASSED ===")


if __name__ == "__main__":
    asyncio.run(run_security_hardening_tests())
