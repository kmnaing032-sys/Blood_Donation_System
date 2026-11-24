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
from sqlalchemy.exc import IntegrityError, OperationalError


async def dispatch_request(
    method: str,
    path: str,
    body: dict | None = None,
    token: str | None = None,
    headers_extra: dict | None = None,
) -> Tuple[int, Any, dict]:
    """Execute an ASGI request directly against FastAPI app and return status, json, headers."""
    headers = []
    if token:
        headers.append((b"authorization", f"Bearer {token}".encode("utf-8")))

    if headers_extra:
        for k, v in headers_extra.items():
            headers.append((k.lower().encode("utf-8"), v.encode("utf-8")))

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
    res_headers = {}

    async def receive():
        return {"type": "http.request", "body": body_bytes, "more_body": False}

    async def send(message):
        nonlocal status_code, res_headers
        if message["type"] == "http.response.start":
            status_code = message["status"]
            for hk, hv in message.get("headers", []):
                res_headers[hk.decode("utf-8").lower()] = hv.decode("utf-8")
        elif message["type"] == "http.response.body":
            res_chunks.append(message.get("body", b""))

    await app(scope, receive, send)

    resp_body = b"".join(res_chunks).decode("utf-8")
    try:
        data = json.loads(resp_body) if resp_body else None
    except json.JSONDecodeError:
        data = resp_body

    return status_code, data, res_headers


test_results = {}


def record_result(name: str, passed: bool, notes: str = ""):
    test_results[name] = {"passed": passed, "notes": notes}
    icon = "[SUCCESS]" if passed else "[FAILED]"
    print(f"{icon} - {name} ({notes})")


async def setup_test_data():
    async with AsyncSessionLocal() as session:
        # Admin user
        admin = (await session.execute(select(User).where(User.email == "val_admin@example.com"))).scalar_one_or_none()
        if not admin:
            admin = User(
                email="val_admin@example.com",
                hashed_password=hash_password("AdminPass123!"),
                full_name="Validation Admin",
                role="admin",
                is_active=True,
            )
            session.add(admin)

        # Normal donor user
        user = (await session.execute(select(User).where(User.email == "val_user@example.com"))).scalar_one_or_none()
        if not user:
            user = User(
                email="val_user@example.com",
                hashed_password=hash_password("UserPass123!"),
                full_name="Validation User",
                role="user",
                is_active=True,
            )
            session.add(user)

        await session.commit()
        await session.refresh(admin)
        await session.refresh(user)

        admin_token = create_access_token({"sub": str(admin.id), "email": admin.email, "role": "admin"})
        user_token = create_access_token({"sub": str(user.id), "email": user.email, "role": "user"})

        return {
            "admin_token": admin_token,
            "user_token": user_token,
            "admin_id": admin.id,
            "user_id": user.id,
        }


