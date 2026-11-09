from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app import auth
from app.models import (
    City,
    ExperienceLevelEnum,
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
def org_with_members(db, cities: tuple[int, int], make_user):
    c1, _ = cities
    owner_id = make_user(first_name="Олег", last_name="Власник", nickname="owner_1")
    admin_id = make_user(first_name="Анна", last_name="Адмін", nickname="admin_1")
    member_id = make_user(first_name="Марія", last_name="Учасник", nickname="member_1")

    async def create(session) -> tuple[int, int, int, int]:
        org = Organization(
            name="Благодійний фонд Надія",
            email="hope@example.com",
            phone="+380679998877",
            city_id=c1,
            description="Організація допомоги дітям",
            status=OrgStatusEnum.approved,
            created_by=owner_id,
        )
        org.members.append(OrganizationMember(user_id=owner_id, role=OrgMemberRoleEnum.owner))
        org.members.append(OrganizationMember(user_id=admin_id, role=OrgMemberRoleEnum.admin))
        org.members.append(OrganizationMember(user_id=member_id, role=OrgMemberRoleEnum.member))
        session.add(org)
        await session.flush()
        return org.id, owner_id, admin_id, member_id

    return db(create)


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
# Tests: POST /api/projects (Permissions and Creation)
# =====================================================================


def test_create_project_unauthenticated_401(client: TestClient) -> None:
    response = client.post(
        "/api/projects",
        json={"title": "Новий проєкт", "description": "Опис нового проєкту"},
    )
    assert response.status_code == 401
    assert "Not authenticated" in response.json()["detail"]


def test_create_project_volunteer_without_org_403(client: TestClient, make_user) -> None:
    volunteer_id = make_user()
    sign_in(client, volunteer_id)

    response = client.post(
        "/api/projects",
        json={"title": "Проєкт від волонтера", "description": "Опис проєкту"},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "User does not belong to an organization"


def test_create_project_regular_member_cannot_create_403(
    client: TestClient, org_with_members: tuple[int, int, int, int]
) -> None:
    _, _, _, member_id = org_with_members
    sign_in(client, member_id)

    response = client.post(
        "/api/projects",
        json={"title": "Проєкт від мембера", "description": "Опис проєкту"},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Only organization owner or admin can create projects"


def test_create_project_blocked_organization_403(
    client: TestClient, db, org_with_members: tuple[int, int, int, int]
) -> None:
    org_id, owner_id, _, _ = org_with_members

    async def block(session) -> None:
        org = await session.get(Organization, org_id)
        org.status = OrgStatusEnum.blocked

    db(block)
    sign_in(client, owner_id)

    response = client.post(
        "/api/projects",
        json={"title": "Проєкт заблокованої організації", "description": "Опис проєкту"},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Organization is blocked"


def test_create_project_rejected_organization_403(
    client: TestClient, db, org_with_members: tuple[int, int, int, int]
) -> None:
    org_id, owner_id, _, _ = org_with_members

    async def reject(session) -> None:
        org = await session.get(Organization, org_id)
        org.status = OrgStatusEnum.rejected

    db(reject)
    sign_in(client, owner_id)

    response = client.post(
        "/api/projects",
        json={"title": "Проєкт відхиленої організації", "description": "Опис проєкту"},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Organization is rejected"


def test_create_project_authorized_owner_201_minimal_payload(
    client: TestClient, org_with_members: tuple[int, int, int, int]
) -> None:
    org_id, owner_id, _, _ = org_with_members
    sign_in(client, owner_id)

    response = client.post(
        "/api/projects",
        json={
            "title": "Еко-толока 2026",
            "description": "Прибирання території лісопарку",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert isinstance(data["id"], int)
    assert data["organization_id"] == org_id
    assert data["title"] == "Еко-толока 2026"
    assert data["description"] == "Прибирання території лісопарку"
    assert data["status"] == "published"
    assert data["is_online"] is True
    assert data["capacity"] == 10
    assert float(data["volunteer_hours"]) == 1.0
    assert data["starts_at"] is not None
    assert data["ends_at"] is not None
    assert data["created_at"] is not None
    assert data["updated_at"] is not None


def test_create_project_authorized_admin_201_full_payload(
    client: TestClient, cities: tuple[int, int], org_with_members: tuple[int, int, int, int]
) -> None:
    org_id, _, admin_id, _ = org_with_members
    c1, _ = cities
    sign_in(client, admin_id)

    starts = (datetime.now(UTC) + timedelta(days=2)).isoformat()
    ends = (datetime.now(UTC) + timedelta(days=2, hours=4)).isoformat()
    payload = {
        "title": "Майстер-клас для дітей",
        "description": "Навчання програмуванню та робототехніці",
        "starts_at": starts,
        "ends_at": ends,
        "is_online": False,
        "city_id": c1,
        "address": "вул. Франка, 10",
        "capacity": 30,
        "volunteer_hours": "3.5",
        "is_adult_only": False,
        "experience_level": "amateur",
        "tags": ["освіта", "робототехніка"],
    }
    response = client.post("/api/projects", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["organization_id"] == org_id
    assert data["title"] == payload["title"]
    assert data["description"] == payload["description"]
    assert data["is_online"] is False
    assert data["city_id"] == c1
    assert data["address"] == "вул. Франка, 10"
    assert data["capacity"] == 30
    assert float(data["volunteer_hours"]) == 3.5
    assert data["experience_level"] == "amateur"
    assert data["tags"] == ["освіта", "робототехніка"]
    assert data["status"] == "published"


def test_create_project_nonexistent_city_422(
    client: TestClient, org_with_members: tuple[int, int, int, int]
) -> None:
    _, owner_id, _, _ = org_with_members
    sign_in(client, owner_id)

    response = client.post(
        "/api/projects",
        json={
            "title": "Толока в місті",
            "description": "Опис проєкту",
            "city_id": 99999999,
        },
    )
    assert response.status_code == 422
    errs = response.json()["detail"]
    assert any(e["type"] == "city_not_found" and "city_id" in e["loc"] for e in errs)


@pytest.mark.parametrize(
    "payload",
    [
        {"title": "a", "description": "Короткий заголовок"},
        {"title": "   ", "description": "Порожній заголовок"},
        {"title": "Нормальний заголовок", "description": ""},
        {"title": "Нормальний заголовок", "description": "Опис", "capacity": 0},
        {"title": "Нормальний заголовок", "description": "Опис", "capacity": -5},
        {"title": "Нормальний заголовок", "description": "Опис", "volunteer_hours": 0},
        {
            "title": "Нормальний заголовок",
            "description": "Опис",
            "starts_at": "2026-12-01T12:00:00Z",
            "ends_at": "2026-12-01T10:00:00Z",
        },
        {"title": "Нормальний заголовок", "description": "Опис", "extra_bad_field": 123},
    ],
)
def test_create_project_validation_errors(
    client: TestClient, org_with_members: tuple[int, int, int, int], payload: dict
) -> None:
    _, owner_id, _, _ = org_with_members
    sign_in(client, owner_id)

    response = client.post("/api/projects", json=payload)
    assert response.status_code == 422


# =====================================================================
# Tests: GET /api/projects (Catalog Browsing and Filtering)
# =====================================================================


def test_list_projects_returns_only_published(
    client: TestClient, db, org_with_members: tuple[int, int, int, int]
) -> None:
    org_id, _, _, _ = org_with_members

    async def seed(session) -> None:
        p_pub = _project(org_id, title="Опублікований проєкт", status=ProjectStatusEnum.published)
        p_draft = _project(org_id, title="Чернетка", status=ProjectStatusEnum.draft)
        p_comp = _project(org_id, title="Завершений проєкт", status=ProjectStatusEnum.completed)
        p_canc = _project(org_id, title="Скасований проєкт", status=ProjectStatusEnum.cancelled)
        session.add_all([p_pub, p_draft, p_comp, p_canc])

    db(seed)

    response = client.get("/api/projects")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["title"] == "Опублікований проєкт"
    assert data[0]["status"] == "published"


def test_list_projects_pagination(
    client: TestClient, db, org_with_members: tuple[int, int, int, int]
) -> None:
    org_id, _, _, _ = org_with_members

    async def seed(session) -> None:
        for i in range(5):
            session.add(_project(org_id, title=f"Проєкт {i}", status=ProjectStatusEnum.published))

    db(seed)

    res_all = client.get("/api/projects?limit=10").json()
    assert len(res_all) == 5

    res_lim = client.get("/api/projects?limit=2").json()
    assert len(res_lim) == 2
    assert res_lim[0]["id"] == res_all[0]["id"]
    assert res_lim[1]["id"] == res_all[1]["id"]

    res_off = client.get("/api/projects?limit=2&offset=2").json()
    assert len(res_off) == 2
    assert res_off[0]["id"] == res_all[2]["id"]

    res_empty = client.get("/api/projects?limit=2&offset=10").json()
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
def test_list_projects_pagination_validation(
    client: TestClient, limit: int, offset: int, expected_code: int
) -> None:
    response = client.get(f"/api/projects?limit={limit}&offset={offset}")
    assert response.status_code == expected_code


def test_list_projects_search_filter(
    client: TestClient, db, org_with_members: tuple[int, int, int, int]
) -> None:
    org_id, _, _, _ = org_with_members

    async def seed(session) -> None:
        p1 = _project(
            org_id,
            title="Екологічна толока в парку",
            description="Збір пластику та сміття",
            status=ProjectStatusEnum.published,
        )
        p2 = _project(
            org_id,
            title="Допомога сиротинцям",
            description="Збір теплих речей для дітей",
            status=ProjectStatusEnum.published,
        )
        p3 = _project(
            org_id,
            title="Кулінарний воркшоп",
            description="Готуємо обіди для літніх людей",
            status=ProjectStatusEnum.published,
        )
        p4 = _project(
            org_id,
            title="Чернетка толока",
            description="Неактивний проєкт",
            status=ProjectStatusEnum.draft,
        )
        session.add_all([p1, p2, p3, p4])

    db(seed)

    # 1. Пошук у заголовку
    res1 = client.get("/api/projects?search=толока").json()
    assert len(res1) == 1
    assert res1[0]["title"] == "Екологічна толока в парку"

    # 2. Нечутливість до регістру
    res2 = client.get("/api/projects?search=ТОЛОКА").json()
    assert len(res2) == 1
    assert res2[0]["title"] == "Екологічна толока в парку"

    # 3. Пошук в описі (пластику)
    res3 = client.get("/api/projects?search=пластику").json()
    assert len(res3) == 1
    assert res3[0]["title"] == "Екологічна толока в парку"

    # 4. Пошук в описі (дітей)
    res4 = client.get("/api/projects?search=дітей").json()
    assert len(res4) == 1
    assert res4[0]["title"] == "Допомога сиротинцям"

    # 5. Пошук без збігів
    res5 = client.get("/api/projects?search=неіснуюче").json()
    assert res5 == []


def test_list_projects_search_escapes_special_characters(
    client: TestClient, db, org_with_members: tuple[int, int, int, int]
) -> None:
    org_id, _, _, _ = org_with_members

    async def seed(session) -> None:
        p1 = _project(
            org_id,
            title="Проєкт 100% готовності",
            description="Успішний результат",
            status=ProjectStatusEnum.published,
        )
        p2 = _project(
            org_id,
            title="Проєкт 1000 завдань",
            description="Багато роботи",
            status=ProjectStatusEnum.published,
        )
        session.add_all([p1, p2])

    db(seed)

    res = client.get("/api/projects?search=100%").json()
    assert len(res) == 1
    assert res[0]["title"] == "Проєкт 100% готовності"


def test_list_projects_filter_by_city(
    client: TestClient, db, cities: tuple[int, int], org_with_members: tuple[int, int, int, int]
) -> None:
    c1, c2 = cities
    org_id, _, _, _ = org_with_members

    async def seed(session) -> None:
        p1 = _project(
            org_id,
            title="Проєкт у Львові",
            city_id=c1,
            address="вул. Шевченка, 1",
            is_online=False,
            status=ProjectStatusEnum.published,
        )
        p2 = _project(
            org_id,
            title="Проєкт у Києві",
            city_id=c2,
            address="вул. Хрещатик, 1",
            is_online=False,
            status=ProjectStatusEnum.published,
        )
        p3 = _project(
            org_id,
            title="Онлайн проєкт",
            city_id=None,
            address=None,
            is_online=True,
            status=ProjectStatusEnum.published,
        )
        session.add_all([p1, p2, p3])

    db(seed)

    res_c1 = client.get(f"/api/projects?city_id={c1}").json()
    assert len(res_c1) == 1
    assert res_c1[0]["title"] == "Проєкт у Львові"

    res_c2 = client.get(f"/api/projects?city_id={c2}").json()
    assert len(res_c2) == 1
    assert res_c2[0]["title"] == "Проєкт у Києві"

    res_empty = client.get("/api/projects?city_id=999999").json()
    assert res_empty == []


def test_list_projects_invalid_city_id(client: TestClient) -> None:
    assert client.get("/api/projects?city_id=0").status_code == 422
    assert client.get("/api/projects?city_id=-1").status_code == 422


# =====================================================================
# Tests: GET /api/projects/{id} (Project Details)
# =====================================================================


def test_get_project_details_200_published(
    client: TestClient, db, cities: tuple[int, int], org_with_members: tuple[int, int, int, int]
) -> None:
    c1, _ = cities
    org_id, _, _, _ = org_with_members

    async def seed(session) -> int:
        p = _project(
            org_id,
            title="Детальний опублікований проєкт",
            description="Повний опис для перевірки деталей",
            city_id=c1,
            address="вул. Свободи, 1",
            is_online=False,
            capacity=50,
            volunteer_hours=Decimal("5.0"),
            is_adult_only=True,
            experience_level=ExperienceLevelEnum.pro,
            tags=["допомога", "ветерани"],
            status=ProjectStatusEnum.published,
        )
        session.add(p)
        await session.flush()
        return p.id

    proj_id = db(seed)

    response = client.get(f"/api/projects/{proj_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == proj_id
    assert data["organization_id"] == org_id
    assert data["title"] == "Детальний опублікований проєкт"
    assert data["description"] == "Повний опис для перевірки деталей"
    assert data["status"] == "published"
    assert data["city_id"] == c1
    assert data["address"] == "вул. Свободи, 1"
    assert data["is_online"] is False
    assert data["capacity"] == 50
    assert float(data["volunteer_hours"]) == 5.0
    assert data["is_adult_only"] is True
    assert data["experience_level"] == "pro"
    assert data["tags"] == ["допомога", "ветерани"]
    assert data["created_at"] is not None
    assert data["updated_at"] is not None


def test_get_project_details_404_for_draft(
    client: TestClient, db, org_with_members: tuple[int, int, int, int]
) -> None:
    org_id, _, _, _ = org_with_members

    async def seed(session) -> int:
        p = _project(org_id, status=ProjectStatusEnum.draft)
        session.add(p)
        await session.flush()
        return p.id

    draft_id = db(seed)
    response = client.get(f"/api/projects/{draft_id}")
    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"


def test_get_project_details_404_for_completed(
    client: TestClient, db, org_with_members: tuple[int, int, int, int]
) -> None:
    org_id, _, _, _ = org_with_members

    async def seed(session) -> int:
        p = _project(org_id, status=ProjectStatusEnum.completed)
        session.add(p)
        await session.flush()
        return p.id

    completed_id = db(seed)
    response = client.get(f"/api/projects/{completed_id}")
    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"


def test_get_project_details_404_for_cancelled(
    client: TestClient, db, org_with_members: tuple[int, int, int, int]
) -> None:
    org_id, _, _, _ = org_with_members

    async def seed(session) -> int:
        p = _project(org_id, status=ProjectStatusEnum.cancelled)
        session.add(p)
        await session.flush()
        return p.id

    cancelled_id = db(seed)
    response = client.get(f"/api/projects/{cancelled_id}")
    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"


def test_get_project_details_404_for_nonexistent(client: TestClient) -> None:
    response = client.get("/api/projects/99999999")
    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"
