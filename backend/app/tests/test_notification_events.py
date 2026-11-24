import asyncio
import json
from typing import Any, Tuple

from app.main import app
from app.core.token import create_access_token
from app.core.security import hash_password
from app.database.database import AsyncSessionLocal
from app.models.user import User
from app.models.donor import Donor
from app.models.blood_stock import BloodStock
from app.models.notification import Notification
from sqlalchemy import select, delete


async def dispatch_request(
    method: str,
    path: str,
    body: dict | None = None,
    token: str | None = None,
) -> Tuple[int, Any]:
    """Execute an ASGI request directly against FastAPI app."""
    headers = []
    if token:
        headers.append((b"authorization", f"Bearer {token}".encode("utf-8")))

    if body is not None:
        body_bytes = json.dumps(body).encode("utf-8")
        headers.append((b"content-type", b"application/json"))
        headers.append((b"content-length", str(len(body_bytes)).encode("utf-8")))
    else:
        body_bytes = b""

    query_string = b""
    if "?" in path:
        path, qs = path.split("?", 1)
        query_string = qs.encode("utf-8")

    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": method,
        "path": path,
        "raw_path": path.encode("utf-8"),
        "query_string": query_string,
        "headers": headers,
        "client": ("127.0.0.1", 12345),
        "server": ("127.0.0.1", 80),
        "scheme": "http",
        "app": app,
    }

    status_code: int = 500
    res_chunks: list[bytes] = []

    async def receive():
        return {"type": "http.request", "body": body_bytes, "more_body": False}

    async def send(message):
        nonlocal status_code
        if message["type"] == "http.response.start":
            status_code = message["status"]
        elif message["type"] == "http.response.body":
            res_chunks.append(message.get("body", b""))

    await app(scope, receive, send)
    raw_res = b"".join(res_chunks).decode("utf-8", errors="replace")
    try:
        parsed_res = json.loads(raw_res)
    except Exception:
        parsed_res = raw_res
    return status_code, parsed_res


