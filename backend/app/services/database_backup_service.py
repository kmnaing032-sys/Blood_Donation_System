import os
import subprocess
import shutil
import logging
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from typing import Optional, Tuple, Dict, Any, List

from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Request

from app.core.config import settings
from app.models.user import User
from app.models.database_backup import DatabaseBackup
from app.crud.database_backup import (
    create_backup_record,
    get_backups,
    get_backup_by_id,
    delete_backup_record,
)
from app.services.audit_service import create_audit_log

logger = logging.getLogger(__name__)

# Base managed backup directory - isolated safely outside web roots
BACKUP_DIR = Path("C:/Users/kyawm/Desktop/Blood_Donation_System/backend/backups")

# Known PostgreSQL binary installation directories
PG_TOOL_PATHS = [
    Path("C:/Program Files/PostgreSQL/17/bin"),
    Path("C:/Program Files/PostgreSQL/16/bin"),
    Path("C:/Program Files/PostgreSQL/15/bin"),
]


def find_pg_tool(tool_name: str) -> Optional[str]:
    """Find the full path to a postgres utility executable securely."""
    # 1. Check system PATH
    tool_in_path = shutil.which(tool_name)
    if tool_in_path:
        return tool_in_path

    # 2. Check standard PostgreSQL installation directories
    ext = ".exe" if os.name == "nt" else ""
    target = f"{tool_name}{ext}"
    for pg_dir in PG_TOOL_PATHS:
        candidate = pg_dir / target
        if candidate.exists() and candidate.is_file():
            return str(candidate)

    return None


def get_connection_params() -> Dict[str, Any]:
    """Parse connection parameters from settings.DATABASE_URL securely."""
    url_str = settings.DATABASE_URL
    # Normalize asyncpg dialect for urllib parsing
    if url_str.startswith("postgresql+asyncpg://"):
        url_str = url_str.replace("postgresql+asyncpg://", "postgresql://", 1)

    parsed = urlparse(url_str)
    return {
        "user": parsed.username or "postgres",
        "password": parsed.password or "",
        "host": parsed.hostname or "localhost",
        "port": str(parsed.port or 5432),
        "dbname": parsed.path.lstrip("/") if parsed.path else "blood_donation_db",
    }


