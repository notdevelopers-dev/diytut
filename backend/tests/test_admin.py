from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import auth
from app.models import (
    City,
    LoginEvent,
    LoginMethodEnum,
    Organization,
    OrganizationMember,
    OrgMemberRoleEnum,
    OrgStatusEnum,
    RoleEnum,
    User,
)
from app.services import logins as logins_service


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


@pytest.fixture
def make_organization(db, make_user, city_id: int):
    def make(status: OrgStatusEnum = OrgStatusEnum.pending, name: str = "Добрі справи") -> int:
        owner_id = make_user()

        async def create(session) -> int:
            organization = Organization(
                name=name,
                email="org@example.com",
                phone="+380671234567",
                city_id=city_id,
                status=status,
                created_by=owner_id,
            )
            organization.members.append(
                OrganizationMember(user_id=owner_id, role=OrgMemberRoleEnum.owner)
            )
            session.add(organization)
            await session.flush()
            return organization.id

        return db(create)

    return make


def sign_in(client: TestClient, user_id: int) -> None:
    token = auth._encode({"sub": str(user_id), "typ": "session"}, auth.SESSION_TTL)
    client.cookies.set("session", token, path="/api")


@pytest.fixture
def admin_id(client: TestClient, make_user) -> int:
    admin_id = make_user(RoleEnum.admin)
    sign_in(client, admin_id)
    return admin_id


ADMIN_ENDPOINTS = [
    ("get", "/api/admin/organizations"),
    ("get", "/api/admin/organizations/1"),
    ("post", "/api/admin/organizations/1/review"),
    ("get", "/api/admin/stats/logins"),
]


# --- Доступ ---


@pytest.mark.parametrize(("method", "url"), ADMIN_ENDPOINTS)
def test_admin_endpoints_require_sign_in(client: TestClient, method: str, url: str) -> None:
    assert client.request(method, url, json={"decision": "approved"}).status_code == 401


@pytest.mark.parametrize(("method", "url"), ADMIN_ENDPOINTS)
def test_admin_endpoints_reject_regular_users(
    client: TestClient, make_user, method: str, url: str
) -> None:
    sign_in(client, make_user())

    response = client.request(method, url, json={"decision": "approved"})

    assert response.status_code == 403
    assert response.json()["detail"] == "Administrator access required"


def test_session_of_deleted_user_is_rejected(client: TestClient) -> None:
    sign_in(client, 999_999_999)
    assert client.get("/api/admin/organizations").status_code == 401


def test_revoked_admin_loses_access_immediately(client: TestClient, db, admin_id: int) -> None:
    async def demote(session) -> None:
        (await session.get(User, admin_id)).platform_role = RoleEnum.user

    db(demote)

    assert client.get("/api/admin/organizations").status_code == 403


# --- Список заявок ---


@pytest.mark.usefixtures("admin_id")
def test_lists_requests_with_creator_and_city(client: TestClient, make_organization) -> None:
    organization_id = make_organization()

    response = client.get("/api/admin/organizations")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    [item] = body["items"]
    assert item["id"] == organization_id
    assert item["status"] == "pending"
    assert item["city"]["name"] == "Львів"
    assert item["creator"]["email"].endswith("@example.com")
    assert item["reviewed_by"] is None


@pytest.mark.usefixtures("admin_id")
def test_filters_by_status(client: TestClient, make_organization) -> None:
    pending_id = make_organization()
    make_organization(OrgStatusEnum.approved)
    make_organization(OrgStatusEnum.rejected)

    body = client.get("/api/admin/organizations", params={"status": "pending"}).json()

    assert body["total"] == 1
    assert [item["id"] for item in body["items"]] == [pending_id]
    assert client.get("/api/admin/organizations").json()["total"] == 3


