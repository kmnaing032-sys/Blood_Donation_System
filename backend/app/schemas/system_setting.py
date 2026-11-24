from typing import Any, Dict, List, Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator


class SystemSettingBase(BaseModel):
    key: str = Field(..., max_length=100)
    value: str
    category: str = Field(..., max_length=50)
    data_type: str = Field(..., max_length=20)
    description: Optional[str] = Field(None, max_length=255)


class SystemSettingResponse(BaseModel):
    id: int
    key: str
    value: str
    category: str
    data_type: str
    description: Optional[str] = None
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SystemSettingUpdate(BaseModel):
    value: str = Field(..., description="The stringified setting value to update")


class SystemSettingBulkItem(BaseModel):
    key: str
    value: str


class SystemSettingBulkUpdate(BaseModel):
    settings: List[SystemSettingBulkItem]


class SystemSettingsGroupedResponse(BaseModel):
    settings: Dict[str, List[SystemSettingResponse]]