def ensure_backup_dir() -> Path:
    """Ensure backup storage directory exists securely."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    return BACKUP_DIR


class BackupService:
    @staticmethod
    async def create_backup(
        db: AsyncSession,
        current_admin: User,
        backup_format: str = "custom",
        request: Optional[Request] = None,
    ) -> Tuple[Optional[DatabaseBackup], Optional[str]]:
        """Run pg_dump using argument lists with secure password env passing."""
        pg_dump_path = find_pg_tool("pg_dump")
        if not pg_dump_path:
            err_msg = "PostgreSQL backup tool 'pg_dump' not found on server system"
            logger.error(err_msg)
            return None, err_msg

        backup_dir = ensure_backup_dir()
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        ext = "dump" if backup_format == "custom" else "sql"
        filename = f"blood_donation_db_backup_{timestamp}.{ext}"
        destination = backup_dir / filename

        conn = get_connection_params()

        # Build secure argument list (no shell=True)
        cmd: List[str] = [
            pg_dump_path,
            "-h", conn["host"],
            "-p", conn["port"],
            "-U", conn["user"],
            "-F", "c" if backup_format == "custom" else "p",
            "-f", str(destination),
            conn["dbname"],
        ]

        env = os.environ.copy()
        if conn["password"]:
            env["PGPASSWORD"] = conn["password"]

        ip_addr = request.client.host if request and request.client else None

        try:
            # Execute subprocess with timeout (60s)
            proc = subprocess.run(
                cmd,
                env=env,
                capture_output=True,
                text=True,
                timeout=60,
                check=False,
            )

            if proc.returncode != 0:
                err_detail = proc.stderr.strip() or f"pg_dump exited with return code {proc.returncode}"
                # Sanitize password from any potential error string
                if conn["password"]:
                    err_detail = err_detail.replace(conn["password"], "******")
                logger.error(f"Backup failed: {err_detail}")

                # Log failure event
                await create_audit_log(
                    db=db,
                    action="backup_failed",
                    entity_type="database_backup",
                    description=f"Admin {current_admin.email} backup creation failed: {err_detail[:300]}",
                    user_id=current_admin.id,
                    ip_address=ip_addr,
                )
                await db.commit()
                return None, f"Database backup execution failed: {err_detail}"

            # Calculate actual file size
            file_size = destination.stat().st_size if destination.exists() else 0

            # Create backup record in database
            backup_record = await create_backup_record(
                db=db,
                filename=filename,
                file_path=str(destination),
                file_size_bytes=file_size,
                format=backup_format,
                status="completed",
                created_by_id=current_admin.id,
            )

            # Audit log success
            await create_audit_log(
                db=db,
                action="backup_created",
                entity_type="database_backup",
                entity_id=backup_record.id,
                description=f"Admin {current_admin.email} successfully created database backup '{filename}' ({file_size} bytes)",
                user_id=current_admin.id,
                ip_address=ip_addr,
            )
            await db.commit()

            return backup_record, None

        except subprocess.TimeoutExpired:
            if destination.exists():
                destination.unlink(missing_ok=True)
            return None, "Database backup timed out after 60 seconds"
        except Exception as exc:
            if destination.exists():
                destination.unlink(missing_ok=True)
            logger.error(f"Unexpected error during backup: {exc}", exc_info=True)
            return None, f"Unexpected backup error: {str(exc)}"

    @staticmethod
    async def list_backups(db: AsyncSession) -> List[DatabaseBackup]:
        return await get_backups(db)

    @staticmethod
    async def get_backup(db: AsyncSession, backup_id: int) -> Optional[DatabaseBackup]:
        return await get_backup_by_id(db, backup_id)

    @staticmethod
    async def delete_backup(
        db: AsyncSession,
        backup_id: int,
        current_admin: User,
        request: Optional[Request] = None,
    ) -> Tuple[bool, Optional[str]]:
        backup = await get_backup_by_id(db, backup_id)
        if not backup:
            return False, f"Backup #{backup_id} not found"

        file_path = Path(backup.file_path)
        # Verify file is strictly within managed BACKUP_DIR (prevent path traversal)
        try:
            resolved = file_path.resolve()
            if not str(resolved).startswith(str(BACKUP_DIR.resolve())):
                return False, "Security violation: Backup path is outside managed directory"
        except Exception:
            return False, "Invalid backup file path"

        # Delete physical file
        if file_path.exists():
            try:
                file_path.unlink()
            except Exception as e:
                logger.warning(f"Could not delete physical backup file '{file_path}': {e}")

        filename = backup.filename
        await delete_backup_record(db, backup)

        ip_addr = request.client.host if request and request.client else None
        await create_audit_log(
            db=db,
            action="backup_deleted",
            entity_type="database_backup",
            entity_id=backup_id,
            description=f"Admin {current_admin.email} deleted database backup '{filename}'",
            user_id=current_admin.id,
            ip_address=ip_addr,
        )
        await db.commit()
        return True, None

    @staticmethod
    async def verify_restore_request(
        db: AsyncSession,
        backup_id: int,
        confirmation: str,
        current_admin: User,
        request: Optional[Request] = None,
    ) -> Tuple[bool, Optional[str]]:
        """Validate safety preconditions and log the restore attempt.
        
        Per safety requirements, restoring a live database over active connection pools
        can overwrite current records and break transaction states. This function
        validates the backup exists, checks confirmation token, and logs the attempt.
        """
        if confirmation != "CONFIRM_RESTORE":
            return False, "Explicit confirmation 'CONFIRM_RESTORE' is required to initiate restore preparation"

        backup = await get_backup_by_id(db, backup_id)
        if not backup:
            return False, f"Backup #{backup_id} not found"

        file_path = Path(backup.file_path)
        if not file_path.exists():
            return False, f"Physical backup file '{backup.filename}' does not exist on disk"

        ip_addr = request.client.host if request and request.client else None
        await create_audit_log(
            db=db,
            action="restore_prepared",
            entity_type="database_backup",
            entity_id=backup.id,
            description=f"Admin {current_admin.email} verified and prepared database restore for '{backup.filename}'",
            user_id=current_admin.id,
            ip_address=ip_addr,
        )
        await db.commit()
        return True, None
