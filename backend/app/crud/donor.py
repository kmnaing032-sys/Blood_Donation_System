from datetime import date
from typing import Tuple, List, Optional
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.donor import Donor
from app.models.user import User
from app.schemas.donor import DonorCreate, DonorUpdate


async def get_donor_by_id(
    db: AsyncSession,
    donor_id: int,
) -> Optional[Donor]:
    """Retrieve donor by donor ID."""
    result = await db.execute(
        select(Donor).where(Donor.id == donor_id)
    )
    return result.scalar_one_or_none()


async def get_donor_by_user_id(
    db: AsyncSession,
    user_id: int,
) -> Optional[Donor]:
    """Retrieve donor profile associated with a user ID."""
    result = await db.execute(
        select(Donor).where(Donor.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def get_donor_by_phone(
    db: AsyncSession,
    phone: str,
) -> Optional[Donor]:
    """Retrieve donor by phone number."""
    result = await db.execute(
        select(Donor).where(Donor.phone == phone)
    )
    return result.scalar_one_or_none()


async def create_donor(
    db: AsyncSession,
    donor_data: DonorCreate,
    user_id: int,
    auto_commit: bool = True,
) -> Donor:
    """Create a new donor record in PostgreSQL."""
    donor = Donor(
        user_id=user_id,
        phone=donor_data.phone,
        date_of_birth=donor_data.date_of_birth,
        gender=donor_data.gender,
        blood_group=donor_data.blood_group,
        address=donor_data.address,
    )
    db.add(donor)
    if auto_commit:
        await db.commit()
        await db.refresh(donor)
    else:
        await db.flush()
        await db.refresh(donor)
    return donor



async def get_all_donors(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 10,
    search: Optional[str] = None,
    name: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    blood_group: Optional[str] = None,
    gender: Optional[str] = None,
    is_active: Optional[bool] = None,
    min_age: Optional[int] = None,
    max_age: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    last_donation_from: Optional[date] = None,
    last_donation_to: Optional[date] = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
) -> Tuple[List[Donor], int]:
    """
    Retrieve paginated donors with advanced filtering:
    - Search across name, email, phone, or address
    - Specific filters for name, email, phone, blood_group, gender, is_active
    - Date range filters for profile creation (start_date, end_date)
    - Date range filters for last_donation_date (last_donation_from, last_donation_to)
    - Filter by age range (min_age / max_age) calculated via date_of_birth
    - Deterministic sorting by sort_by with Donor.id tie-breaker
    """
    query = select(Donor).outerjoin(User, Donor.user_id == User.id)
    count_query = select(func.count(Donor.id)).outerjoin(User, Donor.user_id == User.id)

    filters = []

    if blood_group:
        filters.append(Donor.blood_group == blood_group)
    if gender:
        filters.append(Donor.gender == gender)
    if phone:
        filters.append(Donor.phone.ilike(f"%{phone}%"))
    if name:
        filters.append(User.full_name.ilike(f"%{name}%"))
    if email:
        filters.append(User.email.ilike(f"%{email}%"))
    if is_active is not None:
        filters.append(User.is_active == is_active)

    if start_date:
        filters.append(func.date(Donor.created_at) >= start_date)
    if end_date:
        filters.append(func.date(Donor.created_at) <= end_date)

    if last_donation_from:
        filters.append(Donor.last_donation_date >= last_donation_from)
    if last_donation_to:
        filters.append(Donor.last_donation_date <= last_donation_to)

    if search:
        search_term = f"%{search}%"
        filters.append(
            or_(
                Donor.address.ilike(search_term),
                Donor.phone.ilike(search_term),
                User.full_name.ilike(search_term),
                User.email.ilike(search_term),
            )
        )

    # Age range filter: age = (today - date_of_birth) in years
    today = date.today()
    if min_age is not None:
        latest_dob = date(today.year - min_age, today.month, today.day)
        filters.append(Donor.date_of_birth <= latest_dob)

    if max_age is not None:
        earliest_dob = date(today.year - max_age - 1, today.month, today.day)
        filters.append(Donor.date_of_birth > earliest_dob)

    if filters:
        query = query.where(*filters)
        count_query = count_query.where(*filters)

    # Total count using database aggregation
    total_res = await db.execute(count_query)
    total = total_res.scalar_one() or 0

    # Sorting
    sort_field_map = {
        "created_at": Donor.created_at,
        "updated_at": Donor.updated_at,
        "blood_group": Donor.blood_group,
        "date_of_birth": Donor.date_of_birth,
        "last_donation_date": Donor.last_donation_date,
        "name": User.full_name,
        "email": User.email,
        "phone": Donor.phone,
    }
    col = sort_field_map.get(sort_by, Donor.created_at)
    order_clause = col.desc() if sort_order.lower() == "desc" else col.asc()

    query = query.order_by(order_clause, Donor.id.desc()).offset(skip).limit(limit)
    res = await db.execute(query)
    donors = res.scalars().all()

    return list(donors), total


async def update_donor(
    db: AsyncSession,
    donor: Donor,
    donor_data: DonorUpdate,
) -> Donor:
    """Update existing donor profile."""
    update_dict = donor_data.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(donor, field, value)

    await db.commit()
    await db.refresh(donor)
    return donor


async def delete_donor(
    db: AsyncSession,
    donor: Donor,
) -> bool:
    """Delete donor record."""
    await db.delete(donor)
    await db.commit()
    return True