async def run_event_tests():
    print("=" * 60)
    print("STARTING TEST SUITE: Step 1.18 – Notification Generation & Events")
    print("=" * 60)

    staff_id = None
    donor_user_id = None
    created_donor_id = None
    created_request_id = None

    async with AsyncSessionLocal() as session:
        # Create Staff
        staff = User(
            full_name="Event Staff User",
            email="event.staff@example.com",
            hashed_password=hash_password("PassStaff123!"),
            role="staff",
            is_active=True,
        )
        # Create Regular Donor User
        donor_user = User(
            full_name="Event Regular Donor",
            email="event.donor@example.com",
            hashed_password=hash_password("PassDonor123!"),
            role="donor",
            is_active=True,
        )
        session.add(staff)
        session.add(donor_user)
        await session.commit()
        await session.refresh(staff)
        await session.refresh(donor_user)
        staff_id = staff.id
        donor_user_id = donor_user.id

    staff_token = create_access_token({"sub": str(staff_id)})
    donor_token = create_access_token({"sub": str(donor_user_id)})

    test_results = {}

    try:
        # 1. DONOR REGISTRATION EVENT
        donor_payload = {
            "phone": "+959111222333",
            "date_of_birth": "1995-05-15",
            "gender": "male",
            "blood_group": "B+",
            "address": "123 Event Road, Yangon",
        }
        status, data = await dispatch_request(
            "POST", "/api/v1/donors/", body=donor_payload, token=donor_token
        )
        test_results["1_donor_created"] = status == 201
        created_donor_id = data.get("id")

        # Verify staff received a notification about new donor
        async with AsyncSessionLocal() as session:
            notifs = await session.execute(
                select(Notification).where(
                    Notification.user_id == staff_id,
                    Notification.category == "donor",
                )
            )
            staff_donor_notifs = notifs.scalars().all()
            test_results["2_staff_received_donor_notif"] = (
                len(staff_donor_notifs) >= 1
                and "New Donor Registered" in staff_donor_notifs[0].title
            )

        # 2. DONATION RECORD EVENT
        donation_payload = {
            "donor_id": created_donor_id,
            "donation_date": "2026-11-19",
            "quantity_ml": 450,
            "blood_group": "B+",
            "status": "completed",
        }
        status, _ = await dispatch_request(
            "POST", "/api/v1/donations/", body=donation_payload, token=staff_token
        )
        test_results["3_donation_created"] = status == 201

        # Verify donor user received donation notification
        async with AsyncSessionLocal() as session:
            notifs = await session.execute(
                select(Notification).where(
                    Notification.user_id == donor_user_id,
                    Notification.category == "donation",
                )
            )
            donor_donation_notifs = notifs.scalars().all()
            test_results["4_donor_received_donation_notif"] = (
                len(donor_donation_notifs) >= 1
                and "Blood Donation Recorded" in donor_donation_notifs[0].title
            )

        # 3. BLOOD STOCK CALIBRATION EVENT
        # Find B+ stock
        async with AsyncSessionLocal() as session:
            stk_res = await session.execute(
                select(BloodStock).where(BloodStock.blood_group == "B+")
            )
            b_stock = stk_res.scalar_one_or_none()
            b_stock_id = b_stock.id if b_stock else 1

        stock_patch = {
            "available_quantity_ml": 5000,
            "reserved_quantity_ml": 500,
        }
        status, _ = await dispatch_request(
            "PATCH", f"/api/v1/blood-stock/{b_stock_id}", body=stock_patch, token=staff_token
        )
        test_results["5_stock_updated"] = status == 200

        # Verify staff notification for stock change
        async with AsyncSessionLocal() as session:
            notifs = await session.execute(
                select(Notification).where(
                    Notification.user_id == staff_id,
                    Notification.category == "stock",
                )
            )
            staff_stock_notifs = notifs.scalars().all()
            test_results["6_staff_received_stock_notif"] = len(staff_stock_notifs) >= 1

        # 4. BLOOD REQUEST SUBMISSION EVENT
        request_payload = {
            "patient_name": "Event Patient",
            "hospital_name": "General Hospital",
            "hospital_address": "City Center",
            "contact_phone": "+959444555666",
            "blood_group": "B+",
            "quantity_ml": 450,
            "urgency": "high",
        }
        status, req_data = await dispatch_request(
            "POST", "/api/v1/blood-requests/", body=request_payload, token=donor_token
        )
        test_results["7_request_submitted"] = status == 201
        created_request_id = req_data.get("id")

        # Verify staff received request notification
        async with AsyncSessionLocal() as session:
            notifs = await session.execute(
                select(Notification).where(
                    Notification.user_id == staff_id,
                    Notification.category == "request",
                )
            )
            staff_req_notifs = notifs.scalars().all()
            test_results["8_staff_received_new_request_notif"] = (
                len(staff_req_notifs) >= 1
                and any("New Request" in n.title for n in staff_req_notifs)
            )

        # 5. BLOOD REQUEST APPROVAL STATUS EVENT
        status, app_res = await dispatch_request(
            "POST", f"/api/v1/blood-requests/{created_request_id}/approve", token=staff_token
        )
        print(f"[DEBUG] approve status: {status}, response: {app_res}")
        test_results["9_request_approved"] = status == 200

        # Verify donor user received approved status notification
        async with AsyncSessionLocal() as session:
            notifs = await session.execute(
                select(Notification).where(
                    Notification.user_id == donor_user_id,
                    Notification.category == "request",
                )
            )
            donor_req_notifs = notifs.scalars().all()
            print(f"[DEBUG] donor request notifications: {donor_req_notifs}")
            test_results["10_donor_received_approved_notif"] = (
                len(donor_req_notifs) >= 1
                and any("Approved" in n.title for n in donor_req_notifs)
            )

        # 6. IDEMPOTENT / DUPLICATE NOTIFICATION SUPPRESSION
        # Dispatching exact same notification to donor should be suppressed if unread
        from app.services.notification_service import dispatch_notification
        async with AsyncSessionLocal() as session:
            title_to_suppress = donor_req_notifs[0].title if donor_req_notifs else "Test Title"
            msg_to_suppress = donor_req_notifs[0].message if donor_req_notifs else "Test Message"
            duplicate = await dispatch_notification(
                session,
                donor_user_id,
                title_to_suppress,
                msg_to_suppress,
                category="request",
            )
            test_results["11_duplicate_suppression"] = duplicate is None

    finally:
        # Cleanup
        async with AsyncSessionLocal() as session:
            # Delete notifications for both
            await session.execute(
                delete(Notification).where(
                    Notification.user_id.in_([staff_id, donor_user_id])
                )
            )
            # Delete donations for donor
            if created_donor_id:
                from app.models.donation import Donation
                await session.execute(
                    delete(Donation).where(Donation.donor_id == created_donor_id)
                )
            # Delete requests
            if created_request_id:
                from app.models.blood_request import BloodRequest
                await session.execute(
                    delete(BloodRequest).where(BloodRequest.id == created_request_id)
                )
            # Delete donor
            if created_donor_id:
                await session.execute(
                    delete(Donor).where(Donor.id == created_donor_id)
                )
            # Delete users
            res = await session.execute(
                select(User).where(User.id.in_([staff_id, donor_user_id]))
            )
            for u in res.scalars().all():
                await session.delete(u)
            await session.commit()
            print("[CLEANUP] Deleted temporary test entities.")

    print("\n" + "=" * 60)
    print("EVENT NOTIFICATION TEST SUITE RESULTS:")
    print("=" * 60)
    all_passed = True
    for test_name, passed in test_results.items():
        status_str = "PASS" if passed else "FAIL"
        if not passed:
            all_passed = False
        print(f"[{status_str}] - {test_name}")

    print("=" * 60)
    if all_passed:
        print("ALL EVENT NOTIFICATION TESTS PASSED SUCCESSFULLY!")
    else:
        print("SOME TESTS FAILED!")
        exit(1)


if __name__ == "__main__":
    asyncio.run(run_event_tests())
