from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import auth
from app.models import (
    City,
    Notification,
    NotificationTypeEnum,
    Organization,
    OrganizationMember,
    OrgMemberRoleEnum,
    RoleEnum,
    User,
)
from app.notifications import create_notification

URL = "/api/notifications"
NOW = datetime(2026, 11, 14, 12, 0, tzinfo=UTC)


def sign_in(client: TestClient, user_id: int) -> None:
    token = auth._encode({"sub": str(user_id), "typ": "session"}, auth.SESSION_TTL)
    client.cookies.set("session", token, path="/api")


@pytest.fixture
def city_id(db) -> int:
    async def create(session) -> int:
        city = City(name="Львів", region="Львівська")
        session.add(city)
        await session.flush()
        return city.id

    return db(create)


@pytest.fixture
def make_user(db, city_id: int):
    counter = iter(range(1, 1000))

    def make(role: RoleEnum = RoleEnum.user) -> int:
        n = next(counter)

        async def create(session) -> int:
            user = User(
                google_sub=f"google-{n}",
                email=f"user{n}@example.com",
                first_name="Тарас",
                last_name="Шевченко",
                nickname=f"user_{n}",
                phone="+380671234567",
                birth_date=date(1990, 3, 9),
                city_id=city_id,
                platform_role=role,
            )
            session.add(user)
            await session.flush()
            return user.id

        return db(create)

    return make


def add_notifications(db, user_id: int, count: int, *, is_read: bool = False) -> list[int]:
    """Сповіщення з різним часом створення: i-те на i хвилин новіше за попереднє."""

    async def create(session) -> list[int]:
        existing = await session.scalar(
            select(Notification.id).where(Notification.user_id == user_id).limit(1)
        )
        shift = 1000 if existing else 0
        notifications = [
            Notification(
                user_id=user_id,
                type=NotificationTypeEnum.join_request_accepted,
                title=f"Сповіщення {i}",
                message="Текст",
                is_read=is_read,
                created_at=NOW + timedelta(minutes=shift + i),
            )
            for i in range(count)
        ]
        session.add_all(notifications)
        await session.flush()
        return [n.id for n in notifications]

    return db(create)


def is_read(db, notification_id: int) -> bool:
    async def fetch(session) -> bool:
        notification = await session.get(Notification, notification_id, populate_existing=True)
        return notification.is_read

    return db(fetch)


@pytest.fixture
def user_id(make_user) -> int:
    return make_user()


@pytest.fixture
def other_user_id(make_user) -> int:
    return make_user()


# --- create_notification ---


def test_create_notification_is_saved_with_callers_commit(db, user_id) -> None:
    async def create(session) -> Notification:
        return create_notification(
            session,
            user_id,
            NotificationTypeEnum.hours_credited,
            "Години нараховано",
            "Вам нараховано 3 години.",
            link="/profile",
        )

    notification = db(create)

    assert notification.id is not None
    assert notification.is_read is False
    assert notification.link == "/profile"


def test_create_notification_is_rolled_back_with_caller(db, db_session, user_id) -> None:
    async def create_and_rollback(session) -> list[int]:
        async with session.begin_nested() as savepoint:
            create_notification(
                session, user_id, NotificationTypeEnum.level_up, "Новий рівень", "Вітаємо!"
            )
            await session.flush()
            await savepoint.rollback()
        return list(await session.scalars(select(Notification.id)))

    assert db(create_and_rollback) == []


# --- GET /notifications ---


def test_list_returns_own_notifications_newest_first(client, db, user_id, other_user_id) -> None:
    ids = add_notifications(db, user_id, 3)
    add_notifications(db, other_user_id, 2)
    sign_in(client, user_id)

    response = client.get(URL)

    assert response.status_code == 200
    body = response.json()
    assert [n["id"] for n in body] == ids[::-1]
    assert set(body[0]) == {"id", "type", "title", "message", "is_read", "link", "created_at"}
    assert body[0]["type"] == "join_request_accepted"


def test_list_is_limited_to_50(client, db, user_id) -> None:
    ids = add_notifications(db, user_id, 55)
    sign_in(client, user_id)

    body = client.get(URL).json()

    assert len(body) == 50
    assert body[0]["id"] == ids[-1]


def test_list_pagination(client, db, user_id) -> None:
    ids = add_notifications(db, user_id, 5)
    sign_in(client, user_id)

    body = client.get(URL, params={"limit": 2, "offset": 1}).json()

    assert [n["id"] for n in body] == [ids[3], ids[2]]


@pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 51}, {"offset": -1}])
def test_list_pagination_validation(client, user_id, params) -> None:
    sign_in(client, user_id)

    assert client.get(URL, params=params).status_code == 422


def test_list_empty(client, user_id) -> None:
    sign_in(client, user_id)

    assert client.get(URL).json() == []


# --- GET /notifications/unread-count ---


def test_unread_count(client, db, user_id, other_user_id) -> None:
    add_notifications(db, user_id, 3)
    add_notifications(db, user_id, 2, is_read=True)
    add_notifications(db, other_user_id, 4)
    sign_in(client, user_id)

    response = client.get(f"{URL}/unread-count")

    assert response.status_code == 200
    assert response.json() == {"count": 3}