@pytest.mark.usefixtures("admin_id")
def test_oldest_requests_come_first_and_are_paginated(
    client: TestClient, make_organization
) -> None:
    ids = [make_organization(name=f"Організація {n}") for n in range(3)]

    first = client.get("/api/admin/organizations", params={"limit": 2}).json()
    second = client.get("/api/admin/organizations", params={"limit": 2, "offset": 2}).json()

    assert first["total"] == second["total"] == 3
    assert [item["id"] for item in first["items"] + second["items"]] == ids


@pytest.mark.usefixtures("admin_id")
@pytest.mark.parametrize(
    "params", [{"status": "unknown"}, {"limit": 0}, {"limit": 101}, {"offset": -1}]
)
def test_invalid_list_params(client: TestClient, params: dict) -> None:
    assert client.get("/api/admin/organizations", params=params).status_code == 422


@pytest.mark.usefixtures("admin_id")
def test_reads_single_request(client: TestClient, make_organization) -> None:
    organization_id = make_organization()

    response = client.get(f"/api/admin/organizations/{organization_id}")

    assert response.status_code == 200
    assert response.json()["id"] == organization_id


@pytest.mark.usefixtures("admin_id")
def test_unknown_request_is_404(client: TestClient) -> None:
    assert client.get("/api/admin/organizations/999999999").status_code == 404


# --- Розгляд заявки ---


def review(client: TestClient, organization_id: int, **body):
    return client.post(f"/api/admin/organizations/{organization_id}/review", json=body)


def test_admin_approves_request(client: TestClient, admin_id: int, make_organization) -> None:
    organization_id = make_organization()

    response = review(client, organization_id, decision="approved")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "approved"
    assert body["reviewed_by"] == admin_id
    assert body["reviewed_at"] is not None
    assert body["review_comment"] is None


def test_admin_rejects_request_with_comment(
    client: TestClient, db_session, admin_id: int, make_organization
) -> None:
    organization_id = make_organization()

    response = review(client, organization_id, decision="rejected", comment="  Немає ЄДРПОУ  ")

    assert response.status_code == 200
    assert response.json()["status"] == "rejected"
    assert response.json()["review_comment"] == "Немає ЄДРПОУ"

    async def load(session):
        return await session.get(Organization, organization_id, populate_existing=True)

    organization = client.portal.call(load, db_session)
    assert organization.status == OrgStatusEnum.rejected
    assert organization.reviewed_by == admin_id


def test_owner_sees_decision(client: TestClient, db_session, admin_id, make_organization) -> None:
    organization_id = make_organization()
    review(client, organization_id, decision="approved")

    async def owner(session) -> int:
        return await session.scalar(
            select(Organization.created_by).where(Organization.id == organization_id)
        )

    sign_in(client, client.portal.call(owner, db_session))
    assert client.get("/api/organizations/me").json()["status"] == "approved"


@pytest.mark.usefixtures("admin_id")
@pytest.mark.parametrize("comment", [None, "", "   "])
def test_rejection_requires_comment(client: TestClient, make_organization, comment) -> None:
    organization_id = make_organization()

    response = review(client, organization_id, decision="rejected", comment=comment)

    assert response.status_code == 422


@pytest.mark.usefixtures("admin_id")
@pytest.mark.parametrize(
    "body",
    [
        {},
        {"decision": "pending"},
        {"decision": "blocked"},
        {"decision": "approved", "status": "approved"},
        {"decision": "approved", "comment": "x" * 2001},
    ],
)
def test_invalid_review_is_rejected(client: TestClient, make_organization, body: dict) -> None:
    organization_id = make_organization()

    response = client.post(f"/api/admin/organizations/{organization_id}/review", json=body)

    assert response.status_code == 422


@pytest.mark.usefixtures("admin_id")
@pytest.mark.parametrize(
    "status", [OrgStatusEnum.approved, OrgStatusEnum.rejected, OrgStatusEnum.blocked]
)
def test_request_can_be_reviewed_only_once(
    client: TestClient, make_organization, status: OrgStatusEnum
) -> None:
    organization_id = make_organization(status)

    response = review(client, organization_id, decision="approved")

    assert response.status_code == 409


