from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    Index,
)
from app.database.base import Base


class DataImportLog(Base):
    """Tracks metadata and statistics of bulk data import operations.
    
    Safe retention: Stores counts and sanitized error logs.
    Does NOT store full CSV text or donor personal PII permanently.
    """
    __tablename__ = "data_import_logs"

    id = Column(Integer, primary_key=True, index=True)
    import_type = Column(String(50), nullable=False, default="donors", index=True)
    filename = Column(String(255), nullable=False)
    total_rows = Column(Integer, nullable=False, default=0)
    created_rows = Column(Integer, nullable=False, default=0)
    skipped_rows = Column(Integer, nullable=False, default=0)
    failed_rows = Column(Integer, nullable=False, default=0)
    status = Column(String(30), nullable=False, default="completed", index=True) # completed, failed, partial
    error_summary = Column(String(1000), nullable=True)
    created_by_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    def __repr__(self) -> str:
        return (
            f"<DataImportLog(id={self.id}, type='{self.import_type}', "
            f"created={self.created_rows}, status='{self.status}')>"
        )
