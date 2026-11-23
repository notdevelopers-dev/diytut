"""Чернетки проєктів, публікація та проєкти організації в кабінеті (R-12)."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app import auth
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

STARTS_AT = datetime.now(UTC).replace(microsecond=0) + timedelta(days=30)

# Поля, без яких проєкт не опублікувати: у чернетці вони можуть бути порожніми
COMPLETE_FIELDS = {
    "description": "Прибирання території лісопарку",
    "starts_at": STARTS_AT.isoformat(),
    "ends_at": (STARTS_AT + timedelta(hours=3)).isoformat(),
    "is_online": True,
    "capacity": 10,
    "volunteer_hours": "2.5",
    "categories": ["ecology"],
}


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
    def make(
        members: dict[int, OrgMemberRoleEnum], status: OrgStatusEnum = OrgStatusEnum.approved
    ) -> int:
        async def create(session) -> int:
            org = Organization(
                name="Благодійний фонд",
                email="fund@example.com",
                phone="+380679998877",
                city_id=city_id,
                status=status,
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
    """Схвалена організація з власником, адміном і звичайним учасником та сторонній користувач."""
    ids = {
        "owner": make_user(),
        "admin": make_user(),
        "member": make_user(),
        "outsider": make_user(),
    }
    ids["org"] = make_org(
        {
            ids["owner"]: OrgMemberRoleEnum.owner,
            ids["admin"]: OrgMemberRoleEnum.admin,
            ids["member"]: OrgMemberRoleEnum.member,
        }
    )
    return ids


@pytest.fixture
def make_project(db):
    def make(organization_id: int, **changes) -> int:
        fields = {"title": "Прибирання парку", "status": ProjectStatusEnum.draft, "categories": []}
        if changes.get("status", ProjectStatusEnum.draft) != ProjectStatusEnum.draft:
            fields |= {
                "description": "Опис",
                "starts_at": STARTS_AT,
                "ends_at": STARTS_AT + timedelta(hours=3),
                "is_online": True,
                "capacity": 10,
                "volunteer_hours": Decimal("2"),
                "categories": ["ecology"],
                "published_at": datetime.now(UTC) - timedelta(days=1),
            }
        fields |= changes

        async def create(session) -> int:
            project = Project(organization_id=organization_id, **fields)
            session.add(project)
            await session.flush()
            return project.id

        return db(create)

    return make


def set_org_status(db, organization_id: int, status: OrgStatusEnum) -> None:
    async def update(session) -> None:
        organization = await session.get(Organization, organization_id)
        organization.status = status

    db(update)


def load_project(db, project_id: int) -> Project:
    async def load(session) -> Project:
        return await session.get(Project, project_id, populate_existing=True)

    return db(load)


# =====================================================================
# POST /api/projects зі status=draft
# =====================================================================


def test_draft_with_title_only_is_saved(client: TestClient, org) -> None:
    sign_in(client, org["owner"])

    response = client.post("/api/projects", json={"title": "Толока навесні", "status": "draft"})

    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "draft"
    assert data["title"] == "Толока навесні"
    assert data["organization_id"] == org["org"]
    for field in ("description", "starts_at", "ends_at", "capacity", "volunteer_hours"):
        assert data[field] is None
    assert data["categories"] == []
    assert data["published_at"] is None


def test_draft_keeps_partially_filled_fields(client: TestClient, org, city_id: int) -> None:
    # Офлайн-подія без адреси в чернетці — не помилка: адресу допишуть пізніше
    sign_in(client, org["admin"])

    response = client.post(
        "/api/projects",
        json={
            "title": "Толока",
            "status": "draft",
            "is_online": False,
            "city_id": city_id,
            "starts_at": STARTS_AT.isoformat(),
            "tags": ["#Толока"],
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["city_id"] == city_id
    assert data["address"] is None
    assert data["starts_at"] is not None
    assert data["ends_at"] is None
    assert data["tags"] == ["толока"]


@pytest.mark.parametrize(
    "changes",
    [
        # Назва обов'язкова й у чернетці
        {"title": None},
        {"title": " "},
        # Заповнені поля мають бути коректними, навіть якщо інших ще немає
        {"capacity": 0},
        {"volunteer_hours": "0"},
        {
            "starts_at": STARTS_AT.isoformat(),
            "ends_at": (STARTS_AT - timedelta(hours=1)).isoformat(),
        },
        {"categories": ["ecology", "idp", "animals"]},
        {"categories": ["space"]},
        {"tags": ["тег!"]},
        {"city_id": 0},
        {"unknown_field": 1},
    ],
)
def test_invalid_draft_values_422(client: TestClient, org, changes: dict) -> None:
    sign_in(client, org["owner"])
    payload = {"title": "Толока", "status": "draft"} | changes
    payload = {key: value for key, value in payload.items() if value is not None}

    response = client.post("/api/projects", json=payload)

    assert response.status_code == 422


def test_draft_with_unknown_city_422(client: TestClient, org) -> None:
    sign_in(client, org["owner"])

    response = client.post(
        "/api/projects", json={"title": "Толока", "status": "draft", "city_id": 999999}
    )

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "city_id"]


def test_create_published_without_status_still_requires_all_fields(client: TestClient, org) -> None:
    # Без status проєкт, як і раніше, одразу публікується, тож перевірка повна
    sign_in(client, org["owner"])

    response = client.post("/api/projects", json={"title": "Толока"})

    assert response.status_code == 422
    errors = response.json()["detail"]
    missing = {tuple(error["loc"]) for error in errors if error["type"] == "missing"}
    assert missing == {
        ("body", "description"),
        ("body", "starts_at"),
        ("body", "ends_at"),
        ("body", "capacity"),
        ("body", "volunteer_hours"),
        ("body", "categories"),
    }
    # Офлайн за замовчуванням: про місце сказано одразу, а не після виправлення інших полів
    assert model_errors(errors) == [OFFLINE_ERROR]
    assert all("msg" in error for error in errors)


def model_errors(errors: list[dict]) -> list[str]:
    """Помилки рівня моделі (loc лише "body"): зв'язки між полями."""
    return [error["msg"] for error in errors if error["loc"] == ["body"]]


