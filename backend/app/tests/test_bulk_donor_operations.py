import asyncio
import json
from typing import Any, Tuple
from sqlalchemy import select
from datetime import date

from app.main import app
from app.database.database import AsyncSessionLocal
from app.models.user import User
from app.models.donor import Donor
from app.models.donation import Donation
from app.models.audit_log import AuditLog
from app.core.token import create_access_token


async def dispatch_json(
    method: str,
    path: str,
    payload: dict | list | None = None,
    token: str | None = None,
) -> Tuple[int, Any]:
    """Execute JSON request directly against ASGI app."""
    body_bytes = json.dumps(payload).encode("utf-8") if payload is not None else b""

    headers = [
        (b"content-type", b"application/json"),
        (b"content-length", str(len(body_bytes)).encode("utf-8")),
    ]
    if token:
        headers.append((b"authorization", f"Bearer {token}".encode("utf-8")))

    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": method,
        "path": path,
        "raw_path": path.encode("utf-8"),
        "query_string": b"",
        "headers": headers,
        "client": ("127.0.0.1", 12345),
    }

    response_status = 500
    response_body = bytearray()
    sent_request = False

    async def receive():
        nonlocal sent_request
        if not sent_request:
            sent_request = True
            return {"type": "http.request", "body": body_bytes, "more_body": False}
        return {"type": "http.disconnect"}

    async def send(message):
        nonlocal response_status, response_body
        if message["type"] == "http.response.start":
            response_status = message["status"]
        elif message["type"] == "http.response.body":
            response_body.extend(message.get("body", b""))

    await app(scope, receive, send)

    try:
        data = json.loads(response_body.decode("utf-8")) if response_body else None
    except Exception:
        data = response_body.decode("utf-8", errors="replace")

    return response_status, data


