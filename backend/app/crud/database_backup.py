from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.models.database_backup import DatabaseBackup


async def create_backup_record(
    db: AsyncSession,
    filename: str,
    file_path: str,
    file_size_bytes: int,
    format: str,
    status: str,
    created_by_id: Optional[int] = None,
    error_message: Optional[str] = None,
) -> DatabaseBackup:
    backup = DatabaseBackup(
        filename=filename,
        file_path=file_path,
        file_size_bytes=file_size_bytes,
        format=format,
        status=status,
        created_by_id=created_by_id,
        error_message=error_message,
    )
    db.add(backup)
    await db.commit()
    await db.refresh(backup)
    return backup


async def get_backups(db: AsyncSession) -> List[DatabaseBackup]:
    res = await db.execute(select(DatabaseBackup).order_by(desc(DatabaseBackup.created_at)))
    return list(res.scalars().all())


async def get_backup_by_id(db: AsyncSession, backup_id: int) -> Optional[DatabaseBackup]:
    res = await db.execute(select(DatabaseBackup).where(DatabaseBackup.id == backup_id))
    return res.scalar_one_or_none()


async def delete_backup_record(db: AsyncSession, backup: DatabaseBackup) -> None:
    await db.delete(backup)
    await db.commit()