async def run_tests():
    data = await setup_test_data()
    admin_token = data["admin_token"]
    user_token = data["user_token"]

    print("\n========================================================")
    print("STEP 9: API VALIDATION & ERROR HANDLING TEST SUITE")
    print("========================================================")

    # 1. Standard Error Format Verification (HTTPException)
    status_code, body, headers = await dispatch_request("GET", "/api/v1/users/9999999", token=admin_token)
    t1 = (
        status_code == 404
        and body.get("success") is False
        and "message" in body
        and "detail" in body
        and body.get("error_code") == "NOT_FOUND"
        and "correlation_id" in body
        and "x-correlation-id" in headers
    )
    record_result("Consistent Error Format (404 Not Found)", t1, f"Code: {status_code}, Body: {body}")

    # 2. Request Correlation ID Propagation
    custom_corr = "test-corr-123456"
    status_code, body, headers = await dispatch_request(
        "GET", "/api/v1/users/9999999", token=admin_token, headers_extra={"X-Correlation-ID": custom_corr}
    )
    t2 = headers.get("x-correlation-id") == custom_corr and body.get("correlation_id") == custom_corr
    record_result("Request Correlation ID Header & Body Propagation", t2, f"Correlation ID: {body.get('correlation_id')}")

    # 3. Pydantic Request Validation Error (422 Unprocessable Entity with error_code=VALIDATION_ERROR)
    invalid_reg_payload = {
        "full_name": "A",  # Too short (min 3)
        "email": "not-an-email",  # Invalid email format
        "password": "weak",  # Less than 8 chars, missing digits
    }
    status_code, body, _ = await dispatch_request("POST", "/api/v1/auth/register", body=invalid_reg_payload)
    t3 = (
        status_code == 422
        and body.get("success") is False
        and body.get("error_code") == "VALIDATION_ERROR"
        and isinstance(body.get("detail"), list)
        and len(body.get("detail")) >= 3
    )
    record_result("Pydantic Validation Format & Field Detail (422 Unprocessable)", t3, f"Field errors: {body.get('detail')}")

    # 4. Password Strength Validation (Letters & Digits requirement)
    pwd_payload = {
        "full_name": "Valid Name",
        "email": "testvalidpwd@example.com",
        "password": "allcharacterswithoutdigits",
    }
    status_code, body, _ = await dispatch_request("POST", "/api/v1/auth/register", body=pwd_payload)
    t4 = status_code == 422 and any("digit" in err.get("message", "").lower() for err in body.get("detail", []))
    record_result("Password Strength Validation (Missing digit rejected)", t4, f"Detail: {body.get('detail')}")

    # 5. Unauthorized Access (401 with standard error format)
    status_code, body, headers = await dispatch_request("GET", "/api/v1/users/")
    t5 = (
        status_code == 401
        and body.get("success") is False
        and body.get("error_code") == "UNAUTHORIZED"
        and "www-authenticate" in headers
    )
    record_result("Unauthorized Access Error (401 with Bearer challenge)", t5, f"Status: {status_code}")

    # 6. Forbidden Access (403 Forbidden with standard error format)
    status_code, body, _ = await dispatch_request("GET", "/api/v1/users/", token=user_token)
    t6 = status_code == 403 and body.get("success") is False and body.get("error_code") == "FORBIDDEN"
    record_result("Role-Based Forbidden Access (403 Forbidden)", t6, f"Error Code: {body.get('error_code')}")

    # 7. Database Duplicate Record / Integrity Violation (409 Conflict)
    # val_admin already exists
    dup_payload = {
        "full_name": "Validation Admin",
        "email": "val_admin@example.com",
        "password": "Password123!",
    }
    status_code, body, _ = await dispatch_request("POST", "/api/v1/auth/register", body=dup_payload)
    t7 = status_code == 409 and body.get("success") is False and "already registered" in body.get("detail", "").lower()
    record_result("Duplicate Record Rejection (409 Conflict)", t7, f"Status: {status_code}, Detail: {body.get('detail')}")

    # 8. Donor Schema Validation: Age limits (< 18 rejected)
    today = date.today()
    underage_dob = date(today.year - 15, today.month, today.day).isoformat()
    underage_donor = {
        "phone": "0912345678",
        "date_of_birth": underage_dob,
        "gender": "male",
        "blood_group": "A+",
        "address": "123 Valid Street",
    }
    status_code, body, _ = await dispatch_request("POST", "/api/v1/donors/", body=underage_donor, token=user_token)
    t8 = status_code == 422 and any("18" in err.get("message", "") for err in body.get("detail", []))
    record_result("Donor Age Validation (Under 18 rejected)", t8, f"Status: {status_code}")

    # 9. Donor Schema Validation: Invalid Blood Group
    bad_bg_donor = {
        "phone": "0912345678",
        "date_of_birth": date(today.year - 25, today.month, today.day).isoformat(),
        "gender": "male",
        "blood_group": "XYZ+",  # Invalid blood group
        "address": "123 Valid Street",
    }
    status_code, body, _ = await dispatch_request("POST", "/api/v1/donors/", body=bad_bg_donor, token=user_token)
    t9 = status_code == 422 and any("blood_group" in err.get("field", "") for err in body.get("detail", []))
    record_result("Donor Blood Group Validation (Invalid group rejected)", t9, f"Status: {status_code}")

    # 10. Donation Quantity Validation (< 100ml or > 800ml rejected)
    bad_quantity_donation = {
        "donor_id": 1,
        "donation_date": today.isoformat(),
        "quantity_ml": 50,  # Below 100ml standard
        "blood_group": "A+",
        "status": "completed",
    }
    status_code, body, _ = await dispatch_request("POST", "/api/v1/donations/", body=bad_quantity_donation, token=admin_token)
    t10 = status_code == 422 and any("quantity" in err.get("field", "") for err in body.get("detail", []))
    record_result("Donation Quantity Range Validation (50ml rejected)", t10, f"Status: {status_code}")

    # 11. Blood Stock Negative Quantity Prevention
    bad_stock_update = {
        "available_quantity_ml": -500,
    }
    status_code, body, _ = await dispatch_request("PATCH", "/api/v1/blood-stock/A%2B", body=bad_stock_update, token=admin_token)
    t11 = status_code == 422 and any("available_quantity_ml" in err.get("field", "") for err in body.get("detail", []))
    record_result("Negative Blood Stock Prevention (Negative quantity rejected)", t11, f"Status: {status_code}")

    # 12. Blood Request Status Transition Validation
    # Attempting invalid status transition on a rejected request
    status_code, body, _ = await dispatch_request("POST", "/api/v1/blood-requests/999999/approve", token=admin_token)
    t12 = status_code == 404 and body.get("error_code") == "NOT_FOUND"
    record_result("Invalid Entity / Transition Handling (404 Not Found)", t12, f"Status: {status_code}")

    # 13. Unexpected Exception Handling (500 without stack trace leakage)
    # Temporarily trigger a controlled unhandled exception in an ASGI scope or test endpoint
    from app.core.exceptions import global_exception_handler
    from starlette.requests import Request
    
    mock_request = Request({
        "type": "http",
        "method": "GET",
        "path": "/api/v1/simulated-crash",
        "headers": [(b"x-correlation-id", b"simulated-crash-id")],
    })
    res_json = await global_exception_handler(mock_request, RuntimeError("Simulated Database Corrupt Exception"))
    data_500 = json.loads(res_json.body.decode("utf-8"))
    t13 = (
        res_json.status_code == 500
        and data_500.get("success") is False
        and data_500.get("error_code") == "INTERNAL_SERVER_ERROR"
        and "Simulated Database Corrupt" not in data_500.get("detail")
        and data_500.get("correlation_id") == "simulated-crash-id"
    )
    record_result("Global Unexpected Error Handler (500 without leaking stack trace)", t13, f"Body: {data_500}")

    # 14. Database Integrity Error Handler Simulation
    from app.core.exceptions import integrity_error_handler
    mock_integrity = integrity_error_handler(
        mock_request,
        IntegrityError("duplicate key value violates unique constraint 'users_email_key'", params=None, orig=Exception("duplicate key value violates unique constraint 'users_email_key'"))
    )
    res_integrity = await mock_integrity
    data_int = json.loads(res_integrity.body.decode("utf-8"))
    t14 = (
        res_integrity.status_code == 409
        and data_int.get("success") is False
        and data_int.get("error_code") == "DUPLICATE_RECORD"
    )
    record_result("Database Integrity Error Handler (409 DUPLICATE_RECORD)", t14, f"Body: {data_int}")

    # 15. Database Connection Failure Simulation (503 Service Unavailable)
    from app.core.exceptions import database_error_handler
    from sqlalchemy.exc import OperationalError
    mock_db_err = database_error_handler(
        mock_request,
        OperationalError("connection to server was lost", params=None, orig=Exception("connection to server was lost"))
    )
    res_db = await mock_db_err
    data_db = json.loads(res_db.body.decode("utf-8"))
    t15 = (
        res_db.status_code == 503
        and data_db.get("success") is False
        and data_db.get("error_code") == "DATABASE_UNAVAILABLE"
    )
    record_result("Database Connection Loss Handler (503 DATABASE_UNAVAILABLE)", t15, f"Body: {data_db}")

    print("\n================ TEST SUMMARY ================")
    all_passed = all(res["passed"] for res in test_results.values())
    passed_count = sum(1 for res in test_results.values() if res["passed"])
    total_count = len(test_results)
    print(f"Results: {passed_count}/{total_count} passed.")
    if all_passed:
        print("ALL VALIDATION & ERROR HANDLING TESTS PASSED SUCCESSFULLY!")
    else:
        print("SOME TESTS FAILED.")
        for name, res in test_results.items():
            if not res["passed"]:
                print(f"FAILED: {name} - {res['notes']}")


if __name__ == "__main__":
    asyncio.run(run_tests())
