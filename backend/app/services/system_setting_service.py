from typing import Dict, List, Optional, Tuple, Any
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Request

from app.models.system_setting import SystemSetting
from app.models.user import User
from app.crud.system_setting import (
    get_all_settings,
    get_setting_by_key,
    update_setting_value,
    validate_setting_value,
    seed_initial_settings,
    KNOWN_SETTINGS,
)
from app.services.audit_service import create_audit_log


class SystemSettingService:
    @staticmethod
    async def list_settings_grouped(db: AsyncSession) -> Dict[str, List[SystemSetting]]:
        """List all settings grouped by category."""
        settings = await get_all_settings(db)
        grouped: Dict[str, List[SystemSetting]] = {}
        for s in settings:
            grouped.setdefault(s.category, []).append(s)
        return grouped

    @staticmethod
    async def get_setting(db: AsyncSession, key: str) -> Optional[SystemSetting]:
        return await get_setting_by_key(db, key)

    @staticmethod
    async def update_single_setting(
        db: AsyncSession,
        key: str,
        new_value: str,
        current_admin: User,
        request: Optional[Request] = None,
    ) -> Tuple[Optional[SystemSetting], Optional[str]]:
        """Update a single setting with full audit logging."""
        setting, old_val, err = await update_setting_value(db, key, new_value)
        if err:
            return None, err

        # Audit log creation
        ip_addr = request.client.host if request and request.client else None
        desc = (
            f"Admin {current_admin.email} updated system setting '{key}' "
            f"from '{old_val}' to '{setting.value}'"
        )
        await create_audit_log(
            db=db,
            action="setting_updated",
            entity_type="system_setting",
            entity_id=setting.id,
            user_id=current_admin.id,
            description=desc,
            ip_address=ip_addr,
        )
        await db.commit()
        return setting, None

    @staticmethod
    async def bulk_update_settings(
        db: AsyncSession,
        items: List[Dict[str, str]],
        current_admin: User,
        request: Optional[Request] = None,
    ) -> Tuple[Optional[List[SystemSetting]], Optional[str]]:
        """Atomically validate and update multiple settings in a single transaction."""
        # 1. First validate all items before modifying anything
        if not items:
            return [], None

        all_current = await get_all_settings(db)
        simulated_values = {s.key: s.value for s in all_current}

        for item in items:
            key = item.get("key")
            val = item.get("value")
            if not key or val is None:
                return None, "Each setting item must contain non-empty 'key' and 'value'"

            is_valid, err = validate_setting_value(key, str(val))
            if not is_valid:
                return None, err
            simulated_values[key] = str(val).strip()

        # Check stock thresholds consistency
        crit = int(simulated_values.get("critical_stock_threshold_ml", "500"))
        low = int(simulated_values.get("low_stock_threshold_ml", "1500"))
        if crit >= low:
            return None, "Critical stock threshold must be strictly less than low stock threshold"

        # 2. Perform updates atomically
        updated_records: List[SystemSetting] = []
        ip_addr = request.client.host if request and request.client else None

        for item in items:
            key = item["key"]
            val = item["value"]
            setting = await get_setting_by_key(db, key)
            if not setting:
                await db.rollback()
                return None, f"Setting '{key}' not found"

            old_val = setting.value
            if setting.data_type == "boolean":
                setting.value = "true" if str(val).strip().lower() in ["true", "1"] else "false"
            else:
                setting.value = str(val).strip()

            updated_records.append(setting)

            desc = (
                f"Admin {current_admin.email} bulk-updated setting '{key}' "
                f"from '{old_val}' to '{setting.value}'"
            )
            await create_audit_log(
                db=db,
                action="setting_updated",
                entity_type="system_setting",
                entity_id=setting.id,
                user_id=current_admin.id,
                description=desc,
                ip_address=ip_addr,
            )

        await db.commit()
        for r in updated_records:
            await db.refresh(r)

        return updated_records, None
