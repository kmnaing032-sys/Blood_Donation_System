from datetime import date
from typing import Tuple, List, Optional
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.donation import Donation
from app.models.donor import Donor
from app.models.user import User
from app.models.blood_stock import BloodStock
from app.schemas.donation import DonationCreate, DonationUpdate

# Configurable minimum interval in days between whole blood donations
MIN_DONATION_INTERVAL_DAYS = 56  # 8 weeks standard medical guidelines


async def check_donor_eligibility(
    db: AsyncSession,
    donor: Donor,
    new_donation_date: date,
) -> Tuple[bool, Optional[str]]:
    """
    Validates donation eligibility based on established medical rules:
    1. Donor age check (donor must be between 18 and 65).
    2. Minimum interval between successful whole blood donations (56 days).
    """
    # 1. Age check
    today = date.today()
    age = today.year - donor.date_of_birth.year - (
        (today.month, today.day) < (donor.date_of_birth.month, donor.date_of_birth.day)
    )
    if age < 18 or age > 65:
        return False, f"Donor is not eligible by age criteria (Current age: {age}, permitted: 18-65)"

    # 2. Last donation interval check
    # Check donor.last_donation_date or most recent completed donation in database
    last_date = donor.last_donation_date

    # Also query the most recent completed donation date in database
    recent_res = await db.execute(
        select(Donation.donation_date)
        .where(
            Donation.donor_id == donor.id,
            Donation.status == "completed",
        )
        .order_by(Donation.donation_date.desc())
        .limit(1)
    )
    db_last_date = recent_res.scalar_one_or_none()
    if db_last_date and (last_date is None or db_last_date > last_date):
        last_date = db_last_date

    if last_date:
        days_since_last = (new_donation_date - last_date).days
        if days_since_last < MIN_DONATION_INTERVAL_DAYS:
            return (
                False,
                f"Donor is not eligible yet. Minimum {MIN_DONATION_INTERVAL_DAYS} days required between donations. "
                f"Days since last donation ({last_date}): {days_since_last} days.",
            )

    return True, None


async def get_or_create_blood_stock(
    db: AsyncSession,
    blood_group: str,
) -> BloodStock:
    """Retrieve or initialize blood stock row with row-level lock."""
    stock_res = await db.execute(
        select(BloodStock)
        .where(BloodStock.blood_group == blood_group)
        .with_for_update()
    )
    stock = stock_res.scalar_one_or_none()
    if not stock:
        stock = BloodStock(
            blood_group=blood_group,
            available_quantity_ml=0,
            reserved_quantity_ml=0,
        )
        db.add(stock)
        await db.flush()  # assign ID while in transaction
    return stock


async def get_donation_by_id(
    db: AsyncSession,
    donation_id: int,
) -> Optional[Donation]:
    """Retrieve donation by ID."""
    result = await db.execute(
        select(Donation).where(Donation.id == donation_id)
    )
    return result.scalar_one_or_none()


async def get_all_donations(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 10,
    donor_id: Optional[int] = None,
    blood_group: Optional[str] = None,
    donation_date: Optional[date] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = "donation_date",
    sort_order: str = "desc",
) -> Tuple[List[Donation], int]:
    """Retrieve paginated donations with search, filtering, and sorting."""
    query = select(Donation).outerjoin(Donor, Donation.donor_id == Donor.id).outerjoin(User, Donor.user_id == User.id)
    count_query = select(func.count(Donation.id)).outerjoin(Donor, Donation.donor_id == Donor.id).outerjoin(User, Donor.user_id == User.id)

    filters = []
    if donor_id is not None:
        filters.append(Donation.donor_id == donor_id)
    if blood_group is not None:
        filters.append(Donation.blood_group == blood_group)
    if donation_date is not None:
        filters.append(Donation.donation_date == donation_date)
    if status is not None:
        filters.append(Donation.status == status)
    if search is not None:
        search_term = f"%{search}%"
        filters.append(
            or_(
                User.full_name.ilike(search_term),
                Donation.notes.ilike(search_term),
            )
        )

    if filters:
        query = query.where(*filters)
        count_query = count_query.where(*filters)

    total_res = await db.execute(count_query)
    total = total_res.scalar_one() or 0

    sort_field_map = {
        "donation_date": Donation.donation_date,
        "created_at": Donation.created_at,
        "updated_at": Donation.updated_at,
        "quantity_ml": Donation.quantity_ml,
        "status": Donation.status,
    }
    col = sort_field_map.get(sort_by, Donation.donation_date)
    order_clause = col.desc() if sort_order.lower() == "desc" else col.asc()

    query = query.order_by(order_clause, Donation.id.desc()).offset(skip).limit(limit)
    res = await db.execute(query)
    donations = res.scalars().all()

    return list(donations), total


