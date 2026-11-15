from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app import auth
from app.models import (
    City,
    Organization,
    OrgStatusEnum,
    Project,
    ProjectStatusEnum,
    User,
)
from app.schemas.stats import PlatformStatsRead

STARTS_AT = datetime(2026, 12, 1, 10, 0, tzinfo=UTC)


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

    def make(first_name="Волонтер", last_name="Тестовий", nickname=None) -> int:
        n = next(counter)
        nick = nickname or f"volunteer_{n}"

        async def create(session) -> int:
            user = User(
                google_sub=f"google-user-{n}",
                email=f"user_{n}@example.com",
                first_name=first_name,
                last_name=last_name,
                nickname=nick,
                phone=f"+38067{n:07d}",
                birth_date=date(1990, 1, 1),
                city_id=city_id,
            )
            session.add(user)
            await session.flush()
            return user.id

        return db(create)

    return make


@pytest.fixture
def make_org(db, city_id: int):
    counter = iter(range(1, 1000))

    def make(created_by: int, status: OrgStatusEnum = OrgStatusEnum.approved) -> int:
        n = next(counter)

        async def create(session) -> int:
            org = Organization(
                name=f"Організація {n}",
                email=f"org_{n}@example.com",
                phone=f"+38050{n:07d}",
                city_id=city_id,
                status=status,
                created_by=created_by,
            )
            session.add(org)
            await session.flush()
            return org.id

        return db(create)

    return make


@pytest.fixture
def make_project(db):
    counter = iter(range(1, 1000))

    def make(organization_id: int, status: ProjectStatusEnum = ProjectStatusEnum.published) -> int:
        n = next(counter)

        async def create(session) -> int:
            project = Project(
                organization_id=organization_id,
                title=f"Проєкт {n}",
                description=f"Опис проєкту {n}",
                starts_at=STARTS_AT + timedelta(days=n),
                ends_at=STARTS_AT + timedelta(days=n, hours=3),
                is_online=True,
                capacity=10,
                volunteer_hours=Decimal("2.0"),
                status=status,
            )
            session.add(project)
            await session.flush()
            return project.id

        return db(create)

    return make


# =====================================================================
# Tests: GET /api/stats
# =====================================================================


def test_stats_empty_database_returns_zeros(client: TestClient) -> None:
    """Empty database must return 0 for all counts with HTTP 200."""
    client.cookies.clear()
    response = client.get("/api/stats")

    assert response.status_code == 200
    data = response.json()
    assert data == {
        "volunteers_count": 0,
        "organizations_count": 0,
        "projects_count": 0,
    }
    assert isinstance(data["volunteers_count"], int)
    assert isinstance(data["organizations_count"], int)
    assert isinstance(data["projects_count"], int)


def test_stats_endpoint_is_public_and_unauthenticated(client: TestClient, make_user) -> None:
    """GET /api/stats is accessible without any auth token or session cookies."""
    make_user()

    client.cookies.clear()
    response = client.get("/api/stats")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    data = response.json()
    assert data["volunteers_count"] == 1


def test_stats_volunteers_count_reflects_all_users(client: TestClient, make_user) -> None:
    """All registered users are counted as volunteers."""
    make_user(first_name="Олена", last_name="Коваль")
    make_user(first_name="Іван", last_name="Франко")
    make_user(first_name="Леся", last_name="Українка")

    response = client.get("/api/stats")

    assert response.status_code == 200
    data = response.json()
    assert data["volunteers_count"] == 3


def test_stats_counts_only_approved_organizations(client: TestClient, make_user, make_org) -> None:
    """Only organizations with status == approved are included in organizations_count.

    Pending, rejected, and blocked organizations must be excluded.
    """
    creator_id = make_user()

    # 2 approved organizations
    make_org(created_by=creator_id, status=OrgStatusEnum.approved)
    make_org(created_by=creator_id, status=OrgStatusEnum.approved)

    # 1 pending, 1 rejected, 1 blocked
    make_org(created_by=creator_id, status=OrgStatusEnum.pending)
    make_org(created_by=creator_id, status=OrgStatusEnum.rejected)
    make_org(created_by=creator_id, status=OrgStatusEnum.blocked)

    response = client.get("/api/stats")

    assert response.status_code == 200
    data = response.json()
    assert data["organizations_count"] == 2


def test_stats_zero_approved_organizations_with_other_statuses(
    client: TestClient, make_user, make_org
) -> None:
    """When only pending, rejected, or blocked organizations exist, count is 0."""
    creator_id = make_user()

    make_org(created_by=creator_id, status=OrgStatusEnum.pending)
    make_org(created_by=creator_id, status=OrgStatusEnum.rejected)
    make_org(created_by=creator_id, status=OrgStatusEnum.blocked)

    response = client.get("/api/stats")

    assert response.status_code == 200
    data = response.json()
    assert data["organizations_count"] == 0


