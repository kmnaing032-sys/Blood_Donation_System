import asyncio
import json
from typing import Any, Tuple
from datetime import datetime, date, timedelta

from app.main import app
from app.core.token import create_access_token
from app.core.security import hash_password
from app.database.database import AsyncSessionLocal
from app.models.user import User
from app.models.donor import Donor
from app.models.donation import Donation
from app.models.blood_stock import BloodStock
from app.models.blood_request import BloodRequest
from app.crud.blood_stock import ensure_all_blood_stocks_initialized
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
    raw_path_str = path
    if "?" in path:
        path_part, qs_part = path.split("?", 1)
        raw_path_str = path_part
        query_string = qs_part.encode("utf-8")
    else:
        path_part = path

    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": method,
        "path": path_part,
        "raw_path": raw_path_str.encode("utf-8"),
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

    resp_body = b"".join(res_chunks).decode("utf-8")
    try:
        data = json.loads(resp_body) if resp_body else None
    except json.JSONDecodeError:
        data = resp_body

    return status_code, data


test_results = {}


def record_result(name: str, passed: bool, notes: str = ""):
    test_results[name] = {"passed": passed, "notes": notes}
    icon = "[PASS]" if passed else "[FAIL]"
    print(f"{icon} {name} {notes}")


async def setup_test_environment():
    """Seed test users, donors, donations, stock, and requests."""
    print("\n--- Setting up Test Data for Search, Filter & Pagination ---")
    async with AsyncSessionLocal() as session:
        # Clean previous test records
        await session.execute(delete(Donation).where(Donation.notes.like("%_sfp_test%")))
        await session.execute(delete(BloodRequest).where(BloodRequest.hospital_name.like("%_sfp_test%")))
        
        # Ensure stocks initialized
        await ensure_all_blood_stocks_initialized(session)

        # Users
        admin_user = (await session.execute(select(User).where(User.email == "sfp_admin@example.com"))).scalar_one_or_none()
        if not admin_user:
            admin_user = User(
                email="sfp_admin@example.com",
                hashed_password=hash_password("AdminPass123!"),
                full_name="SFP Admin Officer",
                role="admin",
                is_active=True,
            )
            session.add(admin_user)

        user1 = (await session.execute(select(User).where(User.email == "sfp_user1@example.com"))).scalar_one_or_none()
        if not user1:
            user1 = User(
                email="sfp_user1@example.com",
                hashed_password=hash_password("UserPass123!"),
                full_name="Alice Alpha Donor",
                role="user",
                is_active=True,
            )
            session.add(user1)

        user2 = (await session.execute(select(User).where(User.email == "sfp_user2@example.com"))).scalar_one_or_none()
        if not user2:
            user2 = User(
                email="sfp_user2@example.com",
                hashed_password=hash_password("UserPass123!"),
                full_name="Bob Beta Donor",
                role="user",
                is_active=True,
            )
            session.add(user2)

        user3 = (await session.execute(select(User).where(User.email == "sfp_user3@example.com"))).scalar_one_or_none()
        if not user3:
            user3 = User(
                email="sfp_user3@example.com",
                hashed_password=hash_password("UserPass123!"),
                full_name="Charlie Gamma Donor",
                role="user",
                is_active=True,
            )
            session.add(user3)

        await session.commit()
        await session.refresh(admin_user)
        await session.refresh(user1)
        await session.refresh(user2)
        await session.refresh(user3)

        # Donors: Alice (A+, age 24), Bob (O+, age 34), Charlie (B-, age 50)
        today = date.today()
        # Alice
        donor1 = (await session.execute(select(Donor).where(Donor.user_id == user1.id))).scalar_one_or_none()
        if not donor1:
            donor1 = Donor(
                user_id=user1.id,
                phone="0911111111",
                blood_group="A+",
                gender="female",
                date_of_birth=date(today.year - 24, today.month, today.day),
                address="Downtown Alpha Ave",
            )
            session.add(donor1)

        # Bob
        donor2 = (await session.execute(select(Donor).where(Donor.user_id == user2.id))).scalar_one_or_none()
        if not donor2:
            donor2 = Donor(
                user_id=user2.id,
                phone="0922222222",
                blood_group="O+",
                gender="male",
                date_of_birth=date(today.year - 34, today.month, today.day),
                address="Uptown Beta Blvd",
            )
            session.add(donor2)

        # Charlie
        donor3 = (await session.execute(select(Donor).where(Donor.user_id == user3.id))).scalar_one_or_none()
        if not donor3:
            donor3 = Donor(
                user_id=user3.id,
                phone="0933333333",
                blood_group="B-",
                gender="male",
                date_of_birth=date(today.year - 50, today.month, today.day),
                address="Riverside Charlie Court",
            )
            session.add(donor3)

        await session.commit()
        await session.refresh(donor1)
        await session.refresh(donor2)
        await session.refresh(donor3)

        # Reset blood stock quantities for test isolation
        stocks = (await session.execute(select(BloodStock))).scalars().all()
        for s in stocks:
            if s.blood_group == "A+":
                s.available_quantity_ml = 1500
            elif s.blood_group == "O+":
                s.available_quantity_ml = 3200
            elif s.blood_group == "B-":
                s.available_quantity_ml = 450
            else:
                s.available_quantity_ml = 0
            s.reserved_quantity_ml = 0
        await session.commit()

        # Seed Donations
        d1 = Donation(
            donor_id=donor1.id,
            donation_date=today - timedelta(days=60),
            quantity_ml=450,
            blood_group="A+",
            status="completed",
            notes="Regular donation _sfp_test",
        )
        d2 = Donation(
            donor_id=donor2.id,
            donation_date=today - timedelta(days=20),
            quantity_ml=500,
            blood_group="O+",
            status="completed",
            notes="Second donor donation _sfp_test",
        )
        d3 = Donation(
            donor_id=donor3.id,
            donation_date=today - timedelta(days=5),
            quantity_ml=350,
            blood_group="B-",
            status="pending",
            notes="Third pending donation _sfp_test",
        )
        session.add_all([d1, d2, d3])

        # Seed Blood Requests
        req1 = BloodRequest(
            user_id=user1.id,
            patient_name="John Doe Patient",
            hospital_name="City General Hospital _sfp_test",
            hospital_address="123 Hospital Road",
            blood_group="A+",
            quantity_ml=450,
            urgency="normal",
            contact_phone="0999900001",
            required_by=today + timedelta(days=2),
            status="pending",
        )
        req2 = BloodRequest(
            user_id=user2.id,
            patient_name="Mary Jane Patient",
            hospital_name="Memorial Clinic _sfp_test",
            hospital_address="456 Health St",
            blood_group="O+",
            quantity_ml=900,
            urgency="emergency",
            contact_phone="0999900002",
            required_by=today + timedelta(days=1),
            status="approved",
        )
        session.add_all([req1, req2])
        await session.commit()

    admin_token = create_access_token({"sub": str(admin_user.id), "email": admin_user.email, "role": "admin"})
    user1_token = create_access_token({"sub": str(user1.id), "email": user1.email, "role": "user"})
    user2_token = create_access_token({"sub": str(user2.id), "email": user2.email, "role": "user"})

    return {
        "admin_token": admin_token,
        "user1_token": user1_token,
        "user2_token": user2_token,
        "donor1_id": donor1.id,
        "donor2_id": donor2.id,
        "donor3_id": donor3.id,
    }