@pytest.mark.usefixtures("admin_id")
def test_review_of_unknown_request_is_404(client: TestClient) -> None:
    assert review(client, 999_999_999, decision="approved").status_code == 404


# --- Статистика входів ---


def add_logins(db, *logins: tuple[int | None, datetime]) -> None:
    async def create(session) -> None:
        for user_id, created_at in logins:
            session.add(
                LoginEvent(user_id=user_id, method=LoginMethodEnum.google, created_at=created_at)
            )

    db(create)


@pytest.mark.usefixtures("admin_id")
def test_login_stats_by_kyiv_days(client: TestClient, db, make_user) -> None:
    first, second = make_user(), make_user()
    add_logins(
        db,
        # 1 березня, 23:30 UTC — це вже 2 березня за Києвом (UTC+2)
        (first, datetime(2026, 3, 1, 23, 30, tzinfo=UTC)),
        (first, datetime(2026, 3, 2, 8, 0, tzinfo=UTC)),
        (second, datetime(2026, 3, 2, 9, 0, tzinfo=UTC)),
        (second, datetime(2026, 3, 4, 9, 0, tzinfo=UTC)),
        # Поза періодом
        (second, datetime(2026, 3, 5, 22, 0, tzinfo=UTC)),
        (first, datetime(2026, 2, 28, 21, 59, tzinfo=UTC)),
    )

    response = client.get(
        "/api/admin/stats/logins", params={"date_from": "2026-03-01", "date_to": "2026-03-05"}
    )

    assert response.status_code == 200
    assert response.json() == {
        "date_from": "2026-03-01",
        "date_to": "2026-03-05",
        "timezone": "Europe/Kyiv",
        "total_logins": 4,
        "unique_users": 2,
        "days": [
            {"date": "2026-03-01", "logins": 0, "unique_users": 0},
            {"date": "2026-03-02", "logins": 3, "unique_users": 2},
            {"date": "2026-03-03", "logins": 0, "unique_users": 0},
            {"date": "2026-03-04", "logins": 1, "unique_users": 1},
            {"date": "2026-03-05", "logins": 0, "unique_users": 0},
        ],
    }


@pytest.mark.usefixtures("admin_id")
def test_logins_of_deleted_users_are_counted(client: TestClient, db) -> None:
    add_logins(db, (None, datetime(2026, 3, 2, 12, 0, tzinfo=UTC)))

    body = client.get(
        "/api/admin/stats/logins", params={"date_from": "2026-03-02", "date_to": "2026-03-02"}
    ).json()

    assert body["total_logins"] == 1
    assert body["unique_users"] == 0


@pytest.mark.usefixtures("admin_id")
def test_default_period_is_last_30_days(client: TestClient, db, admin_id: int) -> None:
    async def create(session) -> None:
        # Час ставить БД: now() у транзакції тесту той самий, від якого рахується «сьогодні»,
        # тож тест не залежить від того, чи минула північ між вставкою й запитом
        session.add(LoginEvent(user_id=admin_id, method=LoginMethodEnum.google))

    db(create)

    body = client.get("/api/admin/stats/logins").json()

    assert len(body["days"]) == logins_service.DEFAULT_STATS_DAYS
    assert date.fromisoformat(body["date_to"]) - date.fromisoformat(body["date_from"]) == (
        timedelta(days=logins_service.DEFAULT_STATS_DAYS - 1)
    )
    assert body["total_logins"] == 1


@pytest.mark.usefixtures("admin_id")
@pytest.mark.parametrize(
    "params",
    [
        {"date_from": "2026-03-05", "date_to": "2026-03-01"},
        {"date_from": "2025-01-01", "date_to": "2026-03-01"},
        {"date_from": "not-a-date"},
    ],
)
def test_invalid_period(client: TestClient, params: dict) -> None:
    assert client.get("/api/admin/stats/logins", params=params).status_code == 422
