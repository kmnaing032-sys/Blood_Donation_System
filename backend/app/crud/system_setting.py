import json
from typing import Dict, List, Optional, Tuple, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.system_setting import SystemSetting


# Registry of known allowed settings and their specifications
KNOWN_SETTINGS: Dict[str, Dict[str, Any]] = {
    # 1. System Information
    "app_name": {
        "category": "system",
        "data_type": "string",
        "default": "Blood Donation Management System",
        "description": "Public name of the application displayed across the dashboard and headers",
        "min_len": 2,
        "max_len": 100,
    },
    "organization_name": {
        "category": "system",
        "data_type": "string",
        "default": "National Blood Transfusion Service",
        "description": "Operating healthcare entity or hospital network name",
        "min_len": 2,
        "max_len": 100,
    },
    "contact_email": {
        "category": "system",
        "data_type": "string",
        "default": "support@blooddonationsystem.org",
        "description": "System administrative contact email for inquiries and alerts",
        "is_email": True,
    },
    "support_phone": {
        "category": "system",
        "data_type": "string",
        "default": "+1-800-555-0199",
        "description": "Emergency helpline and donor support contact telephone",
        "min_len": 7,
        "max_len": 25,
    },
    # 2. Donation Configuration
    "default_donation_quantity_ml": {
        "category": "donation",
        "data_type": "integer",
        "default": "450",
        "description": "Standard default donation volume per session in milliliters (200 - 1000 ml)",
        "min_val": 200,
        "max_val": 1000,
    },
    "minimum_donation_interval_days": {
        "category": "donation",
        "data_type": "integer",
        "default": "56",
        "description": "Mandatory recovery period between whole blood donations (56 days standard)",
        "min_val": 28,
        "max_val": 180,
    },
    # 3. Blood Stock Configuration
    "critical_stock_threshold_ml": {
        "category": "blood_stock",
        "data_type": "integer",
        "default": "500",
        "description": "Critical stock boundary below which blood reserves trigger urgent alerts (ml)",
        "min_val": 100,
        "max_val": 2000,
    },
    "low_stock_threshold_ml": {
        "category": "blood_stock",
        "data_type": "integer",
        "default": "1500",
        "description": "Low stock warning boundary requiring proactive donor callouts (ml)",
        "min_val": 300,
        "max_val": 5000,
    },
    # 4. Notification Preferences
    "notify_on_new_request": {
        "category": "notification",
        "data_type": "boolean",
        "default": "true",
        "description": "Generate in-app notification when a new blood request is submitted",
    },
    "notify_on_low_stock": {
        "category": "notification",
        "data_type": "boolean",
        "default": "true",
        "description": "Generate in-app alerts when blood stock depletes below low/critical thresholds",
    },
    "notify_on_donation_completed": {
        "category": "notification",
        "data_type": "boolean",
        "default": "true",
        "description": "Notify donors and staff when a blood donation is successfully logged",
    },
    # 5. General Preferences
    "date_format": {
        "category": "general",
        "data_type": "string",
        "default": "YYYY-MM-DD",
        "description": "Preferred standard date formatting across reports and tables",
        "allowed_values": ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"],
    },
    "timezone": {
        "category": "general",
        "data_type": "string",
        "default": "UTC",
        "description": "Display timezone for system activity and audit log timestamps",
        "allowed_values": ["UTC", "GMT", "Asia/Yangon", "Asia/Bangkok", "America/New_York", "Europe/London"],
    },
    "default_page_size": {
        "category": "general",
        "data_type": "integer",
        "default": "10",
        "description": "Default pagination row limit for tabular views across the platform",
        "min_val": 5,
        "max_val": 100,
    },
}


async def seed_initial_settings(db: AsyncSession) -> None:
    """Ensure all known system settings exist in the database with defaults."""
    res = await db.execute(select(SystemSetting))
    existing = {s.key: s for s in res.scalars().all()}

    for key, spec in KNOWN_SETTINGS.items():
        if key not in existing:
            setting = SystemSetting(
                key=key,
                value=spec["default"],
                category=spec["category"],
                data_type=spec["data_type"],
                description=spec["description"],
            )
            db.add(setting)

    await db.commit()


