from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import auth
from app.models import (
    City,
    JoinRequest,
    JoinRequestStatusEnum,
    Notification,
    NotificationTypeEnum,
    Organization,
    OrganizationMember,
    OrgMemberRoleEnum,
    OrgStatusEnum,
    Project,
    ProjectStatusEnum,
    User,
)

STARTS_AT = datetime(2026, 12, 1, 10, 0, tzinfo=UTC)


def sign_in(client: TestClient, user_id: int) -> None:
    token = auth._encode({"sub": str(user_id), "typ": "session"}, auth.SESSION_TTL)
    client.cookies.set("session", token, path="/api")


@pytest.fixture
def ids(db) -> dict[str, int]:
    async def create(session) -> dict[str, int]:
        city = City(name="Львів", region="Львівська")
        session.add(city)
        await session.flush()

        owner = User(
            google_sub="google-owner",
            email="owner@example.com",
            first_name="Олександр",
            last_name="Власник",
            phone="+380671111111",
            birth_date=date(1990, 1, 1),
            city_id=city.id,
        )
        volunteer = User(
            google_sub="google-volunteer",
            email="volunteer@example.com",
            first_name="Марія",
            last_name="Волонтерка",
            phone="+380672222222",
            birth_date=date(1995, 5, 5),
            city_id=city.id,
        )
        session.add_all([owner, volunteer])
        await session.flush()

        org = Organization(
            name="Благодійний Фонд «Дія»",
            email="fund@diya.org.ua",
            phone="+380673333333",
            city_id=city.id,
            description="Допомога усім, хто потребує",
            status=OrgStatusEnum.approved,
            created_by=owner.id,
        )
        session.add(org)
        await session.flush()

        member = OrganizationMember(
            organization_id=org.id,
            user_id=owner.id,
            role=OrgMemberRoleEnum.owner,
        )
        session.add(member)
        await session.flush()

        project = Project(
            organization_id=org.id,
            title="Гуманітарна допомога дітям",
            description="Пакування наборів",
            starts_at=STARTS_AT,
            ends_at=STARTS_AT + timedelta(hours=4),
            is_online=False,
            city_id=city.id,
            address="вул. Свободи, 10",
            capacity=20,
            volunteer_hours=Decimal("4"),
            status=ProjectStatusEnum.published,
        )
        session.add(project)
        await session.flush()

        return {
            "city": city.id,
            "owner": owner.id,
            "volunteer": volunteer.id,
            "organization": org.id,
            "project": project.id,
        }

    return db(create)


def test_get_organization_view_unauthenticated(client: TestClient, ids: dict[str, int]) -> None:
    client.cookies.clear()
    res = client.get(f"/api/organizations/{ids['organization']}")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == ids["organization"]
    assert data["name"] == "Благодійний Фонд «Дія»"
    assert data["city_name"] == "Львів"
    assert data["is_verified"] is True
    assert data["projects_count"] >= 1
    assert data["user_request_status"] is None
    assert data["is_user_member"] is False


def test_get_organization_view_not_found(client: TestClient) -> None:
    res = client.get("/api/organizations/99999999")
    assert res.status_code == 404


def test_get_organization_projects(client: TestClient, ids: dict[str, int]) -> None:
    res = client.get(f"/api/organizations/{ids['organization']}/projects")
    assert res.status_code == 200
    projects = res.json()
    assert len(projects) == 1
    assert projects[0]["title"] == "Гуманітарна допомога дітям"


def test_submit_join_request_unauthenticated(client: TestClient, ids: dict[str, int]) -> None:
    client.cookies.clear()
    res = client.post(
        f"/api/organizations/{ids['organization']}/join-requests",
        json={"motivation": "Хочу допомагати"},
    )
    assert res.status_code == 401


def test_submit_join_request_success(
    client: TestClient, ids: dict[str, int], db
) -> None:
    sign_in(client, ids["volunteer"])

    # 1. Подання заявки
    res = client.post(
        f"/api/organizations/{ids['organization']}/join-requests",
        json={"motivation": "Маю великий досвід у волонтерстві"},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "pending"
    assert data["message"] == "Маю великий досвід у волонтерстві"
    assert data["organization_id"] == ids["organization"]
    assert data["user_id"] == ids["volunteer"]

    # 2. Статус заявки для користувача
    status_res = client.get(f"/api/organizations/{ids['organization']}/join-requests/me")
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "pending"

    # 3. Перегляд профілю організації тепер містить статус заявки
    view_res = client.get(f"/api/organizations/{ids['organization']}")
    assert view_res.status_code == 200
    assert view_res.json()["user_request_status"] == "pending"

    # 4. Повторна заявка дає 409
    dup_res = client.post(
        f"/api/organizations/{ids['organization']}/join-requests",
        json={"motivation": "Ще раз хочу приєднатися"},
    )
    assert dup_res.status_code == 409

    # 5. Перевіряємо створення сповіщення для власника
    async def check_notification(session):
        notif = await session.scalar(
            select(Notification).where(
                Notification.user_id == ids["owner"],
                Notification.type == NotificationTypeEnum.join_request_received,
            )
        )
        assert notif is not None
        assert "Благодійний Фонд «Дія»" in notif.message

    db(check_notification)
