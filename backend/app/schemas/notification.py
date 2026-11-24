from datetime import datetime
from typing import Literal, List
from pydantic import BaseModel, Field, ConfigDict


NotificationCategory = Literal["donor", "donation", "stock", "request", "system"]


class NotificationBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=150, description="Notification title")
    message: str = Field(..., min_length=1, max_length=500, description="Notification message")
    category: NotificationCategory = Field(default="system", description="Notification category")


class NotificationCreate(NotificationBase):
    pass


class NotificationUpdate(BaseModel):
    is_read: bool | None = None


class NotificationResponse(BaseModel):
    id: int
    user_id: int
    title: str
    message: str
    category: str
    is_read: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NotificationListResponse(BaseModel):
    items: List[NotificationResponse]
    total: int
    unread_count: int
