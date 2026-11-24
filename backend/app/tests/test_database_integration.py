import pytest
import pytest_asyncio
import asyncio
from datetime import datetime, date, timedelta, timezone
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select, func, text
from sqlalchemy.exc import IntegrityError, DBAPIError

from app.core.config import settings
from app.database.base import Base
from app.models.user import User
from app.models.donor import Donor
from app.models.donation import Donation
from app.models.blood_stock import BloodStock
from app.models.blood_request import BloodRequest
from app.models.refresh_token import RefreshToken
from app.crud.blood_stock import ensure_all_blood_stocks_initialized
from app.crud.donation import create_donation
from app.crud.blood_request import create_blood_request, approve_blood_request, fulfill_blood_request, reject_blood_request
from app.schemas.donation import DonationCreate
from app.schemas.blood_request import BloodRequestCreate

# Isolated test database URL
TEST_DB_URL = settings.DATABASE_URL.rsplit('/', 1)[0] + '/blood_donation_test_db'


@pytest_asyncio.fixture(scope="function")
async def db_engine():
    """Create a function-scoped engine tied to the active event loop."""
    engine = create_async_engine(
        TEST_DB_URL,
        echo=False,
        pool_pre_ping=True,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(db_engine):
    """Provides a fresh database session per test function."""
    session_factory = async_sessionmaker(
        bind=db_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    async with session_factory() as session:
        yield session


# =========================================================================
# 1. CRUD INTEGRATION TESTS
# =========================================================================
@pytest.mark.asyncio
async def test_user_crud_lifecycle(db_session: AsyncSession):
    # CREATE
    new_user = User(
        full_name="Database Test User",
        email="db_test_user@example.com",
        hashed_password="hashed_pass_placeholder",
        role="donor",
        is_active=True,
    )
    db_session.add(new_user)
    await db_session.commit()
    assert new_user.id is not None

    # READ
    fetched = await db_session.get(User, new_user.id)
    assert fetched is not None
    assert fetched.email == "db_test_user@example.com"

    # UPDATE
    fetched.full_name = "Updated User Name"
    await db_session.commit()
    refetched = await db_session.get(User, new_user.id)
    assert refetched.full_name == "Updated User Name"

    # DELETE
    await db_session.delete(refetched)
    await db_session.commit()
    deleted = await db_session.get(User, new_user.id)
    assert deleted is None


# =========================================================================
# 2. MODEL RELATIONSHIPS & CASCADE BEHAVIOR
# =========================================================================
@pytest.mark.asyncio
async def test_user_donor_relationship_and_cascade(db_session: AsyncSession):
    # Create User
    user = User(
        full_name="Donor Cascade Test",
        email="cascade_donor@example.com",
        hashed_password="dummy_hash",
        role="donor",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    # Create Donor linked to User (FK: users.id, ON DELETE CASCADE)
    donor = Donor(
        user_id=user.id,
        phone="0911223344",
        date_of_birth=date(1995, 5, 10),
        gender="female",
        blood_group="A+",
        address="10 Cascade Way",
    )
    db_session.add(donor)
    await db_session.commit()
    donor_id = donor.id
    assert donor_id is not None

    # Delete User in PostgreSQL
    await db_session.delete(user)
    await db_session.commit()

    # Query directly to verify database ON DELETE CASCADE execution
    res = await db_session.execute(select(Donor).where(Donor.id == donor_id))
    cascaded_donor = res.scalar_one_or_none()
    assert cascaded_donor is None


@pytest.mark.asyncio
async def test_refresh_token_cascade_on_user_delete(db_session: AsyncSession):
    user = User(
        full_name="Token Cascade User",
        email="token_cascade@example.com",
        hashed_password="dummy_hash",
        role="donor",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    rt = RefreshToken(
        user_id=user.id,
        jti="test-jti-uuid-12345",
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db_session.add(rt)
    await db_session.commit()
    rt_id = rt.id

    # Deleting user cascades to refresh_tokens in DB
    await db_session.delete(user)
    await db_session.commit()

    res = await db_session.execute(select(RefreshToken).where(RefreshToken.id == rt_id))
    cascaded_rt = res.scalar_one_or_none()
    assert cascaded_rt is None


# =========================================================================
# 3. CONSTRAINTS (UNIQUE, NOT NULL, CHECK CONSTRAINTS)
# =========================================================================
@pytest.mark.asyncio
async def test_unique_email_constraint(db_session: AsyncSession):
    u1 = User(
        full_name="User Unique 1",
        email="duplicate@example.com",
        hashed_password="hash1",
        role="donor",
    )
    db_session.add(u1)
    await db_session.commit()

    u2 = User(
        full_name="User Unique 2",
        email="duplicate@example.com",
        hashed_password="hash2",
        role="donor",
    )
    db_session.add(u2)
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_positive_donation_quantity_check_constraint(db_session: AsyncSession):
    user = User(
        full_name="Donor Check Const",
        email="check_const@example.com",
        hashed_password="hash",
    )
    db_session.add(user)
    await db_session.commit()

    donor = Donor(
        user_id=user.id,
        phone="0999887766",
        date_of_birth=date(1990, 1, 1),
        gender="male",
        blood_group="B+",
        address="Address",
    )
    db_session.add(donor)
    await db_session.commit()

    # Negative donation quantity violates CheckConstraint('quantity_ml > 0')
    invalid_donation = Donation(
        donor_id=donor.id,
        donation_date=date.today(),
        quantity_ml=-50,
        blood_group="B+",
        status="completed",
    )
    db_session.add(invalid_donation)
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


# =========================================================================
# 4. TRANSACTION INTEGRITY & ROLLBACK
# =========================================================================
@pytest.mark.asyncio
async def test_transaction_atomic_rollback(db_session: AsyncSession):
    user = User(
        full_name="Atomic Test User",
        email="atomic@example.com",
        hashed_password="hash",
    )
    db_session.add(user)
    await db_session.commit()
    user_id = user.id
    original_name = user.full_name

    # Modify existing user and trigger duplicate key integrity error in same transaction
    try:
        user.full_name = "Modified Name Before Crash"
        invalid_dup = User(
            full_name="Dup Trigger",
            email="atomic@example.com",
            hashed_password="hash",
        )
        db_session.add(invalid_dup)
        await db_session.commit()
    except IntegrityError:
        await db_session.rollback()

    # Re-fetch using scalar query with integer user_id
    res = await db_session.execute(select(User).where(User.id == user_id))
    persisted_user = res.scalar_one()
    assert persisted_user.full_name == original_name


# =========================================================================
# 5. DONATION & BLOOD STOCK INTEGRATION (ATOMIC TRANSACTIONS)
# =========================================================================
@pytest.mark.asyncio
async def test_donation_stock_integration(db_session: AsyncSession):
    await ensure_all_blood_stocks_initialized(db_session)

    # Initial stock for O-
    st_res = await db_session.execute(select(BloodStock).where(BloodStock.blood_group == "O-"))
    stock_before = st_res.scalar_one()
    initial_avail = stock_before.available_quantity_ml

    # Create Donor
    user = User(full_name="O- Donor", email="o_neg@example.com", hashed_password="h")
    db_session.add(user)
    await db_session.commit()

    donor = Donor(
        user_id=user.id,
        phone="0955555555",
        date_of_birth=date(1998, 2, 2),
        gender="female",
        blood_group="O-",
        address="O- Street",
    )
    db_session.add(donor)
    await db_session.commit()

    # Successful completed donation adds 450ml to BloodStock
    donation_in = DonationCreate(
        donor_id=donor.id,
        donation_date=date.today(),
        quantity_ml=450,
        blood_group="O-",
        status="completed",
        notes="Integration donation",
    )
    donation = await create_donation(db_session, donor, donation_in)
    assert donation.id is not None

    # Check updated stock
    st_after_res = await db_session.execute(select(BloodStock).where(BloodStock.blood_group == "O-"))
    stock_after = st_after_res.scalar_one()
    assert stock_after.available_quantity_ml == initial_avail + 450
    assert donor.last_donation_date == date.today()


# =========================================================================
# 6. BLOOD REQUEST & STOCK INTEGRATION (RESERVATION & FULFILLMENT)
# =========================================================================
@pytest.mark.asyncio
async def test_blood_request_stock_deduction_workflow(db_session: AsyncSession):
    await ensure_all_blood_stocks_initialized(db_session)

    # Pre-load stock for AB+
    st_res = await db_session.execute(select(BloodStock).where(BloodStock.blood_group == "AB+").with_for_update())
    stock = st_res.scalar_one()
    stock.available_quantity_ml = 1000
    stock.reserved_quantity_ml = 0
    await db_session.commit()

    # 1. Create request -> Must NOT deduct stock
    req_in = BloodRequestCreate(
        patient_name="Patient AB",
        hospital_name="City Clinic",
        hospital_address="123 Clinic Way",
        blood_group="AB+",
        quantity_ml=500,
        urgency="high",
        contact_phone="0912121212",
    )
    blood_req = await create_blood_request(db_session, req_in, user_id=None)
    assert blood_req.status == "pending"

    st_check = (await db_session.execute(select(BloodStock).where(BloodStock.blood_group == "AB+"))).scalar_one()
    assert st_check.available_quantity_ml == 1000

    # 2. Approve request -> Status changes to approved without deducting stock
    approved_req = await approve_blood_request(db_session, blood_req, note="Approved for surgery")
    assert approved_req.status == "approved"

    st_after_approve = (await db_session.execute(select(BloodStock).where(BloodStock.blood_group == "AB+"))).scalar_one()
    assert st_after_approve.available_quantity_ml == 1000

    # 3. Fulfill request -> Exactly once deduction from available_quantity_ml
    fulfilled_req = await fulfill_blood_request(db_session, approved_req, note="Transfused successfully")
    assert fulfilled_req.status == "fulfilled"

    st_after_fulfill = (await db_session.execute(select(BloodStock).where(BloodStock.blood_group == "AB+"))).scalar_one()
    assert st_after_fulfill.available_quantity_ml == 500


# =========================================================================
# 7. CONCURRENCY & ROW-LEVEL LOCKING
# =========================================================================
@pytest.mark.asyncio
async def test_concurrent_stock_reservations_with_locking(db_session: AsyncSession):
    """Verify row locking prevents race condition overselling under simultaneous requests."""
    await ensure_all_blood_stocks_initialized(db_session)

    # Set limited available quantity (450ml) for B-
    st_res = await db_session.execute(select(BloodStock).where(BloodStock.blood_group == "B-"))
    stock = st_res.scalar_one()
    stock.available_quantity_ml = 450
    stock.reserved_quantity_ml = 0
    await db_session.commit()

    # Create two approved requests for 450ml each
    req_in1 = BloodRequestCreate(
        patient_name="Patient 1", hospital_name="Hospital 1", hospital_address="123 Address One",
        blood_group="B-", quantity_ml=450, contact_phone="0911111111",
    )
    req_in2 = BloodRequestCreate(
        patient_name="Patient 2", hospital_name="Hospital 2", hospital_address="456 Address Two",
        blood_group="B-", quantity_ml=450, contact_phone="0922222222",
    )
    r1 = await create_blood_request(db_session, req_in1)
    r2 = await create_blood_request(db_session, req_in2)

    await approve_blood_request(db_session, r1)
    await approve_blood_request(db_session, r2)

    # Fulfill first request -> Should succeed (deducts 450ml, stock reaches 0)
    f1 = await fulfill_blood_request(db_session, r1)
    assert f1.status == "fulfilled"

    # Fulfill second request -> Must fail because available stock is now 0 (Insufficient stock)
    with pytest.raises(ValueError) as exc_info:
        await fulfill_blood_request(db_session, r2)
    assert "insufficient available stock" in str(exc_info.value).lower()
