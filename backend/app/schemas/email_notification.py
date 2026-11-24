from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field


class UserEmailPreferenceBase(BaseModel):
    email_notifications_enabled: bool = True
    notify_donor_events: bool = True
    notify_donation_events: bool = True
    notify_stock_events: bool = True
    notify_request_events: bool = True


class UserEmailPreferenceUpdate(BaseModel):
    email_notifications_enabled: Optional[bool] = None
    notify_donor_events: Optional[bool] = None
    notify_donation_events: Optional[bool] = None
    notify_stock_events: Optional[bool] = None
    notify_request_events: Optional[bool] = None


class UserEmailPreferenceResponse(UserEmailPreferenceBase):
    id: int
    user_id: int
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SmtpStatusResponse(BaseModel):
    configured: bool
    host: Optional[str] = None
    port: Optional[int] = None
    from_email: Optional[str] = None
    from_name: Optional[str] = None
    use_tls: bool = True
    use_ssl: bool = False
    # Notice: SMTP_PASSWORD and full connection strings are STRICTLY excluded


class EmailDeliveryLogResponse(BaseModel):
    id: int
    recipient_user_id: Optional[int] = None
    recipient_email: str
    subject: str
    category: str
    status: str
    attempt_count: int
    error_message: Optional[str] = None
    created_at: datetime
    sent_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class EmailDeliveryLogListResponse(BaseModel):
    items: List[EmailDeliveryLogResponse]
    total: int
