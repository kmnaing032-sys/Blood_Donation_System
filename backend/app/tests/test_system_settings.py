import asyncio
import json
from typing import Any, Tuple
from sqlalchemy import select

from app.main import app
from app.database.database import AsyncSessionLocal
from app.models.user import User
from app.models.system_setting import SystemSetting
from app.models.audit_log import AuditLog
from app.core.token import create_access_token
from app.core.security import hash_password


async def dispatch_request(
    method: str,
    path: str,
    body: dict | None = None,
    token: str | None = None,
) -> Tuple[int, Any]:
    """Execute an ASGI request directly against FastAPI app without httpx."""
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

    async def receive():
        return {"type": "http.request", "body": body_bytes, "more_body": False}

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
        data = response_body.decode("utf-8")

    return response_status, data


async def test_system_settings_suite():
    # 1. Setup test users: Admin and Donor
    async with AsyncSessionLocal() as session:
        # Look up existing active admin
        res = await session.execute(select(User).where(User.role == "admin", User.is_active == True))
        admin = res.scalars().first()
        if not admin:
            raise RuntimeError("No active admin user found for tests")
        admin_id = admin.id

        # Create or get donor user
        res_donor = await session.execute(select(User).where(User.email == "setting.donor@example.com"))
        donor = res_donor.scalar_one_or_none()
        if not donor:
            donor = User(
                full_name="Setting Donor User",
                email="setting.donor@example.com",
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

    print("\n--- Running System Settings Backend Test Suite ---")

    # Test 1: Unauthenticated request to GET /system-settings/ rejected
    status, _ = await dispatch_request("GET", "/api/v1/system-settings/")
    assert status == 401, f"Expected 401, got {status}"
    print("[PASS] - 1_authentication_required")

    # Test 2: Authenticated user (donor) can read settings
    status, body = await dispatch_request("GET", "/api/v1/system-settings/", token=donor_token)
    assert status == 200, f"Expected 200, got {status}"
    assert "settings" in body
    assert "system" in body["settings"]
    assert "blood_stock" in body["settings"]
    print("[PASS] - 2_retrieve_settings_grouped")

    # Test 3: Authenticated user (donor) blocked from modifying setting (403 Forbidden)
    status, _ = await dispatch_request(
        "PATCH",
        "/api/v1/system-settings/app_name",
        body={"value": "Hacked Blood Center"},
        token=donor_token,
    )
    assert status == 403, f"Expected 403, got {status}"
    print("[PASS] - 3_unauthorized_user_forbidden")

    # Test 4: Admin retrieves a single setting
    status, setting = await dispatch_request("GET", "/api/v1/system-settings/app_name", token=admin_token)
    assert status == 200
    assert setting["key"] == "app_name"
    print("[PASS] - 4_retrieve_single_setting")

    # Test 5: Admin updates a valid setting
    new_app_name = "National Red Cross Blood Portal"
    status, updated = await dispatch_request(
        "PATCH",
        "/api/v1/system-settings/app_name",
        body={"value": new_app_name},
        token=admin_token,
    )
    assert status == 200
    assert updated["value"] == new_app_name
    print("[PASS] - 5_update_valid_setting")

    # Test 6: Reject unknown setting key
    status, _ = await dispatch_request(
        "PATCH",
        "/api/v1/system-settings/invalid_unknown_key",
        body={"value": "anything"},
        token=admin_token,
    )
    assert status in [400, 404], f"Expected 400/404, got {status}"
    print("[PASS] - 6_reject_unknown_setting")

    # Test 7: Reject invalid value (invalid email format)
    status, err_body = await dispatch_request(
        "PATCH",
        "/api/v1/system-settings/contact_email",
        body={"value": "not-an-email"},
        token=admin_token,
    )
    assert status == 400
    assert "valid email" in str(err_body).lower()
    print("[PASS] - 7_reject_invalid_email_value")

    # Test 8: Validate integer bounds (default_donation_quantity_ml out of range)
    status, err_body = await dispatch_request(
        "PATCH",
        "/api/v1/system-settings/default_donation_quantity_ml",
        body={"value": "50"},  # min is 200
        token=admin_token,
    )
    assert status == 400
    assert "less than" in str(err_body).lower()
    print("[PASS] - 8_validate_integer_data_types_and_bounds")

    # Test 9: Validate threshold consistency (critical >= low stock must be rejected)
    status, err_body = await dispatch_request(
        "PATCH",
        "/api/v1/system-settings/critical_stock_threshold_ml",
        body={"value": "2000"},  # current low is 1500 -> invalid!
        token=admin_token,
    )
    assert status == 400
    assert "strictly less than" in str(err_body).lower()
    print("[PASS] - 9_validate_threshold_consistency")

    # Test 10: Bulk update validation and atomicity
    bulk_payload = {
        "settings": [
            {"key": "organization_name", "value": "Apex Blood Service"},
            {"key": "default_page_size", "value": "20"},
            {"key": "notify_on_low_stock", "value": "false"},
        ]
    }
    status, bulk_res = await dispatch_request(
        "PATCH",
        "/api/v1/system-settings/bulk",
        body=bulk_payload,
        token=admin_token,
    )
    assert status == 200, f"Bulk update failed: {bulk_res}"
    assert len(bulk_res) == 3
    print("[PASS] - 10_bulk_update_success")

    # Test 11: Audit log integration check
    async with AsyncSessionLocal() as session:
        res_logs = await session.execute(
            select(AuditLog)
            .where(AuditLog.entity_type == "system_setting")
            .order_by(AuditLog.id.desc())
            .limit(5)
        )
        logs = res_logs.scalars().all()
        assert len(logs) > 0, "No audit logs recorded for setting updates!"
        latest_log = logs[0]
        assert "setting" in latest_log.description.lower()
        print(f"[PASS] - 11_audit_log_integration (Latest log: {latest_log.description[:60]}...)")

    # Test 12: Failed update does not change stored settings
    status, _ = await dispatch_request(
        "PATCH",
        "/api/v1/system-settings/default_page_size",
        body={"value": "99999"},  # Exceeds max 100
        token=admin_token,
    )
    assert status == 400
    # Verify stored value is still 20 from previous bulk update
    status, val_chk = await dispatch_request("GET", "/api/v1/system-settings/default_page_size", token=admin_token)
    assert val_chk["value"] == "20"
    print("[PASS] - 12_failed_update_preserves_stored_setting")

    # Test 13: Sensitive configuration is never exposed
    status, res_all = await dispatch_request("GET", "/api/v1/system-settings/", token=admin_token)
    all_text = json.dumps(res_all).lower()
    for forbidden in ["secret_key", "database_url", "password", "jwt_secret", "postgres"]:
        assert forbidden not in all_text, f"Forbidden sensitive token '{forbidden}' found in settings response!"
    print("[PASS] - 13_no_sensitive_secrets_exposed")

    # Test 14: Existing business logic remains unaffected
    status, _ = await dispatch_request("GET", "/api/v1/dashboard/summary", token=admin_token)
    assert status == 200
    print("[PASS] - 14_existing_business_logic_unaffected")

    print("=" * 60)
    print("ALL 14 SYSTEM SETTINGS BACKEND TESTS PASSED!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_system_settings_suite())
