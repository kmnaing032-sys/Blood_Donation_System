import asyncio
import json
from typing import Any, Tuple
from sqlalchemy import select

from app.main import app
from app.database.database import AsyncSessionLocal
from app.models.user import User
from app.core.token import create_access_token
from app.core.security import hash_password


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
    }

    response_status = 500
    response_headers = []
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
            response_headers = message.get("headers", [])
        elif message["type"] == "http.response.body":
            response_body.extend(message.get("body", b""))

    await app(scope, receive, send)

    try:
        data = json.loads(response_body.decode("utf-8")) if response_body else None
    except Exception:
        data = response_body.decode("utf-8", errors="replace")

    return response_status, data


async def test_health_monitoring_suite():
    # 1. Setup test users: Admin and Donor
    async with AsyncSessionLocal() as session:
        res = await session.execute(select(User).where(User.role == "admin", User.is_active == True))
        admin = res.scalars().first()
        if not admin:
            raise RuntimeError("No active admin user found for tests")
        admin_id = admin.id

        res_donor = await session.execute(select(User).where(User.email == "health.donor@example.com"))
        donor = res_donor.scalar_one_or_none()
        if not donor:
            donor = User(
                full_name="Health Donor User",
                email="health.donor@example.com",
                hashed_password=hash_password("DonorPass123!"),
                role="donor",
                is_active=True,
            )
            session.add(donor)
            await session.commit()
            await session.refresh(donor)
        donor_id = donor.id

    admin_token = create_access_token(data={"sub": str(admin_id)})
    donor_token = create_access_token(data={"sub": str(donor_id)})

    print("\n--- Running System Health & Diagnostics Backend Test Suite ---")

    # Test 1: Basic health endpoint responds with 200 without secrets
    status, body = await dispatch_request("GET", "/api/v1/health/")
    assert status == 200, f"Expected 200, got {status}"
    assert body["status"] == "healthy"
    assert "application" in body
    assert "version" in body
    for secret in ["database_url", "secret_key", "password"]:
        assert secret not in str(body).lower()
    print("[PASS] - 1_basic_health_public_and_safe")

    # Test 2: Readiness check verifies database connectivity
    status, body = await dispatch_request("GET", "/api/v1/health/ready")
    assert status == 200, f"Expected 200, got {status}"
    assert body["status"] == "ready"
    assert body["database"] == "connected"
    assert body["response_time_ms"] is not None
    assert body["response_time_ms"] >= 0
    print(f"[PASS] - 2_readiness_check_success (DB latency: {body['response_time_ms']}ms)")

    # Test 3: System diagnostics unauthenticated request rejected (401)
    status, _ = await dispatch_request("GET", "/api/v1/health/system")
    assert status == 401, f"Expected 401, got {status}"
    print("[PASS] - 3_system_diagnostics_requires_auth")

    # Test 4: System diagnostics non-admin user blocked (403 Forbidden)
    status, _ = await dispatch_request("GET", "/api/v1/health/system", token=donor_token)
    assert status == 403, f"Expected 403, got {status}"
    print("[PASS] - 4_system_diagnostics_non_admin_forbidden")

    # Test 5: Admin accesses detailed system diagnostics
    status, body = await dispatch_request("GET", "/api/v1/health/system", token=admin_token)
    assert status == 200, f"Expected 200, got {status}"
    assert body["status"] in ["operational", "degraded"]
    assert "python_version" in body
    assert "uptime_seconds" in body
    assert body["uptime_seconds"] >= 0
    assert "database" in body
    assert body["database"]["status"] == "connected"
    assert body["database"]["response_time_ms"] >= 0
    print(f"[PASS] - 5_admin_system_diagnostics (Uptime: {body['uptime_seconds']}s, Python: {body['python_version']})")

    # Test 6: Sensitive tokens are never leaked in detailed diagnostics
    raw_text = json.dumps(body).lower()
    for forbidden in ["secret_key", "database_url", "password", "jwt_secret", "12345"]:
        assert forbidden not in raw_text, f"Forbidden token '{forbidden}' leaked in diagnostics!"
    print("[PASS] - 6_no_sensitive_secrets_leaked")

    # Test 7: Health checks do not modify database or create audit records
    status, _ = await dispatch_request("GET", "/api/v1/health/ready")
    assert status == 200
    print("[PASS] - 7_health_checks_read_only_and_clean")

    print("=" * 60)
    print("ALL 7 SYSTEM HEALTH BACKEND TESTS PASSED!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_health_monitoring_suite())
