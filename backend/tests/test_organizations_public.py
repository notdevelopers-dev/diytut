from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.models import (
    City,
    Organization,
    OrganizationMember,
    OrgMemberRoleEnum,
    OrgStatusEnum,
    Project,
    ProjectStatusEnum,
    User,
)

STARTS_AT = datetime(2026, 12, 1, 10, 0, tzinfo=UTC)


@pytest.fixture
def cities(db) -> tuple[int, int]:
    async def create(session) -> tuple[int, int]:
        c1 = City(name="Львів", region="Львівська")
        c2 = City(name="Київ", region="Київська")
        session.add_all([c1, c2])
        await session.flush()
        return c1.id, c2.id

    return db(create)


@pytest.fixture
def make_user(db, cities: tuple[int, int]):
    counter = iter(range(1, 1000))

    def make(first_name="Тарас", last_name="Шевченко", nickname=None) -> int:
        n = next(counter)
        nick = nickname or f"user_{n}"

        async def create(session) -> int:
            user = User(
                google_sub=f"google-{n}",
                email=f"user{n}@example.com",
                first_name=first_name,
                last_name=last_name,
                nickname=nick,
                phone="+380671234567",
                birth_date=date(1990, 3, 9),
                city_id=cities[0],
            )
            session.add(user)
            await session.flush()
            return user.id

        return db(create)

    return make


@pytest.fixture
def make_org(db, cities: tuple[int, int], make_user):
    counter = iter(range(1, 1000))

    def make(status=OrgStatusEnum.approved, city_id=None, name=None) -> int:
        n = next(counter)
        user_id = make_user()
        c_id = city_id or cities[0]
        org_name = name or f"Організація {n}"

        async def create(session) -> int:
            org = Organization(
                name=org_name,
                email=f"org{n}@example.com",
                phone="+380671112233",
                city_id=c_id,
                description=f"Опис організації {n}",
                status=status,
                created_by=user_id,
            )
            org.members.append(OrganizationMember(user_id=user_id, role=OrgMemberRoleEnum.owner))
            session.add(org)
            await session.flush()
            return org.id

        return db(create)

    return make


def _project(organization_id: int, **changes) -> Project:
    fields = {
        "organization_id": organization_id,
        "title": "Прибирання парку",
        "description": "Збираємо сміття в парку",
        "starts_at": STARTS_AT,
        "ends_at": STARTS_AT + timedelta(hours=3),
        "is_online": True,
        "capacity": 10,
        "volunteer_hours": Decimal("2.5"),
        "status": ProjectStatusEnum.published,
    } | changes
    return Project(**fields)


# =====================================================================
# Tests: GET /api/organizations (List)
# =====================================================================


def test_list_organizations_excludes_pending_and_other_unapproved(
    client: TestClient, make_org
) -> None:
    org_approved = make_org(status=OrgStatusEnum.approved, name="Одобрена")
    make_org(status=OrgStatusEnum.pending, name="В очікуванні")
    make_org(status=OrgStatusEnum.rejected, name="Відхилена")
    make_org(status=OrgStatusEnum.blocked, name="Заблокована")

    response = client.get("/api/organizations")
    assert response.status_code == 200
    data = response.json()
    org_ids = [item["id"] for item in data]

    assert org_approved in org_ids
    assert len(data) == 1
    assert data[0]["name"] == "Одобрена"
    assert data[0]["status"] == "approved"
    assert "email" in data[0]
    assert "phone" in data[0]
    assert "city_id" in data[0]


def test_list_organizations_pagination(client: TestClient, make_org) -> None:
    for i in range(5):
        make_org(status=OrgStatusEnum.approved, name=f"Організація {i}")

    res_all = client.get("/api/organizations?limit=10").json()
    assert len(res_all) == 5

    res_limit = client.get("/api/organizations?limit=2").json()
    assert len(res_limit) == 2
    assert res_limit[0]["id"] == res_all[0]["id"]
    assert res_limit[1]["id"] == res_all[1]["id"]

    res_offset = client.get("/api/organizations?limit=2&offset=2").json()
    assert len(res_offset) == 2
    assert res_offset[0]["id"] == res_all[2]["id"]

    res_empty = client.get("/api/organizations?limit=2&offset=10").json()
    assert res_empty == []


@pytest.mark.parametrize(
    ("limit", "offset", "expected_code"),
    [
        (0, 0, 422),
        (101, 0, 422),
        (-1, 0, 422),
        (10, -1, 422),
    ],
)
def test_list_organizations_pagination_validation(
    client: TestClient, limit: int, offset: int, expected_code: int
) -> None:
    response = client.get(f"/api/organizations?limit={limit}&offset={offset}")
    assert response.status_code == expected_code


def test_list_organizations_filter_by_city(
    client: TestClient, make_org, cities: tuple[int, int]
) -> None:
    c1, c2 = cities
    org1 = make_org(status=OrgStatusEnum.approved, city_id=c1)
    org2 = make_org(status=OrgStatusEnum.approved, city_id=c2)

    res_c1 = client.get(f"/api/organizations?city_id={c1}").json()
    assert [o["id"] for o in res_c1] == [org1]

    res_c2 = client.get(f"/api/organizations?city_id={c2}").json()
    assert [o["id"] for o in res_c2] == [org2]

    res_empty = client.get("/api/organizations?city_id=999999").json()
    assert res_empty == []


