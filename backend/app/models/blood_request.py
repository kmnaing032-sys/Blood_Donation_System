
from datetime import datetime

from sqlalchemy import (
    Integer,
    String,
    DateTime,
    Text,
    ForeignKey,
    CheckConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class BloodRequest(Base):
    __tablename__ = "blood_requests"

    __table_args__ = (
        CheckConstraint(
            "quantity_ml > 0",
            name="check_request_quantity_positive",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    patient_name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    hospital_name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    blood_group: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        index=True,
    )

    quantity_ml: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    urgency: Mapped[str] = mapped_column(
        String(20),
        default="normal",
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        default="pending",
        nullable=False,
        index=True,
    )

    contact_phone: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    hospital_address: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    required_by: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
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
            f"<BloodRequest("
            f"id={self.id}, "
            f"blood_group='{self.blood_group}', "
            f"status='{self.status}'"
            f")>"
        )
