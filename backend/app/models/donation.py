
from datetime import date, datetime

from sqlalchemy import (
    Integer,
    String,
    Date,
    DateTime,
    Text,
    ForeignKey,
    CheckConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class Donation(Base):
    __tablename__ = "donations"

    __table_args__ = (
        CheckConstraint(
            "quantity_ml > 0",
            name="check_donation_quantity_positive",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    donor_id: Mapped[int] = mapped_column(
        ForeignKey("donors.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    donation_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        index=True,
    )

    quantity_ml: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    blood_group: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        default="completed",
        nullable=False,
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
            f"<Donation(id={self.id}, "
            f"donor_id={self.donor_id}, "
            f"quantity_ml={self.quantity_ml})>"
        )
