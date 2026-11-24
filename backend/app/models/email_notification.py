from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
)
from app.database.base import Base


class UserEmailPreference(Base):
    """User-specific email notification preferences.
    
    Controls whether a user receives email notifications and for which categories.
    Defaults to all enabled when a record is created.
    """
    __tablename__ = "user_email_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    email_notifications_enabled = Column(Boolean, default=True, nullable=False)
    notify_donor_events = Column(Boolean, default=True, nullable=False)
    notify_donation_events = Column(Boolean, default=True, nullable=False)
    notify_stock_events = Column(Boolean, default=True, nullable=False)
    notify_request_events = Column(Boolean, default=True, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<UserEmailPreference(user_id={self.user_id}, "
            f"enabled={self.email_notifications_enabled})>"
        )


class EmailDeliveryLog(Base):
    """Safe tracking log for outbound email delivery attempts.
    
    Tracks status, attempt timestamps, and sanitized error messages.
    Does NOT store SMTP credentials, passwords, auth tokens, or patient PII.
    """
    __tablename__ = "email_delivery_logs"

    id = Column(Integer, primary_key=True, index=True)
    recipient_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    recipient_email = Column(String(255), nullable=False)
    subject = Column(String(255), nullable=False)
    category = Column(String(50), nullable=False, index=True)
    status = Column(String(30), nullable=False, index=True)  # sent, failed, skipped
    attempt_count = Column(Integer, default=1, nullable=False)
    error_message = Column(String(500), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    sent_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    __table_args__ = (
        Index("ix_email_logs_user_created", "recipient_user_id", "created_at"),
    )

    def __repr__(self) -> str:
        return (
            f"<EmailDeliveryLog(id={self.id}, recipient='{self.recipient_email}', "
            f"status='{self.status}')>"
        )