def field_errors(errors: list[dict]) -> dict[str, str]:
    return {error["loc"][1]: error["type"] for error in errors if len(error["loc"]) > 1}


OFFLINE_ERROR = "Value error, Offline project requires city_id and address"
TIMES_ERROR = "Value error, ends_at must be after starts_at"


def test_create_published_reports_value_and_missing_errors_together(
    client: TestClient, org
) -> None:
    sign_in(client, org["owner"])
    payload = {"title": "Толока"} | COMPLETE_FIELDS | {"capacity": 0}
    del payload["description"]

    response = client.post("/api/projects", json=payload)

    assert response.status_code == 422
    assert field_errors(response.json()["detail"]) == {
        "capacity": "greater_than",
        "description": "missing",
    }


def test_create_published_reports_cross_field_errors_with_field_errors(
    client: TestClient, org, city_id: int
) -> None:
    sign_in(client, org["owner"])
    payload = {"title": "Толока"} | COMPLETE_FIELDS
    payload |= {
        "is_online": False,
        "city_id": city_id,
        "ends_at": (STARTS_AT - timedelta(hours=1)).isoformat(),
        "capacity": None,
    }

    response = client.post("/api/projects", json=payload)

    assert response.status_code == 422
    errors = response.json()["detail"]
    assert field_errors(errors) == {"capacity": "missing"}
    assert model_errors(errors) == [TIMES_ERROR, OFFLINE_ERROR]


def test_create_published_reports_each_error_once(client: TestClient, org) -> None:
    # Помилки значень дають обидві перевірки — і чернетки, і публікації; у відповіді по одній
    sign_in(client, org["owner"])
    payload = {"title": "a"} | COMPLETE_FIELDS | {"tags": ["тег!"], "unknown": 1}
    payload["ends_at"] = (STARTS_AT - timedelta(hours=1)).isoformat()

    response = client.post("/api/projects", json=payload)

    assert response.status_code == 422
    errors = response.json()["detail"]
    locs = [tuple(error["loc"]) for error in errors]
    assert sorted(locs) == sorted(
        [("body", "title"), ("body", "tags", 0), ("body", "unknown"), ("body",)]
    )
    assert model_errors(errors) == [TIMES_ERROR]


