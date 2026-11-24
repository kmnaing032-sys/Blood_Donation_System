from datetime import datetime, date, timezone
from typing import Dict, Any, List, Tuple
from sqlalchemy import select, func, and_, case, text, extract, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.donor import Donor
from app.models.donation import Donation
from app.models.blood_stock import BloodStock
from app.models.blood_request import BloodRequest
from app.crud.blood_stock import ensure_all_blood_stocks_initialized, ALL_BLOOD_GROUPS

LOW_STOCK_THRESHOLD_ML = 1000  # Below 1000ml is low stock


# --- 1. CORE COUNT & VOLUME FUNCTIONS ---

async def get_total_users(db: AsyncSession) -> int:
    res = await db.execute(select(func.count(User.id)))
    return res.scalar_one() or 0


async def get_total_donors(db: AsyncSession) -> int:
    res = await db.execute(select(func.count(Donor.id)))
    return res.scalar_one() or 0


async def get_total_donations(db: AsyncSession) -> int:
    res = await db.execute(select(func.count(Donation.id)))
    return res.scalar_one() or 0


async def get_total_blood_stock(db: AsyncSession) -> Tuple[int, int]:
    """Returns (total_available_ml, total_reserved_ml)."""
    res = await db.execute(
        select(
            func.coalesce(func.sum(BloodStock.available_quantity_ml), 0),
            func.coalesce(func.sum(BloodStock.reserved_quantity_ml), 0),
        )
    )
    row = res.one()
    return int(row[0]), int(row[1])


async def get_requests_count_by_status(db: AsyncSession) -> Dict[str, int]:
    """Returns counts for all request statuses."""
    res = await db.execute(
        select(BloodRequest.status, func.count(BloodRequest.id))
        .group_by(BloodRequest.status)
    )
    counts = dict(res.all())
    return {
        "pending": counts.get("pending", 0),
        "approved": counts.get("approved", 0),
        "fulfilled": counts.get("fulfilled", 0),
        "rejected": counts.get("rejected", 0),
        "cancelled": counts.get("cancelled", 0),
    }


async def get_pending_requests(db: AsyncSession) -> int:
    res = await db.execute(select(func.count(BloodRequest.id)).where(BloodRequest.status == "pending"))
    return res.scalar_one() or 0


async def get_approved_requests(db: AsyncSession) -> int:
    res = await db.execute(select(func.count(BloodRequest.id)).where(BloodRequest.status == "approved"))
    return res.scalar_one() or 0


async def get_fulfilled_requests(db: AsyncSession) -> int:
    res = await db.execute(select(func.count(BloodRequest.id)).where(BloodRequest.status == "fulfilled"))
    return res.scalar_one() or 0


async def get_rejected_requests(db: AsyncSession) -> int:
    res = await db.execute(select(func.count(BloodRequest.id)).where(BloodRequest.status == "rejected"))
    return res.scalar_one() or 0


# --- 2. AGGREGATED DASHBOARD SERVICES ---

async def get_dashboard_summary(db: AsyncSession) -> Dict[str, Any]:
    """Summary overview for top-level stats cards."""
    total_u = await get_total_users(db)
    total_d = await get_total_donors(db)
    total_donations = await get_total_donations(db)
    total_avail, total_res = await get_total_blood_stock(db)
    req_counts = await get_requests_count_by_status(db)

    return {
        "total_users": total_u,
        "total_donors": total_d,
        "total_donations": total_donations,
        "total_blood_stock_ml": total_avail,
        "total_reserved_stock_ml": total_res,
        "pending_requests": req_counts["pending"],
        "approved_requests": req_counts["approved"],
        "fulfilled_requests": req_counts["fulfilled"],
        "rejected_requests": req_counts["rejected"],
        "cancelled_requests": req_counts["cancelled"],
        "generated_at": datetime.now(timezone.utc),
    }


