import re
import smtplib
import asyncio
import logging
from email.message import EmailMessage
from typing import Optional, Tuple
from datetime import datetime, timezone

from app.core.config import settings

logger = logging.getLogger(__name__)

# Basic regex for email format validation
EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


class EmailService:
    """Service handling email delivery via SMTP.
    
    Adheres strictly to security rules:
    - Never leaks SMTP passwords or full connection credentials in exceptions/logs.
    - Validates email formats and guards against header injection attacks (\r or \n).
    - Offloads synchronous smtplib operations to asyncio.to_thread to avoid blocking FastAPI.
    - Fails gracefully without bubbling exceptions into database transactions.
    """

    @classmethod
    def is_smtp_configured(cls) -> bool:
        """Check if essential SMTP configuration variables are provided."""
        return bool(settings.SMTP_HOST and settings.SMTP_FROM_EMAIL)

    @classmethod
    def get_smtp_status(cls) -> dict:
        """Return safe SMTP status excluding sensitive credentials like password."""
        return {
            "configured": cls.is_smtp_configured(),
            "host": settings.SMTP_HOST,
            "port": settings.SMTP_PORT,
            "from_email": settings.SMTP_FROM_EMAIL,
            "from_name": settings.SMTP_FROM_NAME,
            "use_tls": settings.SMTP_USE_TLS,
            "use_ssl": settings.SMTP_USE_SSL,
        }

    @classmethod
    def sanitize_header(cls, text: str) -> str:
        """Prevent CRLF / header injection attacks in subject lines and sender names."""
        if not text:
            return ""
        # Remove any carriage returns or newlines
        return re.sub(r"[\r\n]+", " ", text).strip()

    @classmethod
    def is_valid_email(cls, email_str: str) -> bool:
        """Validate email format and check for header injection characters."""
        if not email_str or not isinstance(email_str, str):
            return False
        if "\r" in email_str or "\n" in email_str:
            return False
        return bool(EMAIL_REGEX.match(email_str.strip()))

    @classmethod
    def build_email_template(
        cls,
        title: str,
        message: str,
        category: str = "general",
    ) -> Tuple[str, str]:
        """Generate clean plain text and professional HTML email bodies."""
        plain_body = f"""{title}

{message}

---
{settings.SMTP_FROM_NAME}
This is an automated notification from {settings.APP_NAME}. Please do not reply directly to this email.
"""

        html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f9; color: #1e293b; margin: 0; padding: 20px; }}
    .container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; }}
    .header {{ background: #dc2626; color: #ffffff; padding: 20px 24px; }}
    .header h1 {{ margin: 0; font-size: 18px; font-weight: 600; }}
    .content {{ padding: 24px; font-size: 15px; line-height: 1.6; color: #334155; }}
    .badge {{ display: inline-block; padding: 4px 10px; background: #fef2f2; color: #dc2626; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 12px; }}
    .footer {{ padding: 16px 24px; background: #f8fafc; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; text-align: center; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{cls.sanitize_header(settings.SMTP_FROM_NAME)}</h1>
    </div>
    <div class="content">
      <div class="badge">{cls.sanitize_header(category)}</div>
      <h2 style="margin-top: 0; font-size: 18px; color: #0f172a;">{cls.sanitize_header(title)}</h2>
      <p style="margin-bottom: 0;">{message}</p>
    </div>
    <div class="footer">
      <p style="margin: 0;">This is an automated notification from {cls.sanitize_header(settings.APP_NAME)}.</p>
    </div>
  </div>
</body>
</html>
"""
        return plain_body, html_body

    @classmethod
    def _send_sync_smtp(
        cls,
        recipient: str,
        subject: str,
        plain_content: str,
        html_content: str,
    ) -> Tuple[bool, Optional[str]]:
        """Synchronous SMTP transmission executed within worker thread."""
        msg = EmailMessage()
        clean_subject = cls.sanitize_header(subject)
        from_header = f"{cls.sanitize_header(settings.SMTP_FROM_NAME)} <{settings.SMTP_FROM_EMAIL}>"
        
        msg["Subject"] = clean_subject
        msg["From"] = from_header
        msg["To"] = recipient.strip()
        msg.set_content(plain_content)
        msg.add_alternative(html_content, subtype="html")

        timeout = getattr(settings, "SMTP_TIMEOUT_SECONDS", 10)

        try:
            if settings.SMTP_USE_SSL:
                server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=timeout)
            else:
                server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=timeout)

            with server:
                if settings.SMTP_USE_TLS and not settings.SMTP_USE_SSL:
                    server.starttls()
                if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                    server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                server.send_message(msg)

            return True, None

        except smtplib.SMTPAuthenticationError:
            err = "SMTP authentication failed. Check credentials."
            logger.error(err)
            return False, err
        except smtplib.SMTPConnectError:
            err = "Failed to connect to SMTP host."
            logger.error(err)
            return False, err
        except TimeoutError:
            err = "SMTP connection timed out."
            logger.error(err)
            return False, err
        except Exception as e:
            # Mask potential sensitive parameters from raw exception
            err = f"SMTP transmission error: {e.__class__.__name__}"
            logger.error("Email send failed: %s", err)
            return False, err

    @classmethod
    async def send_email(
        cls,
        recipient: str,
        subject: str,
        plain_content: str,
        html_content: Optional[str] = None,
    ) -> Tuple[bool, Optional[str]]:
        """Safely send an email asynchronously without blocking the event loop."""
        if not cls.is_smtp_configured():
            return False, "SMTP is not configured on this server."

        # Reject CRLF or malformed recipient
        if not cls.is_valid_email(recipient):
            return False, "Invalid recipient email address or header injection detected."

        if not html_content:
            _, html_content = cls.build_email_template(subject, plain_content)

        # Offload network socket blocking calls to a worker thread
        return await asyncio.to_thread(
            cls._send_sync_smtp,
            recipient,
            subject,
            plain_content,
            html_content,
        )