def test_cross_field_check_skips_invalid_fields(client: TestClient, org) -> None:
    # is_online некоректне: перевірка місця на ньому дала б хибну помилку
    sign_in(client, org["owner"])
    payload = {"title": "Толока"} | COMPLETE_FIELDS | {"is_online": "maybe"}

    response = client.post("/api/projects", json=payload)

    assert response.status_code == 422
    errors = response.json()["detail"]
    assert field_errors(errors) == {"is_online": "bool_parsing"}
    assert model_errors(errors) == []


@pytest.mark.parametrize("status", ["draft", "published"])
@pytest.mark.parametrize(
    ("field", "value", "error_type"),
    [
        ("capacity", 2**31, "less_than_equal"),
        ("volunteer_hours", "1000", "less_than_equal"),
        # numeric(5, 2) округлив би їх до 1000.00 і до 0.00, а обидва порушують обмеження БД
        ("volunteer_hours", "999.995", "decimal_max_places"),
        ("volunteer_hours", "0.001", "decimal_max_places"),
    ],
)
def test_values_beyond_column_limits_422(
    client: TestClient, org, status: str, field: str, value, error_type: str
) -> None:
    # Раніше БД відхиляла їх, і запит падав з 500
    sign_in(client, org["owner"])
    payload = {"title": "Толока", "status": status} | COMPLETE_FIELDS | {field: value}

    response = client.post("/api/projects", json=payload)

    assert response.status_code == 422
    assert field_errors(response.json()["detail"]) == {field: error_type}


def test_values_at_column_limits_are_saved(client: TestClient, org) -> None:
    sign_in(client, org["owner"])
    payload = {"title": "Толока"} | COMPLETE_FIELDS
    payload |= {"capacity": 2**31 - 1, "volunteer_hours": "999.99"}

    response = client.post("/api/projects", json=payload)

    assert response.status_code == 201
    assert response.json()["capacity"] == 2**31 - 1
    assert response.json()["volunteer_hours"] == "999.99"


def test_create_published_201_sets_published_at(client: TestClient, org) -> None:
    sign_in(client, org["owner"])

    response = client.post(
        "/api/projects", json={"title": "Толока", "status": "published"} | COMPLETE_FIELDS
    )

    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "published"
    assert data["published_at"] is not None


@pytest.mark.parametrize("role", ["member", "outsider"])
def test_draft_requires_owner_or_admin_403(client: TestClient, org, role: str) -> None:
    sign_in(client, org[role])

    response = client.post(
        "/api/projects",
        json={"title": "Толока", "status": "draft", "organization_id": org["org"]},
    )

    assert response.status_code == 403


def test_draft_requires_login_401(client: TestClient) -> None:
    response = client.post("/api/projects", json={"title": "Толока", "status": "draft"})

    assert response.status_code == 401


@pytest.mark.parametrize("status", [OrgStatusEnum.pending, OrgStatusEnum.rejected])
def test_unapproved_organization_can_save_draft_but_not_publish(
    client: TestClient, db, org, status: OrgStatusEnum
) -> None:
    # Поки організація чекає на схвалення, проєкт можна підготувати, але не показати волонтерам
    set_org_status(db, org["org"], status)
    sign_in(client, org["owner"])

    draft = client.post("/api/projects", json={"title": "Толока", "status": "draft"})
    published = client.post("/api/projects", json={"title": "Толока"} | COMPLETE_FIELDS)

    assert draft.status_code == 201
    assert published.status_code == 403
    assert published.json()["detail"] == "Only approved organizations can publish projects"


@pytest.mark.parametrize(
    ("status", "code"),
    [(OrgStatusEnum.pending, 201), (OrgStatusEnum.rejected, 201), (OrgStatusEnum.blocked, 403)],
)
def test_draft_for_chosen_organization_checks_its_status(
    client: TestClient, org, make_org, status: OrgStatusEnum, code: int
) -> None:
    # Організація за замовчуванням схвалена, а перевіряється статус саме обраної
    second_org = make_org({org["owner"]: OrgMemberRoleEnum.owner}, status=status)
    sign_in(client, org["owner"])

    response = client.post(
        "/api/projects",
        json={"title": "Толока", "status": "draft", "organization_id": second_org},
    )

    assert response.status_code == code
    if code == 201:
        assert response.json()["organization_id"] == second_org