async def run_bulk_donor_tests():
    print("=== Running Bulk Donor Management Verification Suite (Step 1.27) ===")

    # 1. Fetch Users & Tokens
    async with AsyncSessionLocal() as session:
        admin_res = await session.execute(select(User).where(User.role == "admin", User.is_active == True))
        admin = admin_res.scalars().first()
        staff_res = await session.execute(select(User).where(User.role == "staff", User.is_active == True))
        staff = staff_res.scalars().first()
        donor_res = await session.execute(select(User).where(User.role == "donor", User.is_active == True))
        donor_user = donor_res.scalars().first()

    assert admin is not None, "Admin user must exist"
    assert staff is not None, "Staff user must exist"
    assert donor_user is not None, "Donor user must exist"

    admin_token = create_access_token(data={"sub": str(admin.id)})
    staff_token = create_access_token(data={"sub": str(staff.id)})
    donor_token = create_access_token(data={"sub": str(donor_user.id)})

    # 2. Test Unauthenticated Access
    print("1. Testing Unauthenticated Access...")
    st, data = await dispatch_json("POST", "/api/v1/donors/bulk-actions", {"donor_ids": [1], "action": "activate"})
    assert st == 401, f"Expected 401, got {st}"
    print("   -> PASSED: Unauthenticated request rejected (401).")

    # 3. Test Unauthorized Role Access (Donor role cannot perform bulk actions)
    print("2. Testing Role-Based Access Control (Donor Role Rejected)...")
    st, data = await dispatch_json(
        "POST",
        "/api/v1/donors/bulk-actions",
        {"donor_ids": [1], "action": "activate"},
        token=donor_token,
    )
    assert st == 403, f"Expected 403, got {st}"
    print("   -> PASSED: Donor role rejected from bulk actions (403).")

    # 4. Test Validation: Empty Donor IDs List
    print("3. Testing Validation: Empty Donor IDs List...")
    st, data = await dispatch_json(
        "POST",
        "/api/v1/donors/bulk-actions",
        {"donor_ids": [], "action": "activate"},
        token=staff_token,
    )
    assert st in (400, 422), f"Expected 400 or 422, got {st}"
    print("   -> PASSED: Empty donor list rejected.")

    # 5. Test Validation: Invalid Action
    print("4. Testing Validation: Invalid Action...")
    st, data = await dispatch_json(
        "POST",
        "/api/v1/donors/bulk-actions",
        {"donor_ids": [1], "action": "invalid_action"},
        token=staff_token,
    )
    assert st == 422, f"Expected 422 for invalid action literal, got {st}"
    print("   -> PASSED: Invalid action rejected.")

    # 6. Test Validation: Max Batch Size (> 100)
    print("5. Testing Validation: Batch Size Limit (> 100)...")
    st, data = await dispatch_json(
        "POST",
        "/api/v1/donors/bulk-actions",
        {"donor_ids": list(range(1, 102)), "action": "activate"},
        token=staff_token,
    )
    assert st == 422, f"Expected 422 for batch size > 100, got {st}"
    print("   -> PASSED: Oversized batch rejected.")

    # 7. Create Test Donors in a Clean Session
    print("6. Creating temporary test donors for batch operations...")
    async with AsyncSessionLocal() as session:
        # Create 3 users and 3 donors
        u1 = User(
            email=f"test_bulk_1_{int(asyncio.get_event_loop().time()*1000)}@example.com",
            hashed_password="fakehashedpassword",
            full_name="Bulk Donor One",
            role="donor",
            is_active=True,
        )
        u2 = User(
            email=f"test_bulk_2_{int(asyncio.get_event_loop().time()*1000)}@example.com",
            hashed_password="fakehashedpassword",
            full_name="Bulk Donor Two",
            role="donor",
            is_active=True,
        )
        u3 = User(
            email=f"test_bulk_3_{int(asyncio.get_event_loop().time()*1000)}@example.com",
            hashed_password="fakehashedpassword",
            full_name="Bulk Donor Three",
            role="donor",
            is_active=True,
        )
        session.add_all([u1, u2, u3])
        await session.commit()
        await session.refresh(u1)
        await session.refresh(u2)
        await session.refresh(u3)

        d1 = Donor(
            user_id=u1.id,
            phone=f"+1-555-{u1.id:04d}",
            date_of_birth=date(1995, 1, 1),
            gender="male",
            blood_group="O+",
            address="Bulk Test Address 1",
        )
        d2 = Donor(
            user_id=u2.id,
            phone=f"+1-555-{u2.id:04d}",
            date_of_birth=date(1996, 2, 2),
            gender="female",
            blood_group="A+",
            address="Bulk Test Address 2",
        )
        d3 = Donor(
            user_id=u3.id,
            phone=f"+1-555-{u3.id:04d}",
            date_of_birth=date(1997, 3, 3),
            gender="other",
            blood_group="B+",
            address="Bulk Test Address 3",
        )
        session.add_all([d1, d2, d3])
        await session.commit()
        await session.refresh(d1)
        await session.refresh(d2)
        await session.refresh(d3)

        d1_id, d2_id, d3_id = d1.id, d2.id, d3.id
        u1_id, u2_id, u3_id = u1.id, u2.id, u3.id

    print(f"   -> Created test donors: IDs [{d1_id}, {d2_id}, {d3_id}]")

    # 8. Test Non-existent Donor ID (404)
    print("7. Testing Non-existent Donor ID...")
    st, data = await dispatch_json(
        "POST",
        "/api/v1/donors/bulk-actions",
        {"donor_ids": [d1_id, 999999], "action": "deactivate"},
        token=staff_token,
    )
    assert st == 404, f"Expected 404 for missing donor, got {st}"
    print("   -> PASSED: Missing donor IDs cleanly rejected (404).")

    # 9. Test Bulk Deactivate by Staff
    print("8. Testing Bulk Deactivate by Staff...")
    st, data = await dispatch_json(
        "POST",
        "/api/v1/donors/bulk-actions",
        {"donor_ids": [d1_id, d2_id], "action": "deactivate"},
        token=staff_token,
    )
    assert st == 200, f"Expected 200, got {st}: {data}"
    assert data["successful_count"] == 2
    assert data["action"] == "deactivate"

    # Verify database state
    async with AsyncSessionLocal() as session:
        u_check = (await session.execute(select(User).where(User.id.in_([u1_id, u2_id])))).scalars().all()
        assert all(not u.is_active for u in u_check), "All target users must be deactivated"
    print("   -> PASSED: Bulk deactivate by Staff succeeded and users deactivated.")

    # 10. Test Bulk Activate by Admin
    print("9. Testing Bulk Activate by Admin...")
    st, data = await dispatch_json(
        "POST",
        "/api/v1/donors/bulk-actions",
        {"donor_ids": [d1_id, d2_id], "action": "activate"},
        token=admin_token,
    )
    assert st == 200, f"Expected 200, got {st}: {data}"
    assert data["successful_count"] == 2
    assert data["action"] == "activate"

    async with AsyncSessionLocal() as session:
        u_check = (await session.execute(select(User).where(User.id.in_([u1_id, u2_id])))).scalars().all()
        assert all(u.is_active for u in u_check), "All target users must be re-activated"
    print("   -> PASSED: Bulk activate by Admin succeeded and users re-activated.")

    # 11. Test Bulk Delete Unauthorized for Staff (403)
    print("10. Testing Bulk Delete Role Restriction (Staff Forbidden)...")
    st, data = await dispatch_json(
        "POST",
        "/api/v1/donors/bulk-actions",
        {"donor_ids": [d1_id, d2_id], "action": "delete"},
        token=staff_token,
    )
    assert st == 403, f"Expected 403 for staff deleting donors, got {st}"
    print("   -> PASSED: Staff forbidden from bulk donor deletion (403).")

    # 12. Test Bulk Delete with FK Restriction (Donations exist)
    print("11. Testing Bulk Delete Foreign Key Safety Check...")
    async with AsyncSessionLocal() as session:
        donation = Donation(
            donor_id=d3_id,
            donation_date=date.today(),
            blood_group="B+",
            quantity_ml=450,
            status="completed",
        )
        session.add(donation)
        await session.commit()

    st, data = await dispatch_json(
        "POST",
        "/api/v1/donors/bulk-actions",
        {"donor_ids": [d1_id, d3_id], "action": "delete"},
        token=admin_token,
    )
    assert st == 400, f"Expected 400 for deleting donor with donations, got {st}: {data}"
    assert "Cannot delete donors with active donation history" in data["detail"]
    print("   -> PASSED: Bulk deletion prevented when donations exist (400).")

    # Cleanup donation record for test isolation
    async with AsyncSessionLocal() as session:
        don_rec = (await session.execute(select(Donation).where(Donation.donor_id == d3_id))).scalars().first()
        if don_rec:
            await session.delete(don_rec)
            await session.commit()

    # 13. Test Bulk Delete by Admin Success
    print("12. Testing Bulk Delete by Admin Success...")
    st, data = await dispatch_json(
        "POST",
        "/api/v1/donors/bulk-actions",
        {"donor_ids": [d1_id, d2_id, d3_id], "action": "delete"},
        token=admin_token,
    )
    assert st == 200, f"Expected 200, got {st}: {data}"
    assert data["successful_count"] == 3
    assert data["action"] == "delete"

    async with AsyncSessionLocal() as session:
        remaining = (await session.execute(select(Donor).where(Donor.id.in_([d1_id, d2_id, d3_id])))).scalars().all()
        assert len(remaining) == 0, "Donors must be deleted"

        # Check Audit Log was recorded
        audit = (
            await session.execute(
                select(AuditLog)
                .where(AuditLog.action == "bulk_donor_delete")
                .order_by(AuditLog.id.desc())
            )
        ).scalars().first()
        assert audit is not None
        assert "Bulk deletion executed" in audit.description
    print("   -> PASSED: Admin bulk delete executed, database updated, and audit log verified.")

    print("\n=== ALL 12 BULK DONOR TESTS PASSED SUCCESSFULLY! ===")


if __name__ == "__main__":
    asyncio.run(run_bulk_donor_tests())