async def run_tests():
    data = await setup_test_environment()
    admin_token = data["admin_token"]
    user1_token = data["user1_token"]

    print("\n--- Test Suite 1: Pagination Bounds, Defaults & Invalid Inputs ---")

    # 1.1 Default pagination parameters (page=1, page_size=10)
    status_code, body = await dispatch_request("GET", "/api/v1/donors/", token=admin_token)
    p1 = (
        status_code == 200
        and body["page"] == 1
        and body["page_size"] == 10
        and "total" in body
        and "total_pages" in body
        and isinstance(body["items"], list)
    )
    record_result("Default Pagination Format (page=1, page_size=10, total, total_pages)", p1, f"Status: {status_code}")

    # 1.2 Custom page & page size
    status_code, body = await dispatch_request("GET", "/api/v1/donors/?page=1&page_size=2", token=admin_token)
    p2 = status_code == 200 and body["page"] == 1 and body["page_size"] == 2 and len(body["items"]) <= 2
    record_result("Custom Page Size (page_size=2)", p2, f"Items count: {len(body.get('items', [])) if p2 else None}")

    # 1.3 Page 2 pagination navigation
    status_code, body = await dispatch_request("GET", "/api/v1/donors/?page=2&page_size=2", token=admin_token)
    p3 = status_code == 200 and body["page"] == 2 and body["page_size"] == 2
    record_result("Pagination Offset/Navigation (page=2)", p3, f"Status: {status_code}")

    # 1.4 Max page size limit (le=100)
    status_code, body = await dispatch_request("GET", "/api/v1/donors/?page=1&page_size=101", token=admin_token)
    p4 = status_code == 422
    record_result("Maximum Page Size Enforcement (>100 returns 422 Unprocessable)", p4, f"Status: {status_code}")

    # 1.5 Invalid page number (page=0 returns 422)
    status_code, body = await dispatch_request("GET", "/api/v1/donors/?page=0&page_size=10", token=admin_token)
    p5 = status_code == 422
    record_result("Invalid Page Number (page=0 returns 422)", p5, f"Status: {status_code}")

    # 1.6 Negative page number
    status_code, body = await dispatch_request("GET", "/api/v1/donors/?page=-1&page_size=10", token=admin_token)
    p6 = status_code == 422
    record_result("Negative Page Number (page=-1 returns 422)", p6, f"Status: {status_code}")


    print("\n--- Test Suite 2: Donor Search, Filter, Age Range & Sorting ---")

    # 2.1 Search by donor name
    status_code, body = await dispatch_request("GET", "/api/v1/donors/?search=Alice", token=admin_token)
    p7 = status_code == 200 and body["total"] >= 1 and any("Alice" in (item.get("full_name") or "") for item in body["items"])
    record_result("Donor Search by Name (search=Alice)", p7, f"Total matched: {body.get('total')}")

    # 2.2 Search by phone
    status_code, body = await dispatch_request("GET", "/api/v1/donors/?search=0922222222", token=admin_token)
    p8 = status_code == 200 and body["total"] >= 1 and any(item.get("phone") == "0922222222" for item in body["items"])
    record_result("Donor Search by Phone (search=0922222222)", p8, f"Total matched: {body.get('total')}")

    # 2.3 Filter by blood group (URL-encoded O%2B)
    status_code, body = await dispatch_request("GET", "/api/v1/donors/?blood_group=O%2B", token=admin_token)
    p9 = status_code == 200 and body["total"] >= 1 and all(item["blood_group"] == "O+" for item in body["items"])
    record_result("Donor Filter by Blood Group (blood_group=O+)", p9, f"Total: {body.get('total')}")

    # 2.4 Filter by gender
    status_code, body = await dispatch_request("GET", "/api/v1/donors/?gender=female", token=admin_token)
    p10 = status_code == 200 and body["total"] >= 1 and all(item["gender"] == "female" for item in body["items"])
    record_result("Donor Filter by Gender (gender=female)", p10, f"Total: {body.get('total')}")

    # 2.5 Filter by Age Range: min_age=30, max_age=40 (Should match Bob who is 34, but not Alice 24 or Charlie 50)
    status_code, body = await dispatch_request("GET", "/api/v1/donors/?min_age=30&max_age=40", token=admin_token)
    p11 = status_code == 200 and body["total"] >= 1 and all(30 <= item["age"] <= 40 for item in body["items"])
    record_result("Donor Filter by Age Range (min_age=30, max_age=40)", p11, f"Total matched: {body.get('total')}")

    # 2.6 Donor Sorting by name ASC
    status_code, body = await dispatch_request("GET", "/api/v1/donors/?sort_by=name&sort_order=asc", token=admin_token)
    names = [item.get("full_name") or "" for item in body.get("items", []) if item.get("full_name")]
    p12 = status_code == 200 and len(names) >= 2 and names == sorted(names)
    record_result("Donor Sorting (sort_by=name, sort_order=asc)", p12, f"Names sample: {names[:3]}")

    # 2.7 Donor Sorting by date_of_birth DESC
    status_code, body = await dispatch_request("GET", "/api/v1/donors/?sort_by=date_of_birth&sort_order=desc", token=admin_token)
    dobs = [item.get("date_of_birth") for item in body.get("items", []) if item.get("date_of_birth")]
    p13 = status_code == 200 and len(dobs) >= 2 and dobs == sorted(dobs, reverse=True)
    record_result("Donor Sorting by Date of Birth (youngest first, sort_order=desc)", p13, f"DOBs: {dobs[:3]}")


    print("\n--- Test Suite 3: Blood Stock Filters & Available Quantity Sorting ---")

    # 3.1 Blood Stock filter by blood group
    status_code, body = await dispatch_request("GET", "/api/v1/blood-stock/?blood_group=A%2B", token=admin_token)
    p14 = status_code == 200 and body["total"] == 1 and body["items"][0]["blood_group"] == "A+"
    record_result("Blood Stock Filter by Blood Group (blood_group=A+)", p14, f"Available: {body.get('items', [{}])[0].get('available_quantity_ml')}")

    # 3.2 Blood Stock min_quantity filter (min_quantity=1000 ml)
    status_code, body = await dispatch_request("GET", "/api/v1/blood-stock/?min_quantity=1000", token=admin_token)
    p15 = status_code == 200 and all(item["available_quantity_ml"] >= 1000 for item in body["items"])
    record_result("Blood Stock Filter by min_quantity (>= 1000ml)", p15, f"Matched: {len(body.get('items', []))}")

    # 3.3 Blood Stock max_quantity filter (max_quantity=500 ml)
    status_code, body = await dispatch_request("GET", "/api/v1/blood-stock/?max_quantity=500", token=admin_token)
    p16 = status_code == 200 and all(item["available_quantity_ml"] <= 500 for item in body["items"])
    record_result("Blood Stock Filter by max_quantity (<= 500ml)", p16, f"Matched: {len(body.get('items', []))}")

    # 3.4 Blood Stock Sort by available_quantity_ml DESC
    status_code, body = await dispatch_request("GET", "/api/v1/blood-stock/?sort_by=available_quantity_ml&sort_order=desc", token=admin_token)
    quantities = [item["available_quantity_ml"] for item in body.get("items", [])]
    p17 = status_code == 200 and len(quantities) >= 3 and quantities == sorted(quantities, reverse=True)
    record_result("Blood Stock Sort by Available Quantity DESC", p17, f"Quantities: {quantities[:4]}")


    print("\n--- Test Suite 4: Donation Search, Filter & Sorting ---")

    # 4.1 Filter donation by blood group
    status_code, body = await dispatch_request("GET", "/api/v1/donations/?blood_group=A%2B", token=admin_token)
    p18 = status_code == 200 and body["total"] >= 1 and all(item["blood_group"] == "A+" for item in body["items"])
    record_result("Donations Filter by Blood Group (blood_group=A+)", p18, f"Total: {body.get('total')}")

    # 4.2 Filter donation by status
    status_code, body = await dispatch_request("GET", "/api/v1/donations/?status=completed", token=admin_token)
    p19 = status_code == 200 and body["total"] >= 1 and all(item["status"] == "completed" for item in body["items"])
    record_result("Donations Filter by Status (status=completed)", p19, f"Total: {body.get('total')}")

    # 4.3 Search donation by donor name (via User join)
    status_code, body = await dispatch_request("GET", "/api/v1/donations/?search=Alice", token=admin_token)
    p20 = status_code == 200 and body["total"] >= 1 and any("Alice" in (item.get("donor_name") or "") for item in body["items"])
    record_result("Donations Search by Donor Name (search=Alice)", p20, f"Total: {body.get('total')}")

    # 4.4 Sort donation by quantity_ml DESC
    status_code, body = await dispatch_request("GET", "/api/v1/donations/?sort_by=quantity_ml&sort_order=desc", token=admin_token)
    d_quantities = [item["quantity_ml"] for item in body.get("items", [])]
    p21 = status_code == 200 and len(d_quantities) >= 2 and d_quantities == sorted(d_quantities, reverse=True)
    record_result("Donations Sort by Quantity DESC", p21, f"Quantities: {d_quantities[:3]}")


    print("\n--- Test Suite 5: Blood Request Search, Filter, Date Range & Sorting ---")

    # 5.1 Search by patient name
    status_code, body = await dispatch_request("GET", "/api/v1/blood-requests/?search=John", token=admin_token)
    p22 = status_code == 200 and body["total"] >= 1 and any("John" in item["patient_name"] for item in body["items"])
    record_result("Blood Requests Search by Patient Name (search=John)", p22, f"Total: {body.get('total')}")

    # 5.2 Filter by hospital name
    status_code, body = await dispatch_request("GET", "/api/v1/blood-requests/?hospital_name=Memorial", token=admin_token)
    p23 = status_code == 200 and body["total"] >= 1 and all("Memorial" in item["hospital_name"] for item in body["items"])
    record_result("Blood Requests Filter by Hospital Name", p23, f"Total: {body.get('total')}")

    # 5.3 Filter by date range (start_date, end_date)
    today_str = date.today().isoformat()
    status_code, body = await dispatch_request(f"GET", f"/api/v1/blood-requests/?start_date={today_str}&end_date={today_str}", token=admin_token)
    p24 = status_code == 200 and body["total"] >= 1
    record_result("Blood Requests Filter by Date Range (start_date to end_date)", p24, f"Total today: {body.get('total')}")

    # 5.4 Sort blood requests by patient_name ASC
    status_code, body = await dispatch_request("GET", "/api/v1/blood-requests/?sort_by=patient_name&sort_order=asc", token=admin_token)
    p_names = [item["patient_name"] for item in body.get("items", [])]
    p25 = status_code == 200 and len(p_names) >= 2 and p_names == sorted(p_names)
    record_result("Blood Requests Sort by Patient Name ASC", p25, f"Names: {p_names[:2]}")


    print("\n--- Test Suite 6: Security, RBAC & Privacy Masking ---")

    # 6.1 Regular user listing donors gets masked public response
    status_code, body = await dispatch_request("GET", "/api/v1/donors/?blood_group=A%2B", token=user1_token)
    first_item = body.get("items", [{}])[0] if body.get("items") else {}
    p26 = (
        status_code == 200
        and "phone" not in first_item
        and "full_name" not in first_item
        and "address" not in first_item
        and "blood_group" in first_item
    )
    record_result("Privacy Masking for Normal Users (phone & address omitted)", p26, f"Keys: {list(first_item.keys())}")

    # 6.2 Regular user listing donations sees only their own
    status_code, body = await dispatch_request("GET", "/api/v1/donations/", token=user1_token)
    p27 = status_code == 200 and all(item["donor_id"] == data["donor1_id"] for item in body["items"])
    record_result("RBAC Donation Isolation (Normal user only sees own donations)", p27, f"Items count: {body.get('total')}")

    # 6.3 Empty results handling
    status_code, body = await dispatch_request("GET", "/api/v1/donors/?search=NonExistentDonorXYZ", token=admin_token)
    p28 = status_code == 200 and body["total"] == 0 and body["total_pages"] == 0 and body["items"] == []
    record_result("Empty Results Standard Response (total=0, total_pages=0, items=[])", p28, f"Body: {body}")

    print("\n================ TEST SUMMARY ================")
    all_passed = all(res["passed"] for res in test_results.values())
    passed_count = sum(1 for res in test_results.values() if res["passed"])
    total_count = len(test_results)
    print(f"Results: {passed_count}/{total_count} passed.")
    if all_passed:
        print("ALL TESTS PASSED SUCCESSFULLY!")
    else:
        print("SOME TESTS FAILED.")
        for name, res in test_results.items():
            if not res["passed"]:
                print(f"FAILED: {name} - {res['notes']}")


if __name__ == "__main__":
    asyncio.run(run_tests())