def test_blocked_organization_cannot_save_draft_403(client: TestClient, db, org) -> None:
    set_org_status(db, org["org"], OrgStatusEnum.blocked)
    sign_in(client, org["owner"])

    response = client.post("/api/projects", json={"title": "Толока", "status": "draft"})

    assert response.status_code == 403
    assert response.json()["detail"] == "Organization is blocked"


# =====================================================================
# Видимість чернетки
# =====================================================================


@pytest.mark.parametrize("role", ["owner", "admin", "member"])
def test_organization_member_sees_draft(client: TestClient, org, make_project, role: str) -> None:
    project_id = make_project(org["org"])
    sign_in(client, org[role])

    response = client.get(f"/api/projects/{project_id}")

    assert response.status_code == 200
    assert response.json()["status"] == "draft"


def test_guest_and_outsider_do_not_see_draft(client: TestClient, org, make_project) -> None:
    project_id = make_project(org["org"])

    assert client.get(f"/api/projects/{project_id}").status_code == 404
    sign_in(client, org["outsider"])
    response = client.get(f"/api/projects/{project_id}")
    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"


def test_member_of_other_organization_does_not_see_draft(
    client: TestClient, org, make_user, make_org, make_project
) -> None:
    other_owner = make_user()
    make_org({other_owner: OrgMemberRoleEnum.owner})
    project_id = make_project(org["org"])
    sign_in(client, other_owner)

    assert client.get(f"/api/projects/{project_id}").status_code == 404


def test_invalid_session_is_treated_as_guest(client: TestClient, org, make_project) -> None:
    # Недійсна cookie не дає 401: інакше фронтенд перенаправив би гостя на вхід
    published_id = make_project(org["org"], status=ProjectStatusEnum.published)
    draft_id = make_project(org["org"])
    client.cookies.set("session", "broken", path="/api")

    assert client.get(f"/api/projects/{published_id}").status_code == 200
    assert client.get(f"/api/projects/{draft_id}").status_code == 404


@pytest.mark.parametrize("status", [ProjectStatusEnum.completed, ProjectStatusEnum.cancelled])
def test_member_sees_finished_projects_guest_does_not(
    client: TestClient, org, make_project, status: ProjectStatusEnum
) -> None:
    project_id = make_project(org["org"], status=status)

    assert client.get(f"/api/projects/{project_id}").status_code == 404
    sign_in(client, org["member"])
    assert client.get(f"/api/projects/{project_id}").status_code == 200


def test_draft_is_not_in_public_lists(client: TestClient, org, make_project) -> None:
    make_project(org["org"], title="Чернетка")
    published_id = make_project(
        org["org"], title="Опублікований", status=ProjectStatusEnum.published
    )
    sign_in(client, org["owner"])

    catalog = client.get("/api/projects").json()["items"]
    organization = client.get(f"/api/organizations/{org['org']}").json()

    assert [project["id"] for project in catalog] == [published_id]
    assert [project["id"] for project in organization["projects"]] == [published_id]


def test_public_organization_profile_orders_by_published_at(
    client: TestClient, org, make_project
) -> None:
    now = datetime.now(UTC)
    # Створений раніше, але опублікований пізніше — першим
    published_later = make_project(
        org["org"],
        status=ProjectStatusEnum.published,
        created_at=now - timedelta(days=10),
        published_at=now - timedelta(days=1),
    )
    published_earlier = make_project(
        org["org"],
        status=ProjectStatusEnum.published,
        created_at=now - timedelta(days=5),
        published_at=now - timedelta(days=4),
    )

    projects = client.get(f"/api/organizations/{org['org']}").json()["projects"]

    assert [project["id"] for project in projects] == [published_later, published_earlier]


# =====================================================================
# POST /api/projects/{id}/publish
# =====================================================================


