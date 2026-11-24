from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class BackupResponse(BaseModel):
    id: int
    filename: str
    file_size_bytes: int
    format: str
    status: str
    error_message: Optional[str] = None
    created_by_id: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BackupListResponse(BaseModel):
    backups: List[BackupResponse]
    total: int


class BackupCreateRequest(BaseModel):
    format: Optional[str] = Field("custom", description="Backup format: 'custom' (.dump) or 'plain' (.sql)")


class RestoreConfirmationRequest(BaseModel):
    confirmation: str = Field(..., description="Must explicitly match 'CONFIRM_RESTORE' to proceed")
