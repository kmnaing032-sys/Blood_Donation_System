import asyncio
import json
import smtplib
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone
from typing import Any, Tuple
from sqlalchemy import select

from app.main import app
from app.core.config import settings
from app.services.email_service import EmailService
from app.database.database import AsyncSessionLocal
from app.models.user import User
from app.models.notification import Notification
from app.models.email_notification import UserEmailPreference, EmailDeliveryLog
from app.services.notification_service import dispatch_notification
from app.crud.email_notification import get_user_preference, update_user_preference
from app.core.token import create_access_token


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


async def run_email_tests():
    print("=== Running Email & SMTP Verification Suite ===")

    # 1. Test unconfigured behavior
    print("1. Testing unconfigured SMTP behavior...")
    with patch.object(settings, "SMTP_HOST", None), patch.object(settings, "SMTP_FROM_EMAIL", None):
        assert EmailService.is_smtp_configured() is False
        status = EmailService.get_smtp_status()
        assert status["configured"] is False
        assert "password" not in status
        assert "SMTP_PASSWORD" not in status
        success, err = await EmailService.send_email("test@example.com", "Subject", "Body")
        assert success is False
        assert "SMTP is not configured" in err
    print("   -> PASSED: Graceful failure and password exclusion.")

    # 2. Test validation and header injection
    print("2. Testing recipient validation & header injection prevention...")
    with patch.object(settings, "SMTP_HOST", "smtp.example.com"), patch.object(settings, "SMTP_FROM_EMAIL", "system@example.com"):
        success, err = await EmailService.send_email("not-an-email", "Subject", "Body")
        assert success is False
        assert "Invalid recipient" in err

        success, err = await EmailService.send_email("test@example.com\r\nBcc: victim@example.com", "Subject", "Body")
        assert success is False
        assert "Invalid recipient" in err

        clean = EmailService.sanitize_header("Subject\r\nInjected\nLine")
        assert "\r" not in clean and "\n" not in clean
        assert clean == "Subject Injected Line"
    print("   -> PASSED: Validation and anti-injection guards confirmed.")

    # 3. Test mocked SMTP send success
    print("3. Testing mocked SMTP successful delivery...")
    with patch.object(settings, "SMTP_HOST", "smtp.example.com"), \
         patch.object(settings, "SMTP_FROM_EMAIL", "noreply@bloodsystem.org"), \
         patch.object(settings, "SMTP_USERNAME", "user"), \
         patch.object(settings, "SMTP_PASSWORD", "pwd"), \
         patch("app.services.email_service.smtplib.SMTP") as mock_smtp_cls:

        mock_server = MagicMock()
        mock_smtp_cls.return_value = mock_server

        success, err = await EmailService.send_email("recipient@example.com", "Subject", "Body")
        assert success is True
        assert err is None
        assert mock_server.starttls.call_count == 1
        mock_server.login.assert_called_once_with("user", "pwd")
        mock_server.send_message.assert_called_once()
    print("   -> PASSED: Mocked SMTP transmission succeeded.")

    # 4. Test SMTP connection failure
    print("4. Testing SMTP connection failure...")
    with patch.object(settings, "SMTP_HOST", "smtp.example.com"), \
         patch.object(settings, "SMTP_FROM_EMAIL", "noreply@bloodsystem.org"), \
         patch("app.services.email_service.smtplib.SMTP", side_effect=TimeoutError("Connection timed out")):

        success, err = await EmailService.send_email("recipient@example.com", "Subject", "Body")
        assert success is False
        assert "timed out" in err.lower()
    print("   -> PASSED: Handled connection timeout cleanly.")

    # 5. Database & Event integration tests
    print("5. Testing notification event email integration & duplicate suppression...")
    async with AsyncSessionLocal() as session:
        ts = int(datetime.now(timezone.utc).timestamp())
        test_user = User(
            full_name="Auto User",
            email=f"auto_{ts}@example.com",
            hashed_password="pw",
            role="donor",
            is_active=True,
        )
        session.add(test_user)
        await session.commit()
        await session.refresh(test_user)

        with patch.object(settings, "SMTP_HOST", "smtp.example.com"), \
             patch.object(settings, "SMTP_FROM_EMAIL", "alerts@bloodsystem.org"), \
             patch.object(EmailService, "send_email", return_value=(True, None)) as mock_send:

            # Dispatch notification
            n1 = await dispatch_notification(
                db=session,
                recipient_id=test_user.id,
                title=f"Event Notif {ts}",
                message="Message body",
                category="donor",
            )
            assert n1 is not None
            mock_send.assert_called_once()

            # Duplicate notification should be skipped
            mock_send.reset_mock()
            n2 = await dispatch_notification(
                db=session,
                recipient_id=test_user.id,
                title=f"Event Notif {ts}",
                message="Message body",
                category="donor",
            )
            assert n2 is None
            mock_send.assert_not_called()

            # Inactive user check
            test_user.is_active = False
            await session.commit()
            mock_send.reset_mock()
            n3 = await dispatch_notification(
                db=session,
                recipient_id=test_user.id,
                title=f"Inactive Event {ts}",
                message="Body",
                category="donor",
            )
            assert n3 is not None
            mock_send.assert_not_called()
    print("   -> PASSED: Email integration, duplicate suppression, and inactive user filtering verified.")

    # 6. Test User Email Preference opt-out
    print("6. Testing user email preference opt-out...")
    async with AsyncSessionLocal() as session:
        ts = int(datetime.now(timezone.utc).timestamp())
        user_pref = User(
            full_name="Pref User",
            email=f"pref_{ts}@example.com",
            hashed_password="pw",
            role="donor",
            is_active=True,
        )
        session.add(user_pref)
        await session.commit()
        await session.refresh(user_pref)

        # Opt-out of donation events
        await update_user_preference(session, user_pref.id, notify_donation_events=False)

        with patch.object(settings, "SMTP_HOST", "smtp.example.com"), \
             patch.object(settings, "SMTP_FROM_EMAIL", "alerts@bloodsystem.org"), \
             patch.object(EmailService, "send_email", return_value=(True, None)) as mock_send:

            n = await dispatch_notification(
                db=session,
                recipient_id=user_pref.id,
                title=f"Donation Received {ts}",
                message="Body",
                category="donation",
            )
            assert n is not None
            mock_send.assert_not_called()
    print("   -> PASSED: User category opt-out respected.")

    # 7. Test in-app notification persistence when SMTP fails
    print("7. Testing in-app notification resilience during SMTP error...")
    async with AsyncSessionLocal() as session:
        ts = int(datetime.now(timezone.utc).timestamp())
        user_resilient = User(
            full_name="Resilient User",
            email=f"resilient_{ts}@example.com",
            hashed_password="pw",
            role="donor",
            is_active=True,
        )
        session.add(user_resilient)
        await session.commit()
        await session.refresh(user_resilient)

        with patch.object(settings, "SMTP_HOST", "smtp.example.com"), \
             patch.object(settings, "SMTP_FROM_EMAIL", "alerts@bloodsystem.org"), \
             patch.object(EmailService, "send_email", side_effect=Exception("Catastrophic SMTP Failure")):

            notif = await dispatch_notification(
                db=session,
                recipient_id=user_resilient.id,
                title=f"Emergency Alert {ts}",
                message="Body",
                category="request",
            )
            assert notif is not None
            assert notif.id is not None
    print("   -> PASSED: In-app notification saved safely despite SMTP crash.")

    # 8. API endpoints: RBAC and preferences
    print("8. Testing API endpoints, RBAC, ownership, and logs...")
    async with AsyncSessionLocal() as session:
        admin_res = await session.execute(select(User).where(User.role == "admin", User.is_active == True))
        admin = admin_res.scalars().first()
        donor_res = await session.execute(select(User).where(User.role == "donor", User.is_active == True))
        donor = donor_res.scalars().first()

    admin_token = create_access_token(data={"sub": str(admin.id)})
    donor_token = create_access_token(data={"sub": str(donor.id)})

    # Unauthenticated /me -> 401
    st, _ = await dispatch_request("GET", "/api/v1/email-preferences/me")
    assert st == 401

    # Donor /me -> 200
    st, data = await dispatch_request("GET", "/api/v1/email-preferences/me", token=donor_token)
    assert st == 200
    assert data["user_id"] == donor.id

    # Donor patch /me -> 200
    st, data = await dispatch_request("PATCH", "/api/v1/email-preferences/me", body={"notify_stock_events": False}, token=donor_token)
    assert st == 200
    assert data["notify_stock_events"] is False

    # Donor /smtp-status -> 403 Forbidden
    st, _ = await dispatch_request("GET", "/api/v1/email-preferences/smtp-status", token=donor_token)
    assert st == 403

    # Admin /smtp-status -> 200 OK
    st, data = await dispatch_request("GET", "/api/v1/email-preferences/smtp-status", token=admin_token)
    assert st == 200
    assert "configured" in data
    assert "password" not in str(data).lower() or data.get("password") is None

    # Admin /logs -> 200 OK
    st, data = await dispatch_request("GET", "/api/v1/email-preferences/logs", token=admin_token)
    assert st == 200
    assert "items" in data
    assert "total" in data

    print("   -> PASSED: All API endpoints, ownership constraints, and RBAC enforced.")
    print("=== All 8 Email & SMTP Verification Tests PASSED ===")


if __name__ == "__main__":
    asyncio.run(run_email_tests())