def test_publish_complete_draft(client: TestClient, db, org, make_project) -> None:
    created = datetime.now(UTC) - timedelta(days=10)
    project_id = make_project(
        org["org"],
        title="Підготовлена чернетка",
        description="Опис",
        starts_at=STARTS_AT,
        ends_at=STARTS_AT + timedelta(hours=2),
        capacity=5,
        volunteer_hours=Decimal("2"),
        is_online=True,
        categories=["ecology"],
        created_at=created,
    )
    # Опублікований раніше, але створений пізніше за чернетку
    older_id = make_project(
        org["org"],
        status=ProjectStatusEnum.published,
        published_at=datetime.now(UTC) - timedelta(days=2),
    )
    sign_in(client, org["owner"])

    response = client.post(f"/api/projects/{project_id}/publish")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "published"
    assert data["published_at"] is not None
    # Каталог ставить нові проєкти першими за часом публікації, а не створення
    catalog = client.get("/api/projects").json()["items"]
    assert [project["id"] for project in catalog] == [project_id, older_id]
    client.cookies.clear()
    assert client.get(f"/api/projects/{project_id}").status_code == 200


def test_admin_can_publish(client: TestClient, org, make_project) -> None:
    project_id = make_project(org["org"], **_complete_draft_fields())
    sign_in(client, org["admin"])

    assert client.post(f"/api/projects/{project_id}/publish").status_code == 200


def _complete_draft_fields() -> dict:
    return {
        "description": "Опис",
        "starts_at": STARTS_AT,
        "ends_at": STARTS_AT + timedelta(hours=2),
        "capacity": 5,
        "volunteer_hours": Decimal("2"),
        "is_online": True,
        "categories": ["ecology"],
    }


def test_publish_title_only_draft_422(client: TestClient, db, org, make_project) -> None:
    project_id = make_project(org["org"])
    sign_in(client, org["owner"])

    response = client.post(f"/api/projects/{project_id}/publish")

    assert response.status_code == 422
    errors = response.json()["detail"]
    assert {tuple(error["loc"]) for error in errors} == {
        ("body", "description"),
        ("body", "starts_at"),
        ("body", "ends_at"),
        ("body", "capacity"),
        ("body", "volunteer_hours"),
        ("body", "categories"),
        ("body",),
    }
    # Чернетка офлайн за замовчуванням: місце — в тому ж списку, а не з наступної спроби
    assert model_errors(errors) == [OFFLINE_ERROR]
    project = load_project(db, project_id)
    assert project.status == ProjectStatusEnum.draft
    assert project.published_at is None


def _past_times() -> dict:
    """Подія, що почалася годину тому й ще триває."""
    now = datetime.now(UTC).replace(microsecond=0)
    return {
        "starts_at": (now - timedelta(hours=1)).isoformat(),
        "ends_at": (now + timedelta(hours=2)).isoformat(),
    }


def test_create_published_with_past_start_422(client: TestClient, org) -> None:
    sign_in(client, org["owner"])
    payload = {"title": "Толока"} | COMPLETE_FIELDS | _past_times()
    del payload["description"]

    response = client.post("/api/projects", json=payload)

    # Минулий початок — в одному списку з рештою помилок, а не з наступної спроби
    assert response.status_code == 422
    assert field_errors(response.json()["detail"]) == {
        "starts_at": "value_error",
        "description": "missing",
    }


def test_draft_with_past_start_is_saved(client: TestClient, org) -> None:
    sign_in(client, org["owner"])
    payload = {"title": "Толока", "status": "draft"} | COMPLETE_FIELDS | _past_times()

    assert client.post("/api/projects", json=payload).status_code == 201


def test_publish_draft_with_past_start_422(client: TestClient, db, org, make_project) -> None:
    now = datetime.now(UTC)
    times = {"starts_at": now - timedelta(hours=1), "ends_at": now + timedelta(hours=2)}
    project_id = make_project(org["org"], **(_complete_draft_fields() | times))
    sign_in(client, org["owner"])

    response = client.post(f"/api/projects/{project_id}/publish")

    assert response.status_code == 422
    assert response.json()["detail"] == [
        {
            "type": "value_error",
            "loc": ["body", "starts_at"],
            "msg": "Value error, starts_at must be in the future",
        }
    ]
    assert load_project(db, project_id).status == ProjectStatusEnum.draft


def test_publish_offline_draft_without_address_422(
    client: TestClient, db, org, make_project, city_id: int
) -> None:
    fields = _complete_draft_fields() | {"is_online": False, "city_id": city_id}
    project_id = make_project(org["org"], **fields)
    sign_in(client, org["owner"])

    response = client.post(f"/api/projects/{project_id}/publish")

    assert response.status_code == 422
    assert "Offline project requires city_id and address" in response.json()["detail"][0]["msg"]
    assert load_project(db, project_id).status == ProjectStatusEnum.draft


