import asyncio
import json
from typing import Any, Tuple

from app.main import app
from app.core.token import create_access_token
from app.core.security import hash_password
from app.database.database import AsyncSessionLocal
from app.models.user import User
from app.models.notification import Notification
from app.crud.notification import create_notification
from app.schemas.notification import NotificationCreate
from sqlalchemy import select


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

    # Separate query string if present in path
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


async def run_tests():
    print("=" * 60)
    print("STARTING TEST SUITE: Step 1.17 – Backend Notification System")
    print("=" * 60)

    user1_id = None
    user2_id = None
    notif1_id = None
    notif2_id = None

    async with AsyncSessionLocal() as session:
        # Create User 1
        u1 = User(
            full_name="Notify User One",
            email="notify.user1@example.com",
            hashed_password=hash_password("PassUser123!"),
            role="donor",
            is_active=True,
        )
        session.add(u1)

        # Create User 2
        u2 = User(
            full_name="Notify User Two",
            email="notify.user2@example.com",
            hashed_password=hash_password("PassUser456!"),
            role="donor",
            is_active=True,
        )
        session.add(u2)
        await session.commit()
        await session.refresh(u1)
        await session.refresh(u2)
        user1_id = u1.id
        user2_id = u2.id

        # Create Notification for User 1
        n1 = await create_notification(
            session,
            user_id=user1_id,
            notification_data=NotificationCreate(
                title="Donation Confirmed",
                message="Your blood donation appointment is confirmed.",
                category="donation",
            ),
        )
        notif1_id = n1.id

        # Create Notification for User 2
        n2 = await create_notification(
            session,
            user_id=user2_id,
            notification_data=NotificationCreate(
                title="Stock Alert",
                message="O- blood stock is running low.",
                category="stock",
            ),
        )
        notif2_id = n2.id

    token_user1 = create_access_token({"sub": str(user1_id)})
    token_user2 = create_access_token({"sub": str(user2_id)})

    test_results = {}

    try:
        # TEST 1: Unauthenticated request is rejected (401)
        status, _ = await dispatch_request("GET", "/api/v1/notifications/")
        test_results["1_unauthenticated_rejected"] = status == 401

        # TEST 2: User 1 can retrieve their own notifications
        status, data = await dispatch_request(
            "GET", "/api/v1/notifications/", token=token_user1
        )
        test_results["2_user1_can_retrieve_own"] = (
            status == 200
            and data["total"] == 1
            and data["items"][0]["id"] == notif1_id
            and data["items"][0]["title"] == "Donation Confirmed"
        )

        # TEST 3: User 1 cannot retrieve User 2's notifications (isolated list)
        test_results["3_cross_user_isolation"] = (
            status == 200
            and not any(item["id"] == notif2_id for item in data["items"])
        )

        # TEST 4: Unread count is correct (1 unread for user 1)
        status, data = await dispatch_request(
            "GET", "/api/v1/notifications/unread-count", token=token_user1
        )
        test_results["4_unread_count_correct"] = (
            status == 200 and data.get("unread_count") == 1
        )

        # TEST 5: User 1 can mark their own notification as read
        status, data = await dispatch_request(
            "PATCH", f"/api/v1/notifications/{notif1_id}/read", token=token_user1
        )
        test_results["5_mark_own_as_read"] = (
            status == 200 and data["is_read"] is True and data["id"] == notif1_id
        )

        # Verify unread count decreased to 0
        status, data = await dispatch_request(
            "GET", "/api/v1/notifications/unread-count", token=token_user1
        )
        test_results["5b_unread_count_decreased"] = (
            status == 200 and data.get("unread_count") == 0
        )

        # TEST 6: User 1 CANNOT mark User 2's notification as read (returns 404)
        status, _ = await dispatch_request(
            "PATCH", f"/api/v1/notifications/{notif2_id}/read", token=token_user1
        )
        test_results["6_cannot_mark_other_user_notif"] = status == 404

        # TEST 7: Mark all as read for User 2
        status, data = await dispatch_request(
            "POST", "/api/v1/notifications/read-all", token=token_user2
        )
        test_results["7_mark_all_as_read"] = (
            status == 200 and data.get("updated_count") == 1
        )

        # TEST 8: User 1 CANNOT delete User 2's notification (returns 404)
        status, _ = await dispatch_request(
            "DELETE", f"/api/v1/notifications/{notif2_id}", token=token_user1
        )
        test_results["8_cannot_delete_other_user_notif"] = status == 404

        # TEST 9: User 1 CAN delete their own notification
        status, data = await dispatch_request(
            "DELETE", f"/api/v1/notifications/{notif1_id}", token=token_user1
        )
        test_results["9_can_delete_own_notif"] = (
            status == 200 and "deleted successfully" in data.get("message", "")
        )

        # TEST 10: Deleting already deleted/non-existent returns 404
        status, _ = await dispatch_request(
            "DELETE", f"/api/v1/notifications/{notif1_id}", token=token_user1
        )
        test_results["10_delete_nonexistent_returns_404"] = status == 404

        # TEST 11: Pagination parameters work properly
        # Seed 5 notifications for User 2
        async with AsyncSessionLocal() as session:
            for i in range(5):
                await create_notification(
                    session,
                    user_id=user2_id,
                    notification_data=NotificationCreate(
                        title=f"Notification #{i}",
                        message=f"Message content #{i}",
                        category="system",
                    ),
                )

        status, data = await dispatch_request(
            "GET", "/api/v1/notifications/?skip=0&limit=2", token=token_user2
        )
        test_results["11_pagination_limit"] = (
            status == 200 and len(data["items"]) == 2 and data["total"] == 6
        )

        # TEST 12: Invalid pagination returns 422
        status, _ = await dispatch_request(
            "GET", "/api/v1/notifications/?skip=-1", token=token_user2
        )
        test_results["12_invalid_pagination_rejected"] = status == 422

    finally:
        # Cleanup test users (cascade will delete their notifications)
        async with AsyncSessionLocal() as session:
            res = await session.execute(
                select(User).where(User.id.in_([user1_id, user2_id]))
            )
            for u in res.scalars().all():
                await session.delete(u)
            await session.commit()
            print("[CLEANUP] Deleted temporary test users and notifications.")

    print("\n" + "=" * 60)
    print("NOTIFICATION TEST SUITE RESULTS:")
    print("=" * 60)
    all_passed = True
    for test_name, passed in test_results.items():
        status_str = "PASS" if passed else "FAIL"
        if not passed:
            all_passed = False
        print(f"[{status_str}] - {test_name}")

    print("=" * 60)
    if all_passed:
        print("ALL NOTIFICATION TESTS PASSED SUCCESSFULLY!")
    else:
        print("SOME NOTIFICATION TESTS FAILED!")
        exit(1)


if __name__ == "__main__":
    asyncio.run(run_tests())