async def get_all_settings(db: AsyncSession) -> List[SystemSetting]:
    """Retrieve all system settings ordered by category and key."""
    await seed_initial_settings(db)
    res = await db.execute(select(SystemSetting).order_by(SystemSetting.category, SystemSetting.key))
    return list(res.scalars().all())


async def get_setting_by_key(db: AsyncSession, key: str) -> Optional[SystemSetting]:
    """Retrieve a single setting by its unique key."""
    res = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
    setting = res.scalar_one_or_none()
    if not setting and key in KNOWN_SETTINGS:
        spec = KNOWN_SETTINGS[key]
        setting = SystemSetting(
            key=key,
            value=spec["default"],
            category=spec["category"],
            data_type=spec["data_type"],
            description=spec["description"],
        )
        db.add(setting)
        await db.commit()
        await db.refresh(setting)
    return setting


def validate_setting_value(key: str, value: str, existing_settings: Optional[Dict[str, str]] = None) -> Tuple[bool, Optional[str]]:
    """Validate a setting's key and value against its type and business rules.
    
    Returns (is_valid, error_message).
    """
    if key not in KNOWN_SETTINGS:
        return False, f"Unknown system setting: '{key}'"

    spec = KNOWN_SETTINGS[key]
    data_type = spec["data_type"]
    val_str = str(value).strip()

    # 1. Type validation
    if data_type == "integer":
        try:
            int_val = int(val_str)
        except ValueError:
            return False, f"Setting '{key}' must be a valid integer"

        if "min_val" in spec and int_val < spec["min_val"]:
            return False, f"Setting '{key}' cannot be less than {spec['min_val']}"
        if "max_val" in spec and int_val > spec["max_val"]:
            return False, f"Setting '{key}' cannot be greater than {spec['max_val']}"

    elif data_type == "boolean":
        lower_val = val_str.lower()
        if lower_val not in ["true", "false", "1", "0"]:
            return False, f"Setting '{key}' must be a boolean ('true' or 'false')"

    elif data_type == "string":
        if "min_len" in spec and len(val_str) < spec["min_len"]:
            return False, f"Setting '{key}' must be at least {spec['min_len']} characters long"
        if "max_len" in spec and len(val_str) > spec["max_len"]:
            return False, f"Setting '{key}' cannot exceed {spec['max_len']} characters"
        if spec.get("is_email"):
            if "@" not in val_str or "." not in val_str.split("@")[-1]:
                return False, f"Setting '{key}' must be a valid email address"
        if "allowed_values" in spec and val_str not in spec["allowed_values"]:
            allowed = ", ".join(spec["allowed_values"])
            return False, f"Setting '{key}' must be one of: {allowed}"

    return True, None


async def update_setting_value(db: AsyncSession, key: str, new_value: str) -> Tuple[Optional[SystemSetting], Optional[str], Optional[str]]:
    """Update a single setting value with validation.
    
    Returns (setting, old_value, error_message).
    """
    is_valid, err = validate_setting_value(key, new_value)
    if not is_valid:
        return None, None, err

    setting = await get_setting_by_key(db, key)
    if not setting:
        return None, None, f"Setting '{key}' not found"

    # Cross-field threshold consistency check
    if key in ["critical_stock_threshold_ml", "low_stock_threshold_ml"]:
        all_s = await get_all_settings(db)
        s_map = {s.key: s.value for s in all_s}
        s_map[key] = new_value

        crit = int(s_map.get("critical_stock_threshold_ml", "500"))
        low = int(s_map.get("low_stock_threshold_ml", "1500"))
        if crit >= low:
            return None, None, "Critical stock threshold must be strictly less than low stock threshold"

    old_value = setting.value
    # Standardize boolean strings
    if setting.data_type == "boolean":
        setting.value = "true" if new_value.strip().lower() in ["true", "1"] else "false"
    else:
        setting.value = new_value.strip()

    await db.commit()
    await db.refresh(setting)
    return setting, old_value, None