def test_publish_reports_location_with_missing_fields(
    client: TestClient, org, make_project, city_id: int
) -> None:
    fields = _complete_draft_fields() | {"is_online": False, "city_id": city_id}
    del fields["capacity"]
    project_id = make_project(org["org"], **fields)
    sign_in(client, org["owner"])

    response = client.post(f"/api/projects/{project_id}/publish")

    assert response.status_code == 422
    errors = response.json()["detail"]
    assert field_errors(errors) == {"capacity": "missing"}
    assert model_errors(errors) == [OFFLINE_ERROR]


def test_published_draft_accepts_join_requests(client: TestClient, org, make_project) -> None:
    project_id = make_project(org["org"], **_complete_draft_fields())
    sign_in(client, org["outsider"])
    assert client.post(f"/api/projects/{project_id}/join-requests", json={}).status_code == 404

    sign_in(client, org["owner"])
    assert client.post(f"/api/projects/{project_id}/publish").status_code == 200

    sign_in(client, org["outsider"])
    response = client.post(f"/api/projects/{project_id}/join-requests", json={})
    assert response.status_code == 201
    assert response.json()["status"] == "pending"


def test_publish_requires_login_401(client: TestClient, org, make_project) -> None:
    project_id = make_project(org["org"], **_complete_draft_fields())

    assert client.post(f"/api/projects/{project_id}/publish").status_code == 401


def test_plain_member_cannot_publish_403(client: TestClient, db, org, make_project) -> None:
    # Учасник бачить чернетку, тож отримує 403, а не 404
    project_id = make_project(org["org"], **_complete_draft_fields())
    sign_in(client, org["member"])

    response = client.post(f"/api/projects/{project_id}/publish")

    assert response.status_code == 403
    assert response.json()["detail"] == "Only organization owner or admin can publish projects"
    assert load_project(db, project_id).status == ProjectStatusEnum.draft


def test_outsider_cannot_publish_404(client: TestClient, org, make_project) -> None:
    project_id = make_project(org["org"], **_complete_draft_fields())
    sign_in(client, org["outsider"])

    response = client.post(f"/api/projects/{project_id}/publish")

    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"


def test_publish_nonexistent_project_404(client: TestClient, org) -> None:
    sign_in(client, org["owner"])

    assert client.post("/api/projects/999999999/publish").status_code == 404


@pytest.mark.parametrize("project_id", ["0", "-1", "abc", str(2**63)])
def test_publish_invalid_id_422(client: TestClient, org, project_id: str) -> None:
    sign_in(client, org["owner"])

    assert client.post(f"/api/projects/{project_id}/publish").status_code == 422


@pytest.mark.parametrize(
    "status",
    [ProjectStatusEnum.published, ProjectStatusEnum.completed, ProjectStatusEnum.cancelled],
)
def test_publish_not_draft_409(
    client: TestClient, org, make_project, status: ProjectStatusEnum
) -> None:
    project_id = make_project(org["org"], status=status)
    sign_in(client, org["owner"])

    response = client.post(f"/api/projects/{project_id}/publish")

    assert response.status_code == 409
    assert response.json()["detail"] == "Only a draft project can be published"


@pytest.mark.parametrize(
    ("status", "detail"),
    [
        (OrgStatusEnum.pending, "Only approved organizations can publish projects"),
        (OrgStatusEnum.rejected, "Only approved organizations can publish projects"),
        (OrgStatusEnum.blocked, "Organization is blocked"),
    ],
)
def test_publish_requires_approved_organization_403(
    client: TestClient, db, org, make_project, status: OrgStatusEnum, detail: str
) -> None:
    project_id = make_project(org["org"], **_complete_draft_fields())
    set_org_status(db, org["org"], status)
    sign_in(client, org["owner"])

    response = client.post(f"/api/projects/{project_id}/publish")

    assert response.status_code == 403
    assert response.json()["detail"] == detail


