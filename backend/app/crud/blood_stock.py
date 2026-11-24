from typing import Tuple, List, Optional
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.blood_stock import BloodStock
from app.schemas.blood_stock import BloodStockUpdate

ALL_BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]


async def ensure_all_blood_stocks_initialized(db: AsyncSession) -> None:
    """Ensures records for all 8 standard blood groups exist in the database."""
    res = await db.execute(select(BloodStock.blood_group))
    existing_groups = set(res.scalars().all())

    missing = [bg for bg in ALL_BLOOD_GROUPS if bg not in existing_groups]
    if missing:
        for bg in missing:
            stock = BloodStock(
                blood_group=bg,
                available_quantity_ml=0,
                reserved_quantity_ml=0,
            )
            db.add(stock)
        await db.commit()


async def get_blood_stock_by_id(
    db: AsyncSession,
    stock_id: int,
) -> Optional[BloodStock]:
    """Retrieve blood stock by ID."""
    result = await db.execute(
        select(BloodStock).where(BloodStock.id == stock_id)
    )
    return result.scalar_one_or_none()


async def get_blood_stock_by_group(
    db: AsyncSession,
    blood_group: str,
    for_update: bool = False,
) -> Optional[BloodStock]:
    """Retrieve blood stock by blood group with optional row-level lock."""
    query = select(BloodStock).where(BloodStock.blood_group == blood_group)
    if for_update:
        query = query.with_for_update()
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_all_blood_stocks(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 10,
    blood_group: Optional[str] = None,
    min_quantity: Optional[int] = None,
    max_quantity: Optional[int] = None,
    sort_by: str = "blood_group",
    sort_order: str = "asc",
) -> Tuple[List[BloodStock], int]:
    """Retrieve paginated blood stocks with optional blood_group, min/max quantity filters and sorting."""
    query = select(BloodStock)
    count_query = select(func.count(BloodStock.id))

    filters = []
    if blood_group:
        filters.append(BloodStock.blood_group == blood_group)
    if min_quantity is not None:
        filters.append(BloodStock.available_quantity_ml >= min_quantity)
    if max_quantity is not None:
        filters.append(BloodStock.available_quantity_ml <= max_quantity)

    if filters:
        query = query.where(*filters)
        count_query = count_query.where(*filters)

    total_res = await db.execute(count_query)
    total = total_res.scalar_one() or 0

    sort_field_map = {
        "blood_group": BloodStock.blood_group,
        "available_quantity_ml": BloodStock.available_quantity_ml,
        "reserved_quantity_ml": BloodStock.reserved_quantity_ml,
        "updated_at": BloodStock.updated_at,
        "id": BloodStock.id,
    }
    col = sort_field_map.get(sort_by, BloodStock.blood_group)
    order_clause = col.desc() if sort_order.lower() == "desc" else col.asc()

    query = query.order_by(order_clause, BloodStock.id.asc()).offset(skip).limit(limit)
    res = await db.execute(query)
    return list(res.scalars().all()), total


async def update_blood_stock(
    db: AsyncSession,
    stock: BloodStock,
    update_data: BloodStockUpdate,
) -> BloodStock:
    """Manually update available or reserved stock quantities."""
    update_dict = update_data.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        if value is not None and value < 0:
            raise ValueError(f"{field} cannot be negative.")
        setattr(stock, field, value)

    await db.commit()
    await db.refresh(stock)
    return stock


async def reserve_stock_for_request(
    db: AsyncSession,
    blood_group: str,
    quantity_ml: int,
) -> BloodStock:
    """
    Atomically reserve stock for an approved blood request:
    deduct from available_quantity_ml and add to reserved_quantity_ml.
    Prevents negative stock and uses row-level locking.
    """
    if quantity_ml <= 0:
        raise ValueError("Quantity to reserve must be greater than 0 ml.")

    stock = await get_blood_stock_by_group(db, blood_group, for_update=True)
    if not stock:
        raise ValueError(f"No stock record found for blood group '{blood_group}'.")

    if stock.available_quantity_ml < quantity_ml:
        raise ValueError(
            f"Insufficient available stock for blood group '{blood_group}'. "
            f"Required: {quantity_ml} ml, Available: {stock.available_quantity_ml} ml."
        )

    stock.available_quantity_ml -= quantity_ml
    stock.reserved_quantity_ml += quantity_ml
    await db.commit()
    await db.refresh(stock)
    return stock


async def fulfill_stock_for_request(
    db: AsyncSession,
    blood_group: str,
    quantity_ml: int,
) -> BloodStock:
    """
    Atomically fulfill an approved request:
    deduct from reserved_quantity_ml.
    """
    if quantity_ml <= 0:
        raise ValueError("Quantity to fulfill must be greater than 0 ml.")

    stock = await get_blood_stock_by_group(db, blood_group, for_update=True)
    if not stock:
        raise ValueError(f"No stock record found for blood group '{blood_group}'.")

    if stock.reserved_quantity_ml < quantity_ml:
        raise ValueError(
            f"Insufficient reserved stock for blood group '{blood_group}'. "
            f"Requested: {quantity_ml} ml, Reserved: {stock.reserved_quantity_ml} ml."
        )

    stock.reserved_quantity_ml -= quantity_ml
    await db.commit()
    await db.refresh(stock)
    return stock


async def release_reserved_stock(
    db: AsyncSession,
    blood_group: str,
    quantity_ml: int,
) -> BloodStock:
    """
    Release reserved stock back to available stock if a request is cancelled or rejected.
    """
    if quantity_ml <= 0:
        raise ValueError("Quantity to release must be greater than 0 ml.")

    stock = await get_blood_stock_by_group(db, blood_group, for_update=True)
    if not stock:
        raise ValueError(f"No stock record found for blood group '{blood_group}'.")

    if stock.reserved_quantity_ml < quantity_ml:
        raise ValueError(
            f"Cannot release {quantity_ml} ml. Only {stock.reserved_quantity_ml} ml reserved."
        )

    stock.reserved_quantity_ml -= quantity_ml
    stock.available_quantity_ml += quantity_ml
    await db.commit()
    await db.refresh(stock)
    return stock


async def get_stock_summary(db: AsyncSession):
    """Aggregate stock inventory summary across all blood groups."""
    await ensure_all_blood_stocks_initialized(db)
    res = await db.execute(select(BloodStock).order_by(BloodStock.blood_group.asc()))
    stocks = res.scalars().all()

    total_avail = 0
    total_res = 0
    items = []

    for s in stocks:
        tot = s.available_quantity_ml + s.reserved_quantity_ml
        total_avail += s.available_quantity_ml
        total_res += s.reserved_quantity_ml

        # Clinical status thresholds (standard blood bank volume reference)
        if s.available_quantity_ml == 0:
            status = "critical"
        elif s.available_quantity_ml < 1000:
            status = "low"
        elif s.available_quantity_ml < 3000:
            status = "normal"
        else:
            status = "sufficient"

        items.append({
            "blood_group": s.blood_group,
            "available_ml": s.available_quantity_ml,
            "reserved_ml": s.reserved_quantity_ml,
            "total_ml": tot,
            "status": status,
        })

    return {
        "total_available_ml": total_avail,
        "total_reserved_ml": total_res,
        "total_inventory_ml": total_avail + total_res,
        "stock_by_group": items,
    }

