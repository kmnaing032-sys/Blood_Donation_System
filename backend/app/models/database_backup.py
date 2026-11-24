from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, BigInteger, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.database.base import Base


class DatabaseBackup(Base):
    """Database backup history and metadata model."""
    __tablename__ = "database_backups"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), unique=True, nullable=False, index=True)
    file_path = Column(String(500), nullable=False)
    file_size_bytes = Column(BigInteger, nullable=False, default=0)
    format = Column(String(20), nullable=False, default="custom")  # 'custom' (.dump) or 'plain' (.sql)
    status = Column(String(30), nullable=False, default="completed")  # 'completed', 'failed'
    error_message = Column(String(500), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    created_by = relationship("User", foreign_keys=[created_by_id])