def test_publish_checks_role_in_project_organization(
    client: TestClient, org, make_user, make_org, make_project
) -> None:
    # Користувач — власник іншої організації і звичайний учасник організації проєкту
    user_id = make_user()
    make_org({user_id: OrgMemberRoleEnum.owner})
    second_org = make_org(
        {org["owner"]: OrgMemberRoleEnum.owner, user_id: OrgMemberRoleEnum.member}
    )
    project_id = make_project(second_org, **_complete_draft_fields())
    sign_in(client, user_id)

    assert client.post(f"/api/projects/{project_id}/publish").status_code == 403


# =====================================================================
# GET /api/organizations/me/projects
# =====================================================================


@pytest.fixture
def org_projects(org, make_project) -> dict[str, int]:
    """По проєкту кожного статусу; створюються від старішого до новішого."""
    now = datetime.now(UTC)
    return {
        status: make_project(
            org["org"], status=status, title=status, created_at=now - timedelta(days=10 - n)
        )
        for n, status in enumerate(ProjectStatusEnum)
    }


@pytest.mark.parametrize("role", ["owner", "admin", "member"])
def test_organization_projects_lists_all_statuses(
    client: TestClient, org, org_projects, role: str
) -> None:
    sign_in(client, org[role])

    response = client.get("/api/organizations/me/projects")

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 4
    # Нові першими
    assert [project["id"] for project in data["items"]] == list(reversed(org_projects.values()))
    assert {project["status"] for project in data["items"]} == set(ProjectStatusEnum)


@pytest.mark.parametrize("status", list(ProjectStatusEnum))
def test_organization_projects_filter_by_status(
    client: TestClient, org, org_projects, status: ProjectStatusEnum
) -> None:
    sign_in(client, org["owner"])

    data = client.get(f"/api/organizations/me/projects?status={status}").json()

    assert data["total"] == 1
    assert [project["id"] for project in data["items"]] == [org_projects[status]]


def test_organization_projects_pagination_keeps_total(
    client: TestClient, org, org_projects
) -> None:
    sign_in(client, org["owner"])

    first = client.get("/api/organizations/me/projects?limit=3").json()
    second = client.get("/api/organizations/me/projects?limit=3&offset=3").json()

    assert first["total"] == second["total"] == 4
    assert len(first["items"]) == 3
    assert len(second["items"]) == 1
    ids = [project["id"] for project in first["items"] + second["items"]]
    assert sorted(ids) == sorted(org_projects.values())


def test_organization_projects_excludes_other_organizations(
    client: TestClient, org, make_user, make_org, make_project
) -> None:
    other_org = make_org({make_user(): OrgMemberRoleEnum.owner})
    make_project(other_org)
    own_id = make_project(org["org"])
    sign_in(client, org["owner"])

    data = client.get("/api/organizations/me/projects").json()

    assert data["total"] == 1
    assert [project["id"] for project in data["items"]] == [own_id]


def test_organization_projects_for_chosen_organization(
    client: TestClient, org, make_org, make_project
) -> None:
    # Без organization_id — організація за замовчуванням, з ним — обрана
    second_org = make_org({org["member"]: OrgMemberRoleEnum.owner})
    second_id = make_project(second_org)
    make_project(org["org"])
    sign_in(client, org["member"])

    data = client.get(f"/api/organizations/me/projects?organization_id={second_org}").json()

    assert [project["id"] for project in data["items"]] == [second_id]


def test_organization_projects_of_foreign_organization_404(client: TestClient, org) -> None:
    sign_in(client, org["outsider"])

    response = client.get(f"/api/organizations/me/projects?organization_id={org['org']}")

    assert response.status_code == 404


def test_organization_projects_without_organization_404(client: TestClient, org) -> None:
    sign_in(client, org["outsider"])

    assert client.get("/api/organizations/me/projects").status_code == 404


def test_organization_projects_requires_login_401(client: TestClient) -> None:
    assert client.get("/api/organizations/me/projects").status_code == 401


@pytest.mark.parametrize(
    "query", ["status=unknown", "limit=0", "limit=101", "offset=-1", "organization_id=0"]
)
def test_organization_projects_invalid_params_422(client: TestClient, org, query: str) -> None:
    sign_in(client, org["owner"])

    assert client.get(f"/api/organizations/me/projects?{query}").status_code == 422
