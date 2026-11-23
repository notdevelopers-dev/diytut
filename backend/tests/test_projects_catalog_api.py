"""Каталог проєктів: нові фільтри, total, підказки хештегів (R-14) і видимість точних часу
й місця події (R-22)."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app import auth
from app.models import (
    City,
    ExperienceLevelEnum,
    JoinRequest,
    JoinRequestStatusEnum,
    JoinRequestTargetEnum,
    Organization,
    OrganizationMember,
    OrgMemberRoleEnum,
    OrgStatusEnum,
    Project,
    ProjectStatusEnum,
    User,
)

# 22:30 за UTC — це вже 00:30 наступного дня за Києвом (UTC+2 узимку)
STARTS_AT = datetime(2030, 3, 1, 22, 30, tzinfo=UTC)
ENDS_AT = STARTS_AT + timedelta(hours=3)
ADDRESS = "вул. Свободи, 1"


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

    def make() -> int:
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
            )
            session.add(user)
            await session.flush()
            return user.id

        return db(create)

    return make


@pytest.fixture
def make_org(db, city_id: int):
    def make(members: dict[int, OrgMemberRoleEnum]) -> int:
        async def create(session) -> int:
            org = Organization(
                name="Благодійний фонд",
                email="fund@example.com",
                phone="+380679998877",
                city_id=city_id,
                status=OrgStatusEnum.approved,
                created_by=next(iter(members)),
            )
            for user_id, role in members.items():
                org.members.append(OrganizationMember(user_id=user_id, role=role))
            session.add(org)
            await session.flush()
            return org.id

        return db(create)

    return make


@pytest.fixture
def org(make_user, make_org) -> dict[str, int]:
    """Схвалена організація з власником і звичайним учасником та сторонній користувач."""
    ids = {"owner": make_user(), "member": make_user(), "outsider": make_user()}
    ids["org"] = make_org(
        {ids["owner"]: OrgMemberRoleEnum.owner, ids["member"]: OrgMemberRoleEnum.member}
    )
    return ids


@pytest.fixture
def make_project(db, city_id: int):
    """Опублікований офлайн-проєкт; поля можна змінити."""

    def make(organization_id: int, **changes) -> int:
        fields = {
            "title": "Прибирання парку",
            "description": "Опис",
            "status": ProjectStatusEnum.published,
            "starts_at": STARTS_AT,
            "ends_at": ENDS_AT,
            "is_online": False,
            "city_id": city_id,
            "address": ADDRESS,
            "capacity": 10,
            "volunteer_hours": Decimal("2"),
            "categories": ["ecology"],
            "published_at": datetime.now(UTC) - timedelta(days=1),
        } | changes

        async def create(session) -> int:
            project = Project(organization_id=organization_id, **fields)
            session.add(project)
            await session.flush()
            return project.id

        return db(create)

    return make


@pytest.fixture
def make_request(db):
    def make(user_id: int, organization_id: int, project_id: int, status) -> int:
        async def create(session) -> int:
            request = JoinRequest(
                user_id=user_id,
                organization_id=organization_id,
                project_id=project_id,
                target=JoinRequestTargetEnum.project,
                status=status,
            )
            session.add(request)
            await session.flush()
            return request.id

        return db(create)

    return make


def catalog(client: TestClient, query: str = "") -> dict:
    response = client.get(f"/api/projects?{query}")
    assert response.status_code == 200, response.text
    return response.json()


def catalog_titles(client: TestClient, query: str = "") -> set[str]:
    return {project["title"] for project in catalog(client, query)["items"]}


def by_id(items: list[dict], project_id: int) -> dict:
    return next(item for item in items if item["id"] == project_id)


def assert_hidden(item: dict) -> None:
    assert item["details_hidden"] is True
    assert item["address"] is None
    assert item["starts_at"] is None
    assert item["ends_at"] is None
    # Дні події за київським часом бачать усі
    assert item["starts_on"] == "2030-03-02"
    assert item["ends_on"] == "2030-03-02"


def assert_visible(item: dict) -> None:
    assert item["details_hidden"] is False
    assert item["address"] == ADDRESS
    assert datetime.fromisoformat(item["starts_at"]) == STARTS_AT
    assert datetime.fromisoformat(item["ends_at"]) == ENDS_AT
    assert item["starts_on"] == "2030-03-02"


# =====================================================================
# R-22: точні час і місце
# =====================================================================


def test_guest_sees_only_days_and_city(client: TestClient, org, make_project, city_id) -> None:
    project_id = make_project(org["org"])

    item = catalog(client)["items"][0]
    assert_hidden(item)
    assert item["city_id"] == city_id
    assert item["is_online"] is False

    assert_hidden(client.get(f"/api/projects/{project_id}").json())
    assert_hidden(client.get(f"/api/organizations/{org['org']}").json()["projects"][0])


@pytest.mark.parametrize(
    "request_status",
    [
        None,
        JoinRequestStatusEnum.pending,
        JoinRequestStatusEnum.rejected,
        JoinRequestStatusEnum.cancelled,
    ],
)
def test_third_party_does_not_see_address(
    client: TestClient, org, make_project, make_request, request_status
) -> None:
    project_id = make_project(org["org"])
    if request_status is not None:
        make_request(org["outsider"], org["org"], project_id, request_status)
    sign_in(client, org["outsider"])

    assert_hidden(by_id(catalog(client)["items"], project_id))
    assert_hidden(client.get(f"/api/projects/{project_id}").json())
    assert_hidden(client.get(f"/api/organizations/{org['org']}").json()["projects"][0])


def test_accepted_participant_sees_details(
    client: TestClient, org, make_project, make_request
) -> None:
    project_id = make_project(org["org"])
    other_id = make_project(org["org"], title="Інший проєкт")
    make_request(org["outsider"], org["org"], project_id, JoinRequestStatusEnum.accepted)
    sign_in(client, org["outsider"])

    items = catalog(client)["items"]
    assert_visible(by_id(items, project_id))
    # Схвалена заявка відкриває лише свій проєкт
    assert_hidden(by_id(items, other_id))
    assert_visible(client.get(f"/api/projects/{project_id}").json())
    assert_hidden(client.get(f"/api/projects/{other_id}").json())
    projects = client.get(f"/api/organizations/{org['org']}").json()["projects"]
    assert_visible(by_id(projects, project_id))
    assert_hidden(by_id(projects, other_id))


@pytest.mark.parametrize("role", ["owner", "member"])
def test_organization_members_see_details(
    client: TestClient, org, make_user, make_org, make_project, role
) -> None:
    project_id = make_project(org["org"])
    foreign_org = make_org({make_user(): OrgMemberRoleEnum.owner})
    foreign_id = make_project(foreign_org, title="Чужий проєкт")
    sign_in(client, org[role])

    items = catalog(client)["items"]
    assert_visible(by_id(items, project_id))
    assert_hidden(by_id(items, foreign_id))
    assert_visible(client.get(f"/api/projects/{project_id}").json())
    assert_visible(client.get(f"/api/organizations/{org['org']}").json()["projects"][0])
    assert_visible(client.get("/api/organizations/me/projects").json()["items"][0])


def test_my_project_requests_show_time_only_after_acceptance(
    client: TestClient, org, make_project, make_request
) -> None:
    pending_id = make_project(org["org"], title="Чекаю")
    accepted_id = make_project(org["org"], title="Прийняли")
    make_request(org["outsider"], org["org"], pending_id, JoinRequestStatusEnum.pending)
    make_request(org["outsider"], org["org"], accepted_id, JoinRequestStatusEnum.accepted)
    sign_in(client, org["outsider"])

    response = client.get("/api/users/me/project-requests")

    assert response.status_code == 200
    projects = {item["project"]["id"]: item["project"] for item in response.json()}
    pending, accepted = projects[pending_id], projects[accepted_id]
    assert pending["details_hidden"] is True
    assert pending["starts_at"] is None
    assert pending["starts_on"] == "2030-03-02"
    assert accepted["details_hidden"] is False
    assert datetime.fromisoformat(accepted["starts_at"]) == STARTS_AT


def test_online_project_without_address_is_still_hidden(
    client: TestClient, org, make_project
) -> None:
    make_project(org["org"], is_online=True, city_id=None, address=None)

    item = catalog(client)["items"][0]

    # details_hidden відрізняє приховані дані від незаповнених
    assert item["details_hidden"] is True
    assert item["is_online"] is True
    assert item["starts_at"] is None


# =====================================================================
# Фільтри за датою й часом
# =====================================================================


@pytest.fixture
def dated_projects(org, make_project) -> None:
    day = datetime(2030, 12, 1, tzinfo=UTC)
    make_project(
        org["org"],
        title="1 грудня",
        starts_at=day + timedelta(hours=10),
        ends_at=day + timedelta(hours=12),
    )
    make_project(
        org["org"],
        title="1–10 грудня",
        starts_at=day + timedelta(hours=9),
        ends_at=day + timedelta(days=9, hours=18),
    )
    make_project(
        org["org"],
        title="5 грудня",
        starts_at=day + timedelta(days=4, hours=10),
        ends_at=day + timedelta(days=4, hours=12),
    )


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("date_from=2030-12-03T00:00:00Z", {"1–10 грудня", "5 грудня"}),
        ("date_to=2030-12-02T00:00:00Z", {"1 грудня", "1–10 грудня"}),
        (
            "date_from=2030-12-04T00:00:00Z&date_to=2030-12-06T00:00:00Z",
            {"1–10 грудня", "5 грудня"},
        ),
        # Проміжок із часом: 1 грудня з 12:30 подія 10:00–12:00 уже завершилась
        (
            "date_from=2030-12-01T12:30:00Z&date_to=2030-12-01T23:59:59Z",
            {"1–10 грудня"},
        ),
        ("date_from=2030-12-11T00:00:00Z", set()),
        # Межі включні: подія, що починається рівно в date_to, підходить
        (
            "date_from=2030-12-05T10:00:00Z&date_to=2030-12-05T10:00:00Z",
            {"1–10 грудня", "5 грудня"},
        ),
    ],
)
def test_filter_by_date_range(client: TestClient, dated_projects, query, expected) -> None:
    assert catalog_titles(client, query) == expected


def test_filter_by_date_respects_time_zone(client: TestClient, dated_projects) -> None:
    # 1 грудня 14:00 за Києвом — це 12:00 UTC, коли подія 10:00–12:00 UTC уже скінчилась
    assert catalog_titles(
        client, "date_from=2030-12-01T14:00:00%2B02:00&date_to=2030-12-01T23:00:00Z"
    ) == {"1–10 грудня"}
    # Без поясу — UTC
    assert catalog_titles(client, "date_from=2030-12-01T11:00:00&date_to=2030-12-01T11:30:00") == {
        "1 грудня",
        "1–10 грудня",
    }


@pytest.mark.parametrize(
    "query",
    [
        "date_from=2030-12-02T00:00:00Z&date_to=2030-12-01T00:00:00Z",
        "date_from=завтра",
        "date_to=2030-13-01T00:00:00Z",
    ],
)
def test_invalid_date_filter_is_422(client: TestClient, query: str) -> None:
    response = client.get(f"/api/projects?{query}")

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"][0] == "query"


# =====================================================================
# Вік і рівень досвіду
# =====================================================================


def test_filter_by_adult_only(client: TestClient, org, make_project) -> None:
    make_project(org["org"], title="18+", is_adult_only=True)
    make_project(org["org"], title="Для всіх", is_adult_only=False)

    assert catalog_titles(client, "is_adult_only=true") == {"18+"}
    assert catalog_titles(client, "is_adult_only=false") == {"Для всіх"}
    assert catalog_titles(client) == {"18+", "Для всіх"}
    assert client.get("/api/projects?is_adult_only=інколи").status_code == 422


@pytest.mark.parametrize(
    ("level", "expected"),
    [
        ("novice", {"Новачок"}),
        ("amateur", {"Новачок", "Аматор"}),
        ("experienced", {"Новачок", "Аматор"}),
        ("pro", {"Новачок", "Аматор", "Профі"}),
    ],
)
def test_filter_by_experience_level(client: TestClient, org, make_project, level, expected) -> None:
    make_project(org["org"], title="Новачок", experience_level=ExperienceLevelEnum.novice)
    make_project(org["org"], title="Аматор", experience_level=ExperienceLevelEnum.amateur)
    make_project(org["org"], title="Профі", experience_level=ExperienceLevelEnum.pro)

    # Проєкти, на які волонтер цього рівня може подати заявку
    assert catalog_titles(client, f"experience_level={level}") == expected


def test_unknown_experience_level_is_422(client: TestClient) -> None:
    assert client.get("/api/projects?experience_level=guru").status_code == 422


def test_filters_combine_and_total_counts_filtered(client: TestClient, org, make_project) -> None:
    for i in range(3):
        make_project(org["org"], title=f"18+ {i}", is_adult_only=True, tags=["толока"])
    make_project(org["org"], title="18+ без хештегу", is_adult_only=True)
    make_project(org["org"], title="Для всіх", tags=["толока"])
    make_project(
        org["org"],
        title="Чернетка",
        is_adult_only=True,
        tags=["толока"],
        status=ProjectStatusEnum.draft,
        published_at=None,
    )

    page = catalog(client, "is_adult_only=true&tags=толока&limit=2")

    assert page["total"] == 3
    assert len(page["items"]) == 2
    assert catalog(client, "is_adult_only=true&tags=толока&offset=10")["total"] == 3
    assert catalog(client)["total"] == 5


# =====================================================================
# GET /api/projects/tags
# =====================================================================


def suggestions(client: TestClient, query: str = "") -> list[tuple[str, int]]:
    response = client.get(f"/api/projects/tags?{query}")
    assert response.status_code == 200, response.text
    return [(item["tag"], item["projects_count"]) for item in response.json()]


@pytest.fixture
def tagged_projects(org, make_project) -> None:
    now = datetime.now(UTC)
    make_project(org["org"], tags=["толока", "толерантність"])
    make_project(org["org"], tags=["толока", "тварини"])
    make_project(org["org"], tags=["толока"])
    make_project(org["org"], tags=["тварини"])
    # Хештеги чернетки й завершеного проєкту не підказуються
    make_project(org["org"], tags=["толковий"], status=ProjectStatusEnum.draft, published_at=None)
    make_project(
        org["org"],
        tags=["толстой"],
        starts_at=now - timedelta(days=2),
        ends_at=now - timedelta(days=1),
    )


def test_tag_suggestions_by_prefix_popular_first(client: TestClient, tagged_projects) -> None:
    assert suggestions(client, "q=тол") == [("толока", 3), ("толерантність", 1)]
    assert suggestions(client, "q=тв") == [("тварини", 2)]
    assert suggestions(client, "q=неіснуючий") == []


def test_tag_suggestions_normalize_prefix(client: TestClient, tagged_projects) -> None:
    # «#», регістр і пробіли нормалізуються так само, як під час збереження хештегу
    assert suggestions(client, "q=%23ТОЛО") == [("толока", 3)]
    assert suggestions(client, "q=%20%23тол") == [("толока", 3), ("толерантність", 1)]


def test_tag_suggestions_without_prefix_and_limit(client: TestClient, tagged_projects) -> None:
    # Однакова популярність — за абеткою
    assert suggestions(client) == [("толока", 3), ("тварини", 2), ("толерантність", 1)]
    assert suggestions(client, "limit=1") == [("толока", 3)]


def test_tag_suggestions_escape_like_wildcards(client: TestClient, org, make_project) -> None:
    make_project(org["org"], tags=["eco_day", "ecoday", "eco-day"])

    assert suggestions(client, "q=eco_") == [("eco_day", 1)]
    assert suggestions(client, "q=%25") == []


@pytest.mark.parametrize("query", ["limit=0", "limit=21", f"q={'т' * 101}"])
def test_tag_suggestions_validation(client: TestClient, query: str) -> None:
    assert client.get(f"/api/projects/tags?{query}").status_code == 422
