from datetime import date, datetime
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, desc

from app.models.donor import Donor
from app.models.donation import Donation
from app.models.blood_stock import BloodStock
from app.models.blood_request import BloodRequest
from app.schemas.report import (
    DonorReportResponse,
    DonorGroupCount,
    DonorGenderCount,
    DonationReportResponse,
    DonationGroupVolume,
    DonationPeriodTrend,
    BloodStockReportResponse,
    BloodStockGroupReport,
    RequestReportResponse,
    RequestStatusCount,
    RequestGroupCount,
    RequestUrgencyCount,
    OperationalOverviewResponse,
)


# -------------------------------------------------------------
# 1. DONOR REPORTS
# -------------------------------------------------------------
async def get_donor_report(
    db: AsyncSession,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    blood_group: Optional[str] = None,
) -> DonorReportResponse:
    # Base filter
    filters = []
    if blood_group:
        filters.append(Donor.blood_group == blood_group)

    # Total donors
    total_q = select(func.count(Donor.id))
    if filters:
        total_q = total_q.where(and_(*filters))
    total_donors = (await db.execute(total_q)).scalar_one() or 0

    # Donors by blood group
    bg_q = select(Donor.blood_group, func.count(Donor.id)).group_by(Donor.blood_group)
    if filters:
        bg_q = bg_q.where(and_(*filters))
    bg_res = (await db.execute(bg_q)).all()
    by_blood_group = [DonorGroupCount(blood_group=row[0], count=row[1]) for row in bg_res]

    # Donors by gender
    gender_q = select(Donor.gender, func.count(Donor.id)).group_by(Donor.gender)
    if filters:
        gender_q = gender_q.where(and_(*filters))
    gender_res = (await db.execute(gender_q)).all()
    by_gender = [DonorGenderCount(gender=row[0], count=row[1]) for row in gender_res]

    # New donors in date range (based on created_at)
    new_filters = list(filters)
    if start_date:
        start_dt = datetime.combine(start_date, datetime.min.time())
        new_filters.append(Donor.created_at >= start_dt)
    if end_date:
        end_dt = datetime.combine(end_date, datetime.max.time())
        new_filters.append(Donor.created_at <= end_dt)

    new_q = select(func.count(Donor.id))
    if new_filters:
        new_q = new_q.where(and_(*new_filters))
    new_donors_in_period = (await db.execute(new_q)).scalar_one() or 0

    return DonorReportResponse(
        total_donors=total_donors,
        by_blood_group=by_blood_group,
        by_gender=by_gender,
        new_donors_in_period=new_donors_in_period,
        start_date=start_date,
        end_date=end_date,
    )


# -------------------------------------------------------------
# 2. DONATION REPORTS
# -------------------------------------------------------------
async def get_donation_report(
    db: AsyncSession,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    blood_group: Optional[str] = None,
    status: Optional[str] = None,
) -> DonationReportResponse:
    filters = []
    if blood_group:
        filters.append(Donation.blood_group == blood_group)
    if status:
        filters.append(Donation.status == status)
    if start_date:
        filters.append(Donation.donation_date >= start_date)
    if end_date:
        filters.append(Donation.donation_date <= end_date)

    # Total donations and volume
    tot_q = select(
        func.count(Donation.id),
        func.coalesce(func.sum(Donation.quantity_ml), 0)
    )
    if filters:
        tot_q = tot_q.where(and_(*filters))
    tot_res = (await db.execute(tot_q)).first()
    total_donations = tot_res[0] if tot_res else 0
    total_volume_ml = tot_res[1] if tot_res else 0

    # By blood group
    bg_q = select(
        Donation.blood_group,
        func.count(Donation.id),
        func.coalesce(func.sum(Donation.quantity_ml), 0),
    ).group_by(Donation.blood_group)
    if filters:
        bg_q = bg_q.where(and_(*filters))
    bg_res = (await db.execute(bg_q)).all()
    by_blood_group = [
        DonationGroupVolume(blood_group=row[0], count=row[1], total_volume_ml=row[2])
        for row in bg_res
    ]

    # Trends by month (using PostgreSQL to_char)
    month_col = func.to_char(Donation.donation_date, "YYYY-MM")
    trend_q = select(
        month_col.label("period"),
        func.count(Donation.id),
        func.coalesce(func.sum(Donation.quantity_ml), 0),
    ).group_by(month_col).order_by(month_col)
    if filters:
        trend_q = trend_q.where(and_(*filters))
    trend_res = (await db.execute(trend_q)).all()
    trends = [
        DonationPeriodTrend(period=row[0], count=row[1], volume_ml=row[2])
        for row in trend_res
    ]

    return DonationReportResponse(
        total_donations=total_donations,
        total_volume_ml=total_volume_ml,
        by_blood_group=by_blood_group,
        trends=trends,
        start_date=start_date,
        end_date=end_date,
    )


