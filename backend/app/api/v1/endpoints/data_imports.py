from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status, Request
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.database.dependencies import get_db
from app.core.permissions import require_staff_or_admin
from app.models.user import User
from app.models.data_import import DataImportLog
from app.services.csv_import_service import CSVImportService, MAX_FILE_SIZE_BYTES
from app.services.audit_service import create_audit_log
from app.schemas.data_import import (
    DonorImportPreviewResponse,
    DonorImportCommitResponse,
    DataImportLogListResponse,
    DataImportLogResponse,
)

router = APIRouter(prefix="/imports", tags=["Data Import & Bulk Operations"])

# Standard Donor CSV Template Content
DONOR_CSV_TEMPLATE = """full_name,email,phone,date_of_birth,gender,blood_group,address,last_donation_date
John Doe,john.doe@example.com,+1-555-0101,1995-05-15,male,O+,123 Main St Cityville,2025-11-01
Jane Smith,jane.smith@example.com,+1-555-0102,1998-09-20,female,A+,456 Oak Ave Townsville,
"""


@router.get("/donors/template", summary="Download Donor CSV Import Template")
async def download_donor_template():
    """Returns a pre-formatted, valid CSV template with example donor records."""
    return Response(
        content=DONOR_CSV_TEMPLATE,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="donor_import_template.csv"'},
    )


@router.post(
    "/donors/preview",
    response_model=DonorImportPreviewResponse,
    summary="Validate and preview donor CSV records (Admin/Staff only)",
)
async def preview_donors_csv(
    file: UploadFile = File(...),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff_or_admin),
):
    """Dry-run verification of uploaded CSV. Does NOT modify the database."""
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only .csv files are supported.",
        )

    content_bytes = await file.read()
    if len(content_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum permitted size of {MAX_FILE_SIZE_BYTES // (1024*1024)}MB",
        )

    preview, err = await CSVImportService.validate_and_preview_donors(
        db=db,
        content_bytes=content_bytes,
        filename=file.filename,
    )
    if err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err,
        )

    # Audit log preview activity
    ip_addr = request.client.host if request and request.client else None
    await create_audit_log(
        db=db,
        action="import_preview",
        entity_type="data_import",
        user_id=current_user.id,
        description=(
            f"User {current_user.email} generated preview for '{file.filename}' "
            f"({preview.valid_rows} valid, {preview.invalid_rows} invalid, {preview.duplicate_rows} duplicates)"
        ),
        ip_address=ip_addr,
    )
    await db.commit()
    return preview


@router.post(
    "/donors/commit",
    response_model=DonorImportCommitResponse,
    summary="Commit validated donor CSV records into database (Admin/Staff only)",
)
async def commit_donors_csv(
    file: UploadFile = File(...),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff_or_admin),
):
    """Atomically commit valid donor records from CSV into the database."""
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only .csv files are supported.",
        )

    content_bytes = await file.read()
    if len(content_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum permitted size of {MAX_FILE_SIZE_BYTES // (1024*1024)}MB",
        )

    commit_res, err = await CSVImportService.commit_donor_import(
        db=db,
        content_bytes=content_bytes,
        filename=file.filename,
        current_user=current_user,
    )
    if err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err,
        )

    # Audit log completion
    ip_addr = request.client.host if request and request.client else None
    await create_audit_log(
        db=db,
        action="import_completed",
        entity_type="data_import",
        entity_id=commit_res.import_id,
        user_id=current_user.id,
        description=(
            f"User {current_user.email} imported {commit_res.created_count} donors from '{file.filename}' "
            f"({commit_res.skipped_count} skipped, {commit_res.failed_count} failed)"
        ),
        ip_address=ip_addr,
    )
    await db.commit()
    return commit_res


@router.get(
    "/history",
    response_model=DataImportLogListResponse,
    summary="List past data import logs (Admin/Staff only)",
)
async def list_import_history(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff_or_admin),
):
    """Retrieve historical metadata for past bulk imports."""
    count_res = await db.execute(select(func.count(DataImportLog.id)))
    total = count_res.scalar() or 0

    logs_res = await db.execute(
        select(DataImportLog)
        .order_by(desc(DataImportLog.created_at))
        .offset(skip)
        .limit(limit)
    )
    items = list(logs_res.scalars().all())
    return {"items": items, "total": total}


@router.get(
    "/{import_id}",
    response_model=DataImportLogResponse,
    summary="Get single import log details (Admin/Staff only)",
)
async def get_import_details(
    import_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff_or_admin),
):
    """Retrieve details of a specific import execution."""
    res = await db.execute(select(DataImportLog).where(DataImportLog.id == import_id))
    log = res.scalar_one_or_none()
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Import record #{import_id} not found",
        )
    return log
