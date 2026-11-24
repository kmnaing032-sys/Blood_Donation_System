from datetime import datetime, date
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict


class DonorImportRowPreview(BaseModel):
    row_number: int
    full_name: str
    email: str
    phone: str
    date_of_birth: str
    gender: str
    blood_group: str
    address: str
    last_donation_date: Optional[str] = None
    is_valid: bool = True
    errors: List[str] = Field(default_factory=list)
    is_duplicate: bool = False
    duplicate_reason: Optional[str] = None


class DonorImportPreviewResponse(BaseModel):
    filename: str
    total_rows: int
    valid_rows: int
    invalid_rows: int
    duplicate_rows: int
    validation_errors: Dict[int, List[str]] = Field(
        default_factory=dict,
        description="Row-indexed list of validation errors",
    )
    preview_items: List[DonorImportRowPreview] = Field(
        default_factory=list,
        description="First 10 rows for validation review",
    )
    can_commit: bool


class DonorImportCommitResponse(BaseModel):
    import_id: int
    filename: str
    total_rows: int
    created_count: int
    skipped_count: int
    failed_count: int
    status: str
    summary_message: str


class DataImportLogResponse(BaseModel):
    id: int
    import_type: str
    filename: str
    total_rows: int
    created_rows: int
    skipped_rows: int
    failed_rows: int
    status: str
    error_summary: Optional[str] = None
    created_by_id: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DataImportLogListResponse(BaseModel):
    items: List[DataImportLogResponse]
    total: int
