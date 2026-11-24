import os
from pathlib import Path
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.dependencies import get_db
from app.models.user import User
from app.core.permissions import require_admin
from app.schemas.database_backup import (
    BackupResponse,
    BackupListResponse,
    BackupCreateRequest,
    RestoreConfirmationRequest,
)
from app.services.database_backup_service import BackupService, BACKUP_DIR
from app.services.audit_service import create_audit_log
from app.core.rate_limiter import rate_limit

router = APIRouter(prefix="/backups", tags=["Database Backups"])


@router.post(
    "/",
    response_model=BackupResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new PostgreSQL database backup (Admin only)",
    dependencies=[Depends(rate_limit("backup:create"))],
)
async def create_database_backup(
    payload: BackupCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Create a secure PostgreSQL backup using pg_dump."""
    fmt = payload.format if payload.format in ["custom", "plain"] else "custom"
    backup, err = await BackupService.create_backup(
        db=db,
        current_admin=current_admin,
        backup_format=fmt,
        request=request,
    )
    if err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=err,
        )
    return backup


@router.get(
    "/",
    response_model=BackupListResponse,
    summary="List database backup history (Admin only)",
)
async def list_database_backups(
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Retrieve full history of database backups."""
    items = await BackupService.list_backups(db)
    return {"backups": items, "total": len(items)}


@router.get(
    "/{backup_id}",
    response_model=BackupResponse,
    summary="Get database backup metadata (Admin only)",
)
async def get_backup_details(
    backup_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Get metadata for a specific backup by ID."""
    backup = await BackupService.get_backup(db, backup_id)
    if not backup:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Database backup #{backup_id} not found",
        )
    return backup


@router.get(
    "/{backup_id}/download",
    summary="Download a database backup file (Admin only)",
)
async def download_backup_file(
    backup_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Download the physical backup file with path traversal security."""
    backup = await BackupService.get_backup(db, backup_id)
    if not backup:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Database backup #{backup_id} not found",
        )

    file_path = Path(backup.file_path)
    try:
        resolved = file_path.resolve()
        if not str(resolved).startswith(str(BACKUP_DIR.resolve())):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid backup path requested",
            )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Error verifying backup file location",
        )

    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Backup file '{backup.filename}' not found on storage disk",
        )

    ip_addr = request.client.host if request and request.client else None
    await create_audit_log(
        db=db,
        action="backup_downloaded",
        entity_type="database_backup",
        entity_id=backup.id,
        description=f"Admin {current_admin.email} downloaded backup '{backup.filename}'",
        user_id=current_admin.id,
        ip_address=ip_addr,
    )
    await db.commit()

    media_type = "application/octet-stream"
    return FileResponse(
        path=str(file_path),
        filename=backup.filename,
        media_type=media_type,
    )


@router.delete(
    "/{backup_id}",
    summary="Delete a database backup (Admin only)",
)
async def delete_database_backup(
    backup_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Delete a database backup record and remove its file from storage."""
    success, err = await BackupService.delete_backup(
        db=db,
        backup_id=backup_id,
        current_admin=current_admin,
        request=request,
    )
    if not success:
        if err and "not found" in err.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=err)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err or "Deletion failed")

    return {"message": f"Database backup #{backup_id} deleted successfully"}


@router.post(
    "/{backup_id}/restore",
    summary="Prepare and verify database restore workflow (Admin only)",
)
async def prepare_database_restore(
    backup_id: int,
    payload: RestoreConfirmationRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Validate restore preconditions with explicit confirmation.
    
    Returns exact operational instructions for production maintenance execution
    to guarantee atomic offline database recovery without disrupting running servers.
    """
    valid, err = await BackupService.verify_restore_request(
        db=db,
        backup_id=backup_id,
        confirmation=payload.confirmation,
        current_admin=current_admin,
        request=request,
    )
    if not valid:
        if err and "not found" in err.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=err)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err)

    backup = await BackupService.get_backup(db, backup_id)
    return {
        "message": "Restore preparation validated successfully",
        "backup_id": backup.id,
        "filename": backup.filename,
        "warning": "Restoring will completely overwrite existing tables with data from the backup file.",
        "operational_command": (
            f"pg_restore -h localhost -p 5432 -U postgres -d blood_donation_db --clean \"{backup.file_path}\""
            if backup.format == "custom"
            else f"psql -h localhost -p 5432 -U postgres -d blood_donation_db -f \"{backup.file_path}\""
        ),
    }