# -------------------------------------------------------------
# 3. BLOOD STOCK REPORTS
# -------------------------------------------------------------
async def get_blood_stock_report(
    db: AsyncSession,
    blood_group: Optional[str] = None,
) -> BloodStockReportResponse:
    q = select(BloodStock).order_by(BloodStock.blood_group)
    if blood_group:
        q = q.where(BloodStock.blood_group == blood_group)
    res = (await db.execute(q)).scalars().all()

    total_avail = sum(s.available_quantity_ml for s in res)
    total_resv = sum(s.reserved_quantity_ml for s in res)
    total_inv = total_avail + total_resv

    by_blood_group = []
    low_stock = []
    crit_stock = []

    for s in res:
        grp_tot = s.available_quantity_ml + s.reserved_quantity_ml
        pct = round((grp_tot / total_inv * 100), 2) if total_inv > 0 else 0.0
        by_blood_group.append(BloodStockGroupReport(
            blood_group=s.blood_group,
            available_quantity_ml=s.available_quantity_ml,
            reserved_quantity_ml=s.reserved_quantity_ml,
            total_quantity_ml=grp_tot,
            percentage_of_total=pct,
        ))

        # Classify thresholds
        if s.available_quantity_ml < 500:
            crit_stock.append(s.blood_group)
        elif s.available_quantity_ml < 1500:
            low_stock.append(s.blood_group)

    return BloodStockReportResponse(
        total_available_volume_ml=total_avail,
        total_reserved_volume_ml=total_resv,
        total_inventory_volume_ml=total_inv,
        by_blood_group=by_blood_group,
        low_stock_groups=low_stock,
        critical_stock_groups=crit_stock,
    )


# -------------------------------------------------------------
# 4. BLOOD REQUEST REPORTS
# -------------------------------------------------------------
async def get_blood_request_report(
    db: AsyncSession,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    blood_group: Optional[str] = None,
    status: Optional[str] = None,
) -> RequestReportResponse:
    filters = []
    if blood_group:
        filters.append(BloodRequest.blood_group == blood_group)
    if status:
        filters.append(BloodRequest.status == status)
    if start_date:
        start_dt = datetime.combine(start_date, datetime.min.time())
        filters.append(BloodRequest.created_at >= start_dt)
    if end_date:
        end_dt = datetime.combine(end_date, datetime.max.time())
        filters.append(BloodRequest.created_at <= end_dt)

    # Total requests
    tot_q = select(func.count(BloodRequest.id))
    if filters:
        tot_q = tot_q.where(and_(*filters))
    total_requests = (await db.execute(tot_q)).scalar_one() or 0

    # By status
    st_q = select(BloodRequest.status, func.count(BloodRequest.id)).group_by(BloodRequest.status)
    if filters:
        st_q = st_q.where(and_(*filters))
    st_res = (await db.execute(st_q)).all()
    by_status = [RequestStatusCount(status=row[0], count=row[1]) for row in st_res]

    status_map = {row[0]: row[1] for row in st_res}
    pending_count = status_map.get("pending", 0)
    approved_count = status_map.get("approved", 0)
    fulfilled_count = status_map.get("fulfilled", 0)
    rejected_count = status_map.get("rejected", 0)
    cancelled_count = status_map.get("cancelled", 0)

    # By blood group
    bg_q = select(
        BloodRequest.blood_group,
        func.count(BloodRequest.id),
        func.coalesce(func.sum(BloodRequest.quantity_ml), 0),
    ).group_by(BloodRequest.blood_group)
    if filters:
        bg_q = bg_q.where(and_(*filters))
    bg_res = (await db.execute(bg_q)).all()
    by_blood_group = [
        RequestGroupCount(blood_group=row[0], count=row[1], total_quantity_ml=row[2])
        for row in bg_res
    ]

    # By urgency
    urg_q = select(BloodRequest.urgency, func.count(BloodRequest.id)).group_by(BloodRequest.urgency)
    if filters:
        urg_q = urg_q.where(and_(*filters))
    urg_res = (await db.execute(urg_q)).all()
    by_urgency = [RequestUrgencyCount(urgency=row[0], count=row[1]) for row in urg_res]

    return RequestReportResponse(
        total_requests=total_requests,
        by_status=by_status,
        by_blood_group=by_blood_group,
        by_urgency=by_urgency,
        pending_count=pending_count,
        approved_count=approved_count,
        fulfilled_count=fulfilled_count,
        rejected_count=rejected_count,
        cancelled_count=cancelled_count,
        start_date=start_date,
        end_date=end_date,
    )


