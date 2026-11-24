import asyncio
import json
from pathlib import Path
from typing import Any, Tuple
from sqlalchemy import select

from app.main import app
from app.database.database import AsyncSessionLocal
from app.models.user import User
from app.models.database_backup import DatabaseBackup
from app.models.audit_log import AuditLog
from app.core.token import create_access_token
from app.core.security import hash_password
from app.services.database_backup_service import BACKUP_DIR, ensure_backup_dir


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


async def test_database_backup_suite():
    ensure_backup_dir()

    # 1. Setup test users: Admin and Donor
    async with AsyncSessionLocal() as session:
        res = await session.execute(select(User).where(User.role == "admin", User.is_active == True))
        admin = res.scalars().first()
        if not admin:
            raise RuntimeError("No active admin user found for tests")
        admin_id = admin.id

        res_donor = await session.execute(select(User).where(User.email == "backup.donor@example.com"))
        donor = res_donor.scalar_one_or_none()
        if not donor:
            donor = User(
                full_name="Backup Donor User",
                email="backup.donor@example.com",
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

    print("\n--- Running Database Backup & Restore Backend Test Suite ---")

    # Test 1: Unauthenticated request rejected (401)
    status, _ = await dispatch_request("GET", "/api/v1/backups/")
    assert status == 401, f"Expected 401, got {status}"
    print("[PASS] - 1_authentication_required")

    # Test 2: Non-admin user blocked (403 Forbidden)
    status, _ = await dispatch_request("GET", "/api/v1/backups/", token=donor_token)
    assert status == 403, f"Expected 403, got {status}"
    status, _ = await dispatch_request("POST", "/api/v1/backups/", body={"format": "custom"}, token=donor_token)
    assert status == 403, f"Expected 403 on POST, got {status}"
    print("[PASS] - 2_non_admin_forbidden")

    # Test 3: Admin creates a database backup (real pg_dump invocation)
    status, created_backup = await dispatch_request("POST", "/api/v1/backups/", body={"format": "custom"}, token=admin_token)
    assert status == 201, f"Expected 201 Created, got {status}: {created_backup}"
    assert "filename" in created_backup
    assert created_backup["filename"].endswith(".dump")
    assert created_backup["status"] == "completed"
    backup_id = created_backup["id"]
    print(f"[PASS] - 3_admin_creates_backup (Backup ID: {backup_id}, File: {created_backup['filename']})")

    # Test 4: Backup history returns correct metadata
    status, history = await dispatch_request("GET", "/api/v1/backups/", token=admin_token)
    assert status == 200, f"Expected 200, got {status}"
    assert "backups" in history
    assert history["total"] >= 1
    found = any(b["id"] == backup_id for b in history["backups"])
    assert found, "Created backup not listed in history"
    print("[PASS] - 4_backup_history_metadata")

    # Test 5: Get backup details by ID
    status, details = await dispatch_request("GET", f"/api/v1/backups/{backup_id}", token=admin_token)
    assert status == 200
    assert details["id"] == backup_id
    assert details["filename"] == created_backup["filename"]
    print("[PASS] - 5_get_backup_details")

    # Test 6: Invalid backup ID returns 404
    status, _ = await dispatch_request("GET", "/api/v1/backups/999999", token=admin_token)
    assert status == 404
    print("[PASS] - 6_invalid_backup_id_404")

    # Test 7: Download backup file
    status, dl_body = await dispatch_request("GET", f"/api/v1/backups/{backup_id}/download", token=admin_token)
    assert status == 200, f"Expected 200 for download, got {status}"
    print("[PASS] - 7_download_backup_file")

    # Test 8: Restore preparation without confirmation is rejected
    status, err_resp = await dispatch_request("POST", f"/api/v1/backups/{backup_id}/restore", body={"confirmation": "wrong"}, token=admin_token)
    assert status == 400
    print("[PASS] - 8_restore_without_confirmation_rejected")

    # Test 9: Restore preparation with valid confirmation succeeds and logs
    status, restore_res = await dispatch_request("POST", f"/api/v1/backups/{backup_id}/restore", body={"confirmation": "CONFIRM_RESTORE"}, token=admin_token)
    assert status == 200
    assert "operational_command" in restore_res
    print("[PASS] - 9_restore_confirmation_workflow")

    # Test 10: Audit events recorded for backup creation and download without secrets
    async with AsyncSessionLocal() as session:
        res_logs = await session.execute(
            select(AuditLog)
            .where(AuditLog.entity_type == "database_backup")
            .order_by(AuditLog.id.desc())
            .limit(10)
        )
        logs = res_logs.scalars().all()
        assert len(logs) >= 2, "Expected audit logs for database backup operations"
        for log in logs:
            desc = log.description.lower()
            assert "12345" not in desc, "Password leaked in audit log description!"
            assert "postgresql+asyncpg" not in desc, "Connection string leaked in audit log description!"
        print("[PASS] - 10_audit_events_without_secrets")

    # Test 11: Delete backup works and cleans up disk
    status, del_res = await dispatch_request("DELETE", f"/api/v1/backups/{backup_id}", token=admin_token)
    assert status == 200
    status_chk, _ = await dispatch_request("GET", f"/api/v1/backups/{backup_id}", token=admin_token)
    assert status_chk == 404
    print("[PASS] - 11_delete_backup_success")

    # Test 12: Delete non-existent backup returns 404
    status, _ = await dispatch_request("DELETE", f"/api/v1/backups/{backup_id}", token=admin_token)
    assert status == 404
    print("[PASS] - 12_delete_nonexistent_backup_404")

    print("=" * 60)
    print("ALL 12 DATABASE BACKUP & RESTORE BACKEND TESTS PASSED!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_database_backup_suite())
