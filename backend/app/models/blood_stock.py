
from datetime import datetime

from sqlalchemy import (
    Integer,
    String,
    DateTime,
    CheckConstraint,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class BloodStock(Base):
    __tablename__ = "blood_stocks"

    __table_args__ = (
        UniqueConstraint(
            "blood_group",
            name="uq_blood_stock_group",
        ),
        CheckConstraint(
            "available_quantity_ml >= 0",
            name="check_available_quantity_positive",
        ),
        CheckConstraint(
            "reserved_quantity_ml >= 0",
            name="check_reserved_quantity_positive",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    blood_group: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        index=True,
    )

    available_quantity_ml: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    reserved_quantity_ml: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self):
        return (
            f"<BloodStock("
            f"blood_group='{self.blood_group}', "
            f"available={self.available_quantity_ml} ml"
            f")>"
        )