# -------------------------------------------------------------
# 5. OPERATIONAL OVERVIEW
# -------------------------------------------------------------
async def get_operational_overview(
    db: AsyncSession,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> OperationalOverviewResponse:
    # 1. Donors
    total_donors = (await db.execute(select(func.count(Donor.id)))).scalar_one() or 0
    donor_filters = []
    if start_date:
        donor_filters.append(Donor.created_at >= datetime.combine(start_date, datetime.min.time()))
    if end_date:
        donor_filters.append(Donor.created_at <= datetime.combine(end_date, datetime.max.time()))
    new_donors_q = select(func.count(Donor.id))
    if donor_filters:
        new_donors_q = new_donors_q.where(and_(*donor_filters))
    new_donors = (await db.execute(new_donors_q)).scalar_one() or 0

    # 2. Donations
    donation_filters = []
    if start_date:
        donation_filters.append(Donation.donation_date >= start_date)
    if end_date:
        donation_filters.append(Donation.donation_date <= end_date)
    don_q = select(
        func.count(Donation.id),
        func.coalesce(func.sum(Donation.quantity_ml), 0)
    )
    if donation_filters:
        don_q = don_q.where(and_(*donation_filters))
    don_res = (await db.execute(don_q)).first()
    total_donations = don_res[0] if don_res else 0
    total_donated_volume_ml = don_res[1] if don_res else 0

    # 3. Available stock
    stock_q = select(func.coalesce(func.sum(BloodStock.available_quantity_ml), 0))
    total_avail_stock = (await db.execute(stock_q)).scalar_one() or 0

    # 4. Requests
    req_filters = []
    if start_date:
        req_filters.append(BloodRequest.created_at >= datetime.combine(start_date, datetime.min.time()))
    if end_date:
        req_filters.append(BloodRequest.created_at <= datetime.combine(end_date, datetime.max.time()))
    
    tot_req_q = select(func.count(BloodRequest.id))
    if req_filters:
        tot_req_q = tot_req_q.where(and_(*req_filters))
    total_requests = (await db.execute(tot_req_q)).scalar_one() or 0

    pend_q = select(func.count(BloodRequest.id)).where(BloodRequest.status == "pending")
    if req_filters:
        pend_q = pend_q.where(and_(*req_filters))
    pending_requests = (await db.execute(pend_q)).scalar_one() or 0

    fulf_q = select(func.count(BloodRequest.id)).where(BloodRequest.status == "fulfilled")
    if req_filters:
        fulf_q = fulf_q.where(and_(*req_filters))
    fulfilled_requests = (await db.execute(fulf_q)).scalar_one() or 0

    return OperationalOverviewResponse(
        total_donors=total_donors,
        new_donors_in_period=new_donors,
        total_donations=total_donations,
        total_donated_volume_ml=total_donated_volume_ml,
        total_available_stock_ml=total_avail_stock,
        total_requests=total_requests,
        pending_requests=pending_requests,
        fulfilled_requests=fulfilled_requests,
        start_date=start_date,
        end_date=end_date,
    )
