from datetime import datetime
from typing import List
from pydantic import BaseModel, Field, ConfigDict


class AuditUserBrief(BaseModel):
    id: int
    full_name: str
    email: str
    role: str

    model_config = ConfigDict(from_attributes=True)


class AuditLogResponse(BaseModel):
    id: int
    user_id: int | None = None
    action: str = Field(..., max_length=100)
    entity_type: str = Field(..., max_length=50)
    entity_id: int | None = None
    description: str = Field(..., max_length=500)
    ip_address: str | None = Field(None, max_length=45)
    created_at: datetime
    user: AuditUserBrief | None = None

    model_config = ConfigDict(from_attributes=True)


class AuditLogListResponse(BaseModel):
    items: List[AuditLogResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
