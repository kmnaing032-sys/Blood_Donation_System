from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.dependencies import get_db
from app.models.user import User
from app.core.permissions import require_admin
from app.core.auth_dependencies import get_current_user
from app.schemas.system_setting import (
    SystemSettingResponse,
    SystemSettingUpdate,
    SystemSettingBulkUpdate,
    SystemSettingsGroupedResponse,
)
from app.services.system_setting_service import SystemSettingService


router = APIRouter(prefix="/system-settings", tags=["System Settings"])


@router.get(
    "/",
    response_model=SystemSettingsGroupedResponse,
    summary="Get all system settings grouped by category",
)
async def get_system_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve all configurable system settings grouped by category.
    
    Accessible to authenticated users so they can read public system info
    and general preferences, while editing is strictly reserved for Admin.
    """
    grouped = await SystemSettingService.list_settings_grouped(db)
    return {"settings": grouped}


@router.get(
    "/{key}",
    response_model=SystemSettingResponse,
    summary="Get a specific system setting by key",
)
async def get_single_system_setting(
    key: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve a single system setting by key."""
    setting = await SystemSettingService.get_setting(db, key)
    if not setting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"System setting '{key}' not found",
        )
    return setting


@router.patch(
    "/bulk",
    response_model=List[SystemSettingResponse],
    summary="Bulk update multiple system settings (Admin only)",
)
async def bulk_update_system_settings(
    payload: SystemSettingBulkUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Atomically validate and update multiple system settings.
    
    Protected: Admin role strictly required.
    """
    items = [{"key": item.key, "value": item.value} for item in payload.settings]
    updated, err = await SystemSettingService.bulk_update_settings(
        db=db,
        items=items,
        current_admin=current_admin,
        request=request,
    )
    if err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err,
        )
    return updated


@router.patch(
    "/{key}",
    response_model=SystemSettingResponse,
    summary="Update a specific system setting (Admin only)",
)
async def update_single_system_setting(
    key: str,
    payload: SystemSettingUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Update a single system setting by key with audit logging.
    
    Protected: Admin role strictly required.
    """
    setting, err = await SystemSettingService.update_single_setting(
        db=db,
        key=key,
        new_value=payload.value,
        current_admin=current_admin,
        request=request,
    )
    if err:
        # Check if error is due to not found vs validation failure
        if "not found" in err.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=err,
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err,
        )
    return setting