async def create_donation(
    db: AsyncSession,
    donor: Donor,
    donation_data: DonationCreate,
) -> Donation:
    """
    Atomically records a new donation and integrates with Blood Stock in a single transaction.
    """
    donation = Donation(
        donor_id=donor.id,
        donation_date=donation_data.donation_date,
        quantity_ml=donation_data.quantity_ml,
        blood_group=donation_data.blood_group,
        status=donation_data.status,
        notes=donation_data.notes,
    )
    db.add(donation)
    await db.flush()

    # If donation status is 'completed', update blood stock and donor's last_donation_date
    if donation.status == "completed":
        stock = await get_or_create_blood_stock(db, donation.blood_group)
        stock.available_quantity_ml += donation.quantity_ml

        # Update donor's last donation date if this donation date is newer
        if donor.last_donation_date is None or donation.donation_date > donor.last_donation_date:
            donor.last_donation_date = donation.donation_date

    await db.commit()
    await db.refresh(donation)
    return donation


async def update_donation(
    db: AsyncSession,
    donation: Donation,
    donor: Donor,
    update_data: DonationUpdate,
) -> Donation:
    """
    Atomically updates a donation. If status or quantity transitions occur,
    blood stock is appropriately adjusted within the same transaction.
    """
    prev_status = donation.status
    prev_quantity = donation.quantity_ml

    new_status = update_data.status if update_data.status is not None else prev_status
    new_quantity = update_data.quantity_ml if update_data.quantity_ml is not None else prev_quantity

    # Determine blood stock delta for 'completed' status
    # Case 1: was completed, remains completed -> delta = new_quantity - prev_quantity
    # Case 2: was not completed, becomes completed -> delta = +new_quantity
    # Case 3: was completed, becomes cancelled/rejected -> delta = -prev_quantity
    # Case 4: was not completed, remains not completed -> delta = 0
    delta = 0
    if prev_status == "completed" and new_status == "completed":
        delta = new_quantity - prev_quantity
    elif prev_status != "completed" and new_status == "completed":
        delta = new_quantity
    elif prev_status == "completed" and new_status != "completed":
        delta = -prev_quantity

    if delta != 0:
        stock = await get_or_create_blood_stock(db, donation.blood_group)
        if stock.available_quantity_ml + delta < 0:
            raise ValueError(
                f"Cannot reduce stock by {-delta} ml. Available stock is only {stock.available_quantity_ml} ml."
            )
        stock.available_quantity_ml += delta

    # Apply updates to donation record
    update_dict = update_data.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(donation, field, value)

    # Maintain donor's last_donation_date if completed
    if new_status == "completed" and (
        donor.last_donation_date is None or donation.donation_date > donor.last_donation_date
    ):
        donor.last_donation_date = donation.donation_date

    await db.commit()
    await db.refresh(donation)
    return donation


async def delete_donation(
    db: AsyncSession,
    donation: Donation,
) -> bool:
    """
    Atomically deletes a donation record and rolls back added blood stock
    if the donation was marked as completed.
    """
    if donation.status == "completed":
        stock = await get_or_create_blood_stock(db, donation.blood_group)
        if stock.available_quantity_ml - donation.quantity_ml < 0:
            raise ValueError(
                f"Cannot delete donation: available blood stock ({stock.available_quantity_ml} ml) "
                f"is less than donation quantity ({donation.quantity_ml} ml)."
            )
        stock.available_quantity_ml -= donation.quantity_ml

    await db.delete(donation)
    await db.commit()
    return True

