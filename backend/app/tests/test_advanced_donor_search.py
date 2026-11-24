import asyncio
import json
import urllib.parse
from datetime import date, timedelta
from typing import Any, Tuple
from sqlalchemy import select

from app.main import app
from app.database.database import AsyncSessionLocal
from app.models.user import User
from app.models.donor import Donor
from app.core.token import create_access_token


async def dispatch_request(
    method: str,
    path: str,
    query_params: dict | None = None,
    token: str | None = None,
) -> Tuple[int, Any, dict]:
    """Execute request directly against ASGI app with query params support."""
    query_string = b""
    if query_params:
        query_string = urllib.parse.urlencode(query_params).encode("utf-8")

    headers = []
    if token:
        headers.append((b"authorization", f"Bearer {token}".encode("utf-8")))

    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": method,
        "path": path,
        "raw_path": path.encode("utf-8"),
        "query_string": query_string,
        "headers": headers,
        "client": ("127.0.0.1", 12345),
    }

    response_status = 500
    response_body = bytearray()
    response_headers = {}
    sent_request = False

    async def receive():
        nonlocal sent_request
        if not sent_request:
            sent_request = True
            return {"type": "http.request", "body": b"", "more_body": False}
        return {"type": "http.disconnect"}

    async def send(message):
        nonlocal response_status, response_body, response_headers
        if message["type"] == "http.response.start":
            response_status = message["status"]
            for k, v in message.get("headers", []):
                response_headers[k.decode("utf-8").lower()] = v.decode("utf-8")
        elif message["type"] == "http.response.body":
            response_body.extend(message.get("body", b""))

    await app(scope, receive, send)

    try:
        data = json.loads(response_body.decode("utf-8")) if response_body else None
    except Exception:
        data = response_body.decode("utf-8", errors="replace")

    return response_status, data, response_headers