async def get_donation_statistics(db: AsyncSession) -> Dict[str, Any]:
    """Calculates today's, this month's, this year's, all-time and group distributions."""
    today = date.today()
    first_day_of_month = date(today.year, today.month, 1)
    first_day_of_year = date(today.year, 1, 1)

    # Time-based aggregations using SQL CASE
    time_res = await db.execute(
        select(
            func.coalesce(func.count(Donation.id), 0).label("all_count"),
            func.coalesce(func.sum(Donation.quantity_ml), 0).label("all_vol"),
            func.coalesce(func.sum(case((Donation.donation_date == today, 1), else_=0)), 0).label("today_count"),
            func.coalesce(func.sum(case((Donation.donation_date == today, Donation.quantity_ml), else_=0)), 0).label("today_vol"),
            func.coalesce(func.sum(case((Donation.donation_date >= first_day_of_month, 1), else_=0)), 0).label("month_count"),
            func.coalesce(func.sum(case((Donation.donation_date >= first_day_of_month, Donation.quantity_ml), else_=0)), 0).label("month_vol"),
            func.coalesce(func.sum(case((Donation.donation_date >= first_day_of_year, 1), else_=0)), 0).label("year_count"),
            func.coalesce(func.sum(case((Donation.donation_date >= first_day_of_year, Donation.quantity_ml), else_=0)), 0).label("year_vol"),
        ).where(Donation.status == "completed")
    )
    t = time_res.one()

    # Grouped by blood group
    group_res = await db.execute(
        select(
            Donation.blood_group,
            func.count(Donation.id).label("cnt"),
            func.coalesce(func.sum(Donation.quantity_ml), 0).label("vol"),
        )
        .where(Donation.status == "completed")
        .group_by(Donation.blood_group)
    )
    group_dict = {row[0]: (row[1], int(row[2])) for row in group_res.all()}

    by_blood_group = [
        {
            "blood_group": bg,
            "count": group_dict.get(bg, (0, 0))[0],
            "total_volume_ml": group_dict.get(bg, (0, 0))[1],
        }
        for bg in ALL_BLOOD_GROUPS
    ]

    return {
        "today_count": int(t.today_count),
        "today_volume_ml": int(t.today_vol),
        "this_month_count": int(t.month_count),
        "this_month_volume_ml": int(t.month_vol),
        "this_year_count": int(t.year_count),
        "this_year_volume_ml": int(t.year_vol),
        "all_time_count": int(t.all_count),
        "all_time_volume_ml": int(t.all_vol),
        "by_blood_group": by_blood_group,
        "generated_at": datetime.now(timezone.utc),
    }


async def get_blood_stock_statistics(db: AsyncSession) -> Dict[str, Any]:
    """Calculates real-time inventory levels, low-stock, and out-of-stock alerts."""
    await ensure_all_blood_stocks_initialized(db)

    res = await db.execute(select(BloodStock).order_by(BloodStock.blood_group.asc()))
    stocks = res.scalars().all()

    total_avail = 0
    total_res = 0
    stocks_by_group = []
    low_stock_alerts = []
    out_of_stock_alerts = []

    for s in stocks:
        avail = s.available_quantity_ml
        res_v = s.reserved_quantity_ml
        tot = avail + res_v
        total_avail += avail
        total_res += res_v

        if avail == 0:
            st = "out_of_stock"
            out_of_stock_alerts.append(s.blood_group)
        elif avail < LOW_STOCK_THRESHOLD_ML:
            st = "low_stock"
            low_stock_alerts.append(s.blood_group)
        elif avail < 3000:
            st = "adequate"
        else:
            st = "sufficient"

        stocks_by_group.append({
            "blood_group": s.blood_group,
            "available_quantity_ml": avail,
            "reserved_quantity_ml": res_v,
            "total_quantity_ml": tot,
            "status": st,
        })

    return {
        "total_available_ml": total_avail,
        "total_reserved_ml": total_res,
        "total_inventory_ml": total_avail + total_res,
        "stocks_by_group": stocks_by_group,
        "low_stock_alerts": low_stock_alerts,
        "out_of_stock_alerts": out_of_stock_alerts,
        "generated_at": datetime.now(timezone.utc),
    }


async def get_blood_request_statistics(db: AsyncSession) -> Dict[str, Any]:
    """Calculates status breakdowns and requests grouped by blood group."""
    req_counts = await get_requests_count_by_status(db)
    total_reqs = sum(req_counts.values())

    # Grouped by blood group
    res = await db.execute(
        select(
            BloodRequest.blood_group,
            func.count(BloodRequest.id).label("cnt"),
            func.coalesce(func.sum(BloodRequest.quantity_ml), 0).label("vol"),
        ).group_by(BloodRequest.blood_group)
    )
    group_dict = {row[0]: (row[1], int(row[2])) for row in res.all()}

    by_blood_group = [
        {
            "blood_group": bg,
            "request_count": group_dict.get(bg, (0, 0))[0],
            "total_requested_ml": group_dict.get(bg, (0, 0))[1],
        }
        for bg in ALL_BLOOD_GROUPS
    ]

    return {
        "total_requests": total_reqs,
        "pending_requests": req_counts["pending"],
        "approved_requests": req_counts["approved"],
        "fulfilled_requests": req_counts["fulfilled"],
        "rejected_requests": req_counts["rejected"],
        "cancelled_requests": req_counts["cancelled"],
        "by_blood_group": by_blood_group,
        "generated_at": datetime.now(timezone.utc),
    }


async def get_monthly_donation_trends(db: AsyncSession, months_back: int = 6) -> List[Dict[str, Any]]:
    """Calculates monthly completed donation counts and volume trends."""
    # Use to_char(donation_date, 'YYYY-MM') for postgres monthly aggregation
    res = await db.execute(
        select(
            func.to_char(Donation.donation_date, "YYYY-MM").label("month_label"),
            func.count(Donation.id).label("cnt"),
            func.coalesce(func.sum(Donation.quantity_ml), 0).label("vol"),
        )
        .where(Donation.status == "completed")
        .group_by(text("month_label"))
        .order_by(text("month_label ASC"))
    )
    rows = res.all()
    return [
        {
            "month": r.month_label,
            "donation_count": int(r.cnt),
            "total_volume_ml": int(r.vol),
        }
        for r in rows
    ]
