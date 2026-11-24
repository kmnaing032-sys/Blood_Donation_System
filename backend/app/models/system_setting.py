from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime
from app.database.base import Base


class SystemSetting(Base):
    """System settings table for configurable application properties.
    
    Stores key-value configurations grouped by category with metadata
    and type hints for validation.
    """
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=False)
    category = Column(String(50), nullable=False, index=True)
    data_type = Column(String(20), nullable=False)  # string, integer, boolean, json
    description = Column(String(255), nullable=True)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
