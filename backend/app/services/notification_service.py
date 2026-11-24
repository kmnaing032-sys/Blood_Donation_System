import logging
from typing import Sequence
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.donor import Donor
from app.models.donation import Donation
from app.models.blood_stock import BloodStock
from app.models.blood_request import BloodRequest
from app.models.notification import Notification
from app.services.email_service import EmailService
from app.crud.email_notification import check_user_email_allowed, log_email_delivery

logger = logging.getLogger(__name__)


async def get_active_staff_and_admin_ids(
    db: AsyncSession,
    exclude_user_id: int | None = None,
) -> list[int]:
    """Retrieve user IDs for all active admin and staff accounts."""
    query = select(User.id).where(
        User.role.in_(["admin", "staff"]),
        User.is_active == True,  # noqa: E712
    )
    if exclude_user_id is not None:
        query = query.where(User.id != exclude_user_id)

    res = await db.execute(query)
    return list(res.scalars().all())


async def dispatch_notification(
    db: AsyncSession,
    recipient_id: int,
    title: str,
    message: str,
    category: str,
) -> Notification | None:
    """Create a notification in the current session.

    Transaction-safe: Attaches notification to current session.
    Duplicate prevention: Skips creation if an unread notification with identical
    title and recipient already exists.
    """
    # Check for existing unread duplicate
    existing = await db.execute(
        select(Notification.id).where(
            Notification.user_id == recipient_id,
            Notification.title == title,
            Notification.is_read == False,  # noqa: E712
        )
    )
    if existing.scalar_one_or_none() is not None:
        return None

    notification = Notification(
        user_id=recipient_id,
        title=title,
        message=message,
        category=category,
        is_read=False,
    )
    db.add(notification)

    # Email integration: Check SMTP configuration, user status and user email preferences
    if EmailService.is_smtp_configured():
        try:
            # Fetch recipient user to verify active status and email address
            user_res = await db.execute(select(User).where(User.id == recipient_id))
            recipient_user = user_res.scalar_one_or_none()

            if recipient_user and recipient_user.is_active and recipient_user.email:
                is_allowed = await check_user_email_allowed(db, recipient_id, category)
                if is_allowed:
                    plain_body, html_body = EmailService.build_email_template(
                        title=title, message=message, category=category
                    )
                    sent, err_msg = await EmailService.send_email(
                        recipient=recipient_user.email,
                        subject=title,
                        plain_content=plain_body,
                        html_content=html_body,
                    )
                    now_ts = datetime.now(timezone.utc) if sent else None
                    await log_email_delivery(
                        db=db,
                        recipient_email=recipient_user.email,
                        subject=title,
                        category=category,
                        status="sent" if sent else "failed",
                        recipient_user_id=recipient_id,
                        error_message=err_msg,
                        sent_at=now_ts,
                    )
        except Exception as e:
            # Ensure email delivery failure never interrupts the primary business transaction
            logger.error("Failed to process notification email for user %s: %s", recipient_id, e)

    return notification


async def notify_donor_registered(
    db: AsyncSession,
    donor: Donor,
    acting_user: User | None = None,
) -> None:
    """Triggered on successful donor profile creation.

    Recipients: Active staff and admins (excluding acting staff if applicable).
    """
    staff_admin_ids = await get_active_staff_and_admin_ids(
        db, exclude_user_id=acting_user.id if acting_user else None
    )
    title = f"New Donor Registered: {donor.blood_group}"
    message = (
        f"A new donor with blood group {donor.blood_group} has registered in the system."
    )
    for uid in staff_admin_ids:
        await dispatch_notification(db, uid, title, message, category="donor")

    # If registered by self, also notify the donor
    if donor.user_id and (not acting_user or acting_user.id != donor.user_id):
        await dispatch_notification(
            db,
            donor.user_id,
            "Donor Profile Active",
            f"Your donor profile ({donor.blood_group}) is now active.",
            category="donor",
        )
    await db.commit()