def test_list_organizations_invalid_city_id(client: TestClient) -> None:
    response = client.get("/api/organizations?city_id=0")
    assert response.status_code == 422
    response_neg = client.get("/api/organizations?city_id=-1")
    assert response_neg.status_code == 422


# =====================================================================
# Tests: GET /api/organizations/{id} (Details)
# =====================================================================


def test_get_organization_details_200_with_projects(
    client: TestClient, db, make_user, cities: tuple[int, int]
) -> None:
    owner_id = make_user(first_name="Іван", last_name="Франко", nickname="franko")

    async def setup(session) -> int:
        org = Organization(
            name="Благодійний фонд",
            email="fond@example.com",
            phone="+380671234567",
            city_id=cities[0],
            description="Опис фонду",
            edrpou="14360570",
            status=OrgStatusEnum.approved,
            created_by=owner_id,
        )
        org.members.append(OrganizationMember(user_id=owner_id, role=OrgMemberRoleEnum.owner))

        p_published = _project(
            organization_id=0,
            title="Активний проєкт",
            description="Опис активного",
            status=ProjectStatusEnum.published,
        )
        p_draft = _project(
            organization_id=0,
            title="Чернетка проєкту",
            description="Опис чернетки",
            status=ProjectStatusEnum.draft,
        )
        p_completed = _project(
            organization_id=0,
            title="Завершений проєкт",
            description="Опис завершеного",
            status=ProjectStatusEnum.completed,
        )
        p_cancelled = _project(
            organization_id=0,
            title="Скасований проєкт",
            description="Опис скасованого",
            status=ProjectStatusEnum.cancelled,
        )
        org.projects.extend([p_published, p_draft, p_completed, p_cancelled])
        session.add(org)
        await session.flush()
        return org.id

    org_id = db(setup)

    response = client.get(f"/api/organizations/{org_id}")
    assert response.status_code == 200
    data = response.json()

    assert data["id"] == org_id
    assert data["name"] == "Благодійний фонд"
    assert data["status"] == "approved"
    assert data["edrpou"] == "14360570"

    # Публічна сторінка не розкриває персональних даних учасників (NF-04)
    assert "members" not in data
    assert "Франко" not in response.text

    # Перевірка проєктів: лише published
    projects = data["projects"]
    assert len(projects) == 1
    assert projects[0]["title"] == "Активний проєкт"
    assert projects[0]["status"] == "published"


def test_get_organization_details_projects_isolated_by_organization(
    client: TestClient, db, make_user, cities: tuple[int, int]
) -> None:
    u1 = make_user()
    u2 = make_user()

    async def setup(session) -> tuple[int, int]:
        org1 = Organization(
            name="Організація 1",
            email="org1@example.com",
            phone="+380671111111",
            city_id=cities[0],
            status=OrgStatusEnum.approved,
            created_by=u1,
        )
        org1.members.append(OrganizationMember(user_id=u1, role=OrgMemberRoleEnum.owner))
        p1 = _project(organization_id=0, title="Проєкт 1", status=ProjectStatusEnum.published)
        org1.projects.append(p1)

        org2 = Organization(
            name="Організація 2",
            email="org2@example.com",
            phone="+380672222222",
            city_id=cities[0],
            status=OrgStatusEnum.approved,
            created_by=u2,
        )
        org2.members.append(OrganizationMember(user_id=u2, role=OrgMemberRoleEnum.owner))
        p2 = _project(organization_id=0, title="Проєкт 2", status=ProjectStatusEnum.published)
        org2.projects.append(p2)

        session.add_all([org1, org2])
        await session.flush()
        return org1.id, org2.id

    org1_id, org2_id = db(setup)

    res1 = client.get(f"/api/organizations/{org1_id}")
    assert res1.status_code == 200
    assert len(res1.json()["projects"]) == 1
    assert res1.json()["projects"][0]["title"] == "Проєкт 1"

    res2 = client.get(f"/api/organizations/{org2_id}")
    assert res2.status_code == 200
    assert len(res2.json()["projects"]) == 1
    assert res2.json()["projects"][0]["title"] == "Проєкт 2"


def test_get_organization_details_404_for_nonexistent(client: TestClient) -> None:
    response = client.get("/api/organizations/99999999")
    assert response.status_code == 404
    assert response.json()["detail"] == "Organization not found"


@pytest.mark.parametrize(
    "status", [OrgStatusEnum.pending, OrgStatusEnum.rejected, OrgStatusEnum.blocked]
)
def test_get_organization_details_404_for_unapproved(
    client: TestClient, make_org, status: OrgStatusEnum
) -> None:
    org_id = make_org(status=status)
    response = client.get(f"/api/organizations/{org_id}")
    assert response.status_code == 404
    assert response.json()["detail"] == "Organization not found"