async def run_advanced_donor_search_tests():
    print("=== Running Advanced Donor Search, Filtering & Export Test Suite (Step 1.28) ===")

    # 1. Fetch Users & Generate Auth Tokens
    async with AsyncSessionLocal() as session:
        admin_res = await session.execute(select(User).where(User.role == "admin", User.is_active == True))
        admin = admin_res.scalars().first()
        staff_res = await session.execute(select(User).where(User.role == "staff", User.is_active == True))
        staff = staff_res.scalars().first()
        donor_res = await session.execute(select(User).where(User.role == "donor", User.is_active == True))
        donor_user = donor_res.scalars().first()

    assert admin and staff and donor_user, "Admin, staff, and donor test users must exist"
    admin_token = create_access_token(data={"sub": str(admin.id)})
    staff_token = create_access_token(data={"sub": str(staff.id)})
    donor_token = create_access_token(data={"sub": str(donor_user.id)})

    # Create distinct test donor profiles with specific attributes
    print("Creating distinct test donor profiles for search & export...")
    today = date.today()
    tag = int(asyncio.get_event_loop().time() * 1000)

    async with AsyncSessionLocal() as session:
        # Donor A: Alice Smith, O+, Female, Active, dob 30 yrs ago
        u_alice = User(
            email=f"alice_{tag}@example.com",
            hashed_password="fakepassword",
            full_name=f"Alice Smith {tag}",
            role="donor",
            is_active=True,
        )
        # Donor B: Bob Jones, AB-, Male, Inactive, dob 45 yrs ago, injection-prone name
        u_bob = User(
            email=f"bob_{tag}@example.com",
            hashed_password="fakepassword",
            full_name=f"=SUM(1,2) Bob {tag}",
            role="donor",
            is_active=False,
        )
        # Donor C: Clara Oswald, B+, Female, Active, dob 22 yrs ago
        u_clara = User(
            email=f"clara_{tag}@example.com",
            hashed_password="fakepassword",
            full_name=f"Clara Oswald {tag}",
            role="donor",
            is_active=True,
        )
        session.add_all([u_alice, u_bob, u_clara])
        await session.commit()
        await session.refresh(u_alice)
        await session.refresh(u_bob)
        await session.refresh(u_clara)

        d_alice = Donor(
            user_id=u_alice.id,
            phone=f"+1-777-{u_alice.id:04d}",
            date_of_birth=date(today.year - 30, 1, 1),
            gender="female",
            blood_group="O+",
            address="10 Downing Street, London",
            last_donation_date=today - timedelta(days=60),
        )
        d_bob = Donor(
            user_id=u_bob.id,
            phone=f"+1-778-{u_bob.id:04d}",
            date_of_birth=date(today.year - 45, 2, 2),
            gender="male",
            blood_group="AB-",
            address="221B Baker Street, London",
            last_donation_date=None,
        )
        d_clara = Donor(
            user_id=u_clara.id,
            phone=f"+1-779-{u_clara.id:04d}",
            date_of_birth=date(today.year - 22, 3, 3),
            gender="female",
            blood_group="B+",
            address="742 Evergreen Terrace, Springfield",
            last_donation_date=today - timedelta(days=10),
        )
        session.add_all([d_alice, d_bob, d_clara])
        await session.commit()
        await session.refresh(d_alice)
        await session.refresh(d_bob)
        await session.refresh(d_clara)

        alice_id, bob_id, clara_id = d_alice.id, d_bob.id, d_clara.id
        alice_phone = d_alice.phone

    print(f"Created Donors: Alice ID={alice_id}, Bob ID={bob_id}, Clara ID={clara_id}")

    # 1. Test Unauthenticated Access on Protected Export
    print("1. Testing Unauthenticated Access to Export...")
    st, data, _ = await dispatch_request("GET", "/api/v1/donors/export")
    assert st == 401, f"Expected 401, got {st}"
    print("   -> PASSED: Unauthenticated export rejected (401).")

    # 2. Test Donor Role Forbidden from Export (RBAC)
    print("2. Testing Donor Role Access to Export (403)...")
    st, data, _ = await dispatch_request("GET", "/api/v1/donors/export", token=donor_token)
    assert st == 403, f"Expected 403, got {st}"
    print("   -> PASSED: Donor role forbidden from exporting (403).")

    # 3. Test Search by Name
    print("3. Testing Search by Name...")
    st, data, _ = await dispatch_request(
        "GET",
        "/api/v1/donors/",
        query_params={"name": f"Alice Smith {tag}"},
        token=staff_token,
    )
    assert st == 200
    assert data["total"] == 1
    assert data["items"][0]["id"] == alice_id
    print("   -> PASSED: Filter by name returned exact match.")

    # 4. Test Search by Email
    print("4. Testing Search by Email...")
    st, data, _ = await dispatch_request(
        "GET",
        "/api/v1/donors/",
        query_params={"email": f"bob_{tag}@example.com"},
        token=staff_token,
    )
    assert st == 200
    assert data["total"] == 1
    assert data["items"][0]["id"] == bob_id
    print("   -> PASSED: Filter by email returned exact match.")

    # 5. Test Search by Phone
    print("5. Testing Search by Phone...")
    st, data, _ = await dispatch_request(
        "GET",
        "/api/v1/donors/",
        query_params={"phone": alice_phone},
        token=staff_token,
    )
    assert st == 200
    assert data["total"] == 1
    assert data["items"][0]["id"] == alice_id
    print("   -> PASSED: Filter by phone returned exact match.")

    # 6. Test Blood Group Filter
    print("6. Testing Blood Group Filter...")
    st, data, _ = await dispatch_request(
        "GET",
        "/api/v1/donors/",
        query_params={"blood_group": "AB-", "search": str(tag)},
        token=staff_token,
    )
    assert st == 200
    assert data["total"] == 1
    assert data["items"][0]["id"] == bob_id
    print("   -> PASSED: Filter by blood group returned correct records.")

    # 7. Test Gender Filter
    print("7. Testing Gender Filter...")
    st, data, _ = await dispatch_request(
        "GET",
        "/api/v1/donors/",
        query_params={"gender": "male", "search": str(tag)},
        token=staff_token,
    )
    assert st == 200
    assert data["total"] == 1
    assert data["items"][0]["id"] == bob_id
    print("   -> PASSED: Filter by gender returned correct records.")

    # 8. Test Account Status Filter (is_active)
    print("8. Testing Account Status Filter (is_active=false)...")
    st, data, _ = await dispatch_request(
        "GET",
        "/api/v1/donors/",
        query_params={"is_active": "false", "search": str(tag)},
        token=staff_token,
    )
    assert st == 200
    assert data["total"] == 1
    assert data["items"][0]["id"] == bob_id
    print("   -> PASSED: Filter by account status returned inactive donor.")

    # 9. Test Multiple Filters Combined (AND logic)
    print("9. Testing Multiple Filters Combined...")
    st, data, _ = await dispatch_request(
        "GET",
        "/api/v1/donors/",
        query_params={
            "gender": "female",
            "blood_group": "O+",
            "search": str(tag),
        },
        token=staff_token,
    )
    assert st == 200
    assert data["total"] == 1
    assert data["items"][0]["id"] == alice_id
    print("   -> PASSED: Multiple combined filters matched target donor.")

    # 10. Test Date Range Filtering (Created At and Last Donation)
    print("10. Testing Date Range Filtering...")
    st, data, _ = await dispatch_request(
        "GET",
        "/api/v1/donors/",
        query_params={
            "start_date": (today - timedelta(days=1)).isoformat(),
            "end_date": today.isoformat(),
            "last_donation_from": (today - timedelta(days=20)).isoformat(),
            "last_donation_to": today.isoformat(),
            "search": str(tag),
        },
        token=staff_token,
    )
    assert st == 200
    assert data["total"] == 1
    assert data["items"][0]["id"] == clara_id
    print("   -> PASSED: Date range filters correctly filtered by last donation date.")

    # 11. Test Invalid Date Range Rejection (start_date > end_date)
    print("11. Testing Invalid Date Range Rejection...")
    st, data, _ = await dispatch_request(
        "GET",
        "/api/v1/donors/",
        query_params={
            "start_date": "2026-12-01",
            "end_date": "2026-11-01",
        },
        token=staff_token,
    )
    assert st == 400
    assert "start_date cannot be after end_date" in data["detail"]
    print("   -> PASSED: Invalid registration date range rejected (400).")

    # 12. Test Invalid Last Donation Date Range (from > to)
    print("12. Testing Invalid Last Donation Date Range Rejection...")
    st, data, _ = await dispatch_request(
        "GET",
        "/api/v1/donors/",
        query_params={
            "last_donation_from": "2026-12-01",
            "last_donation_to": "2026-11-01",
        },
        token=staff_token,
    )
    assert st == 400
    assert "last_donation_from cannot be after last_donation_to" in data["detail"]
    print("   -> PASSED: Invalid last donation date range rejected (400).")

    # 13. Test Pagination Compatibility
    print("13. Testing Pagination Compatibility...")
    st, data, _ = await dispatch_request(
        "GET",
        "/api/v1/donors/",
        query_params={"page": 1, "page_size": 2, "search": str(tag)},
        token=staff_token,
    )
    assert st == 200
    assert len(data["items"]) == 2
    assert data["total"] == 3
    assert data["total_pages"] == 2
    print("   -> PASSED: Pagination preserved.")

    # 14. Test Stable Sorting
    print("14. Testing Deterministic Sorting...")
    st, data, _ = await dispatch_request(
        "GET",
        "/api/v1/donors/",
        query_params={"sort_by": "blood_group", "sort_order": "asc", "search": str(tag)},
        token=staff_token,
    )
    assert st == 200
    bgs = [d["blood_group"] for d in data["items"]]
    assert bgs == sorted(bgs)
    print("   -> PASSED: Sorting returned deterministic ordered result.")

    # 15. Test Export Returns Valid CSV
    print("15. Testing Export Returns Valid CSV...")
    st, data, headers = await dispatch_request(
        "GET",
        "/api/v1/donors/export",
        query_params={"search": str(tag)},
        token=admin_token,
    )
    assert st == 200
    assert "text/csv" in headers.get("content-type", "")
    assert "attachment" in headers.get("content-disposition", "")
    assert "Donor ID,Full Name,Email,Phone,Blood Group" in data
    print("   -> PASSED: Export returned valid CSV content type and headers.")

    # 16. Test Export Respects Filters
    print("16. Testing Export Respects Filters...")
    st, data, _ = await dispatch_request(
        "GET",
        "/api/v1/donors/export",
        query_params={"blood_group": "AB-", "search": str(tag)},
        token=staff_token,
    )
    assert st == 200
    lines = [line.strip() for line in data.strip().split("\n") if line.strip()]
    assert len(lines) == 2, f"Expected 1 header + 1 donor row, got {len(lines)} lines"
    assert "AB-" in lines[1]
    print("   -> PASSED: Export strictly filtered to matched record.")

    # 17. Test CSV Formula Injection Protection
    print("17. Testing CSV Formula Injection Protection...")
    # Bob has name "=SUM(1,2) Bob..."
    st, data, _ = await dispatch_request(
        "GET",
        "/api/v1/donors/export",
        query_params={"blood_group": "AB-", "search": str(tag)},
        token=admin_token,
    )
    assert st == 200
    # Formula injection '=' should be safely prepended with single quote "'"
    assert "'=SUM(1,2)" in data or "\"'=SUM(1,2)" in data
    print("   -> PASSED: CSV Formula injection neutralized with single quote prefix.")

    # 18. Test Sensitive Fields Are Excluded
    print("18. Testing Sensitive Fields Excluded from Export...")
    assert "password" not in data.lower()
    assert "hashed_password" not in data.lower()
    assert "token" not in data.lower()
    print("   -> PASSED: No passwords, hashes, or tokens exposed in CSV export.")

    print("\n=== ALL 18 ADVANCED SEARCH, FILTERING & EXPORT TESTS PASSED! ===")


if __name__ == "__main__":
    asyncio.run(run_advanced_donor_search_tests())