async def notify_donation_created(
    db: AsyncSession,
    donation: Donation,
    acting_user: User | None = None,
) -> None:
    """Triggered on successful blood donation record creation.

    Recipients: Donor owner and active staff/admins.
    """
    staff_admin_ids = await get_active_staff_and_admin_ids(
        db, exclude_user_id=acting_user.id if acting_user else None
    )
    title = f"Donation Recorded: {donation.blood_group}"
    message = (
        f"A blood donation of {donation.quantity_ml}ml ({donation.blood_group}) "
        f"was recorded with status '{donation.status}'."
    )
    for uid in staff_admin_ids:
        await dispatch_notification(db, uid, title, message, category="donation")

    # Notify the donor user if linked
    donor_res = await db.execute(select(Donor).where(Donor.id == donation.donor_id))
    donor = donor_res.scalar_one_or_none()
    if donor and donor.user_id and (not acting_user or acting_user.id != donor.user_id):
        await dispatch_notification(
            db,
            donor.user_id,
            "Blood Donation Recorded",
            f"Thank you! Your donation of {donation.quantity_ml}ml has been recorded.",
            category="donation",
        )
    await db.commit()


async def notify_blood_stock_changed(
    db: AsyncSession,
    stock: BloodStock,
    acting_user: User | None = None,
) -> None:
    """Triggered on blood stock calibration/update.

    Recipients: Active staff and admins.
    """
    staff_admin_ids = await get_active_staff_and_admin_ids(db)
    title = f"Stock Updated: {stock.blood_group}"
    message = (
        f"Inventory for {stock.blood_group} updated: "
        f"{stock.available_quantity_ml}ml available, {stock.reserved_quantity_ml}ml reserved."
    )
    for uid in staff_admin_ids:
        await dispatch_notification(db, uid, title, message, category="stock")
    await db.commit()


async def notify_blood_request_created(
    db: AsyncSession,
    blood_request: BloodRequest,
    acting_user: User | None = None,
) -> None:
    """Triggered on new blood request submission.

    Recipients: Active staff and admins.
    """
    staff_admin_ids = await get_active_staff_and_admin_ids(
        db, exclude_user_id=acting_user.id if acting_user else None
    )
    title = f"New Request: {blood_request.blood_group} ({blood_request.quantity_ml}ml)"
    message = (
        f"New request submitted for {blood_request.patient_name} at "
        f"{blood_request.hospital_name} with urgency '{blood_request.urgency}'."
    )
    for uid in staff_admin_ids:
        await dispatch_notification(db, uid, title, message, category="request")
    await db.commit()


async def notify_blood_request_status_changed(
    db: AsyncSession,
    blood_request: BloodRequest,
    previous_status: str,
    acting_user: User | None = None,
) -> None:
    """Triggered when blood request status is updated (approved, rejected, fulfilled, cancelled).

    Recipients:
      1. Requesting user (user_id) to track status progress.
      2. Staff/Admins if cancelled by the user.
    """
    # Notify requesting user
    if blood_request.user_id:
        title = f"Request {blood_request.status.capitalize()}: {blood_request.blood_group}"
        message = (
            f"Your request for {blood_request.quantity_ml}ml ({blood_request.blood_group}) "
            f"is now '{blood_request.status}'."
        )
        await dispatch_notification(
            db,
            blood_request.user_id,
            title,
            message,
            category="request",
        )

    # If request was cancelled by the user, notify staff/admins
    if blood_request.status == "cancelled":
        staff_admin_ids = await get_active_staff_and_admin_ids(
            db, exclude_user_id=acting_user.id if acting_user else None
        )
        title = f"Request Cancelled: {blood_request.blood_group}"
        message = (
            f"Blood request #{blood_request.id} for {blood_request.patient_name} "
            f"has been cancelled."
        )
        for uid in staff_admin_ids:
            await dispatch_notification(db, uid, title, message, category="request")

    await db.commit()