def test_stats_counts_only_published_projects(
    client: TestClient, make_user, make_org, make_project
) -> None:
    """Only projects with status == published are included in projects_count.

    Draft, completed, and cancelled projects must be excluded.
    """
    creator_id = make_user()
    org_id = make_org(created_by=creator_id, status=OrgStatusEnum.approved)

    # 2 published projects
    make_project(organization_id=org_id, status=ProjectStatusEnum.published)
    make_project(organization_id=org_id, status=ProjectStatusEnum.published)

    # 1 draft, 1 completed, 1 cancelled
    make_project(organization_id=org_id, status=ProjectStatusEnum.draft)
    make_project(organization_id=org_id, status=ProjectStatusEnum.completed)
    make_project(organization_id=org_id, status=ProjectStatusEnum.cancelled)

    response = client.get("/api/stats")

    assert response.status_code == 200
    data = response.json()
    assert data["projects_count"] == 2


def test_stats_zero_published_projects_with_other_statuses(
    client: TestClient, make_user, make_org, make_project
) -> None:
    """When only draft, completed, or cancelled projects exist, count is 0."""
    creator_id = make_user()
    org_id = make_org(created_by=creator_id, status=OrgStatusEnum.approved)

    make_project(organization_id=org_id, status=ProjectStatusEnum.draft)
    make_project(organization_id=org_id, status=ProjectStatusEnum.completed)
    make_project(organization_id=org_id, status=ProjectStatusEnum.cancelled)

    response = client.get("/api/stats")

    assert response.status_code == 200
    data = response.json()
    assert data["projects_count"] == 0


def test_stats_accurate_counts_full_scenario(
    client: TestClient, make_user, make_org, make_project
) -> None:
    """Comprehensive test validating volunteers, organizations, and projects together."""
    u1 = make_user(first_name="Користувач", last_name="Один")
    u2 = make_user(first_name="Користувач", last_name="Два")
    u3 = make_user(first_name="Користувач", last_name="Три")
    u4 = make_user(first_name="Користувач", last_name="Чотири")

    # Organizations
    org_app1 = make_org(created_by=u1, status=OrgStatusEnum.approved)
    org_app2 = make_org(created_by=u2, status=OrgStatusEnum.approved)
    make_org(created_by=u3, status=OrgStatusEnum.pending)
    make_org(created_by=u4, status=OrgStatusEnum.rejected)
    make_org(created_by=u1, status=OrgStatusEnum.blocked)

    # Projects under approved org 1
    make_project(organization_id=org_app1, status=ProjectStatusEnum.published)
    make_project(organization_id=org_app1, status=ProjectStatusEnum.draft)

    # Projects under approved org 2
    make_project(organization_id=org_app2, status=ProjectStatusEnum.published)
    make_project(organization_id=org_app2, status=ProjectStatusEnum.published)
    make_project(organization_id=org_app2, status=ProjectStatusEnum.completed)
    make_project(organization_id=org_app2, status=ProjectStatusEnum.cancelled)

    client.cookies.clear()
    response = client.get("/api/stats")

    assert response.status_code == 200
    data = response.json()
    assert data == {
        "volunteers_count": 4,
        "organizations_count": 2,
        "projects_count": 3,
    }


def test_stats_schema_validation(client: TestClient) -> None:
    """Response must strictly adhere to PlatformStatsRead without extra fields."""
    response = client.get("/api/stats")

    assert response.status_code == 200
    payload = response.json()

    # Validate against Pydantic schema
    stats = PlatformStatsRead.model_validate(payload)
    assert set(payload.keys()) == {
        "volunteers_count",
        "organizations_count",
        "projects_count",
    }
    assert stats.volunteers_count >= 0
    assert stats.organizations_count >= 0
    assert stats.projects_count >= 0


def test_stats_accessible_with_valid_session_cookie(client: TestClient, make_user) -> None:
    """Valid session cookie does not affect public stats endpoint."""
    user_id = make_user()

    token = auth._encode({"sub": str(user_id), "typ": "session"}, auth.SESSION_TTL)
    client.cookies.set("session", token, path="/api")

    response = client.get("/api/stats")
    assert response.status_code == 200
    assert response.json()["volunteers_count"] == 1


def test_stats_accessible_with_invalid_cookie(client: TestClient) -> None:
    """Invalid session cookie does not block access to public stats endpoint."""
    client.cookies.set("session", "invalid.garbage.token", path="/api")
    response = client.get("/api/stats")
    assert response.status_code == 200


def test_stats_disallows_mutation_methods(client: TestClient) -> None:
    """Endpoint only supports GET; POST, PUT, DELETE return 405."""
    assert client.post("/api/stats").status_code == 405
    assert client.put("/api/stats").status_code == 405
    assert client.delete("/api/stats").status_code == 405