def test_unread_count_zero(client, user_id) -> None:
    sign_in(client, user_id)

    assert client.get(f"{URL}/unread-count").json() == {"count": 0}


# --- PATCH /notifications/{id}/read ---


def test_mark_read(client, db, user_id) -> None:
    first, second = add_notifications(db, user_id, 2)
    sign_in(client, user_id)

    response = client.patch(f"{URL}/{first}/read")

    assert response.status_code == 200
    assert response.json()["id"] == first
    assert response.json()["is_read"] is True
    assert is_read(db, first) is True
    assert is_read(db, second) is False
    assert client.get(f"{URL}/unread-count").json() == {"count": 1}


def test_mark_read_twice_is_ok(client, db, user_id) -> None:
    [notification_id] = add_notifications(db, user_id, 1)
    sign_in(client, user_id)
    client.patch(f"{URL}/{notification_id}/read")

    response = client.patch(f"{URL}/{notification_id}/read")

    assert response.status_code == 200
    assert response.json()["is_read"] is True


def test_cannot_mark_others_notification(client, db, user_id, other_user_id) -> None:
    [notification_id] = add_notifications(db, other_user_id, 1)
    sign_in(client, user_id)

    response = client.patch(f"{URL}/{notification_id}/read")

    # Як для неіснуючого: чужі сповіщення не видно
    assert response.status_code == 404
    assert response.json() == {"detail": "Notification not found"}
    assert is_read(db, notification_id) is False


def test_mark_unknown_notification(client, user_id) -> None:
    sign_in(client, user_id)

    assert client.patch(f"{URL}/999999/read").status_code == 404


@pytest.mark.parametrize("notification_id", ["0", "-1", str(2**63), "abc"])
def test_mark_read_invalid_id(client, user_id, notification_id) -> None:
    sign_in(client, user_id)

    assert client.patch(f"{URL}/{notification_id}/read").status_code == 422


# --- POST /notifications/read-all ---


def test_read_all(client, db, user_id, other_user_id) -> None:
    ids = add_notifications(db, user_id, 3)
    add_notifications(db, user_id, 1, is_read=True)
    [others] = add_notifications(db, other_user_id, 1)
    sign_in(client, user_id)

    response = client.post(f"{URL}/read-all")

    assert response.status_code == 200
    assert response.json() == {"updated": 3}
    assert all(is_read(db, n) for n in ids)
    # Чужі сповіщення не зачеплено
    assert is_read(db, others) is False


def test_read_all_without_unread(client, user_id) -> None:
    sign_in(client, user_id)

    assert client.post(f"{URL}/read-all").json() == {"updated": 0}


# --- Доступ ---


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", URL),
        ("get", f"{URL}/unread-count"),
        ("patch", f"{URL}/1/read"),
        ("post", f"{URL}/read-all"),
    ],
)
def test_requires_auth(client, method, path) -> None:
    assert client.request(method, path).status_code == 401


# --- Тригер: модерація організації ---


@pytest.fixture
def pending_org(db, make_user, city_id) -> tuple[int, int]:
    creator_id = make_user()

    async def create(session) -> int:
        organization = Organization(
            name="Добрі справи",
            email="org@example.com",
            phone="+380671234567",
            city_id=city_id,
            created_by=creator_id,
        )
        organization.members.append(
            OrganizationMember(user_id=creator_id, role=OrgMemberRoleEnum.owner)
        )
        session.add(organization)
        await session.flush()
        return organization.id

    return db(create), creator_id


def review(client, organization_id: int, **body):
    return client.post(f"/api/admin/organizations/{organization_id}/review", json=body)


def test_creator_notified_on_approval(client, make_user, pending_org) -> None:
    organization_id, creator_id = pending_org
    sign_in(client, make_user(RoleEnum.admin))
    assert review(client, organization_id, decision="approved").status_code == 200

    sign_in(client, creator_id)
    [notification] = client.get(URL).json()

    assert notification["type"] == "organization_approved"
    assert "Добрі справи" in notification["message"]
    assert notification["is_read"] is False
    assert notification["link"] == "/organization"


def test_creator_notified_on_rejection_with_reason(client, make_user, pending_org) -> None:
    organization_id, creator_id = pending_org
    sign_in(client, make_user(RoleEnum.admin))
    review(client, organization_id, decision="rejected", comment="Невірний ЄДРПОУ")

    sign_in(client, creator_id)
    [notification] = client.get(URL).json()

    assert notification["type"] == "organization_rejected"
    assert "Невірний ЄДРПОУ" in notification["message"]
    assert notification["link"] == "/organization/edit"


def test_no_notification_when_review_fails(client, db, make_user, pending_org) -> None:
    organization_id, creator_id = pending_org
    sign_in(client, make_user(RoleEnum.admin))
    review(client, organization_id, decision="approved")

    # Повторний розгляд відхиляється, і друге сповіщення не з'являється
    assert review(client, organization_id, decision="rejected", comment="x").status_code == 409

    sign_in(client, creator_id)
    assert len(client.get(URL).json()) == 1
