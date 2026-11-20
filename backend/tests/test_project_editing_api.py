"""Редагування проєкту й сповіщення про зміни (R-12, R-19, рішення 18.11)."""

from datetime import UTC, date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select

from app import auth
from app.db import engine
from app.main import app
from app.models import (
    City,
    JoinRequest,
    JoinRequestStatusEnum,
    JoinRequestTargetEnum,
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

STARTS_AT = datetime.now(UTC).replace(microsecond=0) + timedelta(days=30)
# Пізніше на годину: кінець події (STARTS_AT + 3 год) лишається після початку
NEW_STARTS_AT = STARTS_AT + timedelta(hours=1)


def sign_in(client: TestClient, user_id: int) -> None:
    token = auth._encode({"sub": str(user_id), "typ": "session"}, auth.SESSION_TTL)
    client.cookies.set("session", token, path="/api")


def patch(client: TestClient, project_id: int, **body):
    return client.patch(f"/api/projects/{project_id}", json=body)


@pytest.fixture
def make_city(db):
    def make(name: str = "Львів") -> int:
        async def create(session) -> int:
            city = City(name=name, region="Львівська")
            session.add(city)
            await session.flush()
            return city.id

        return db(create)

    return make


@pytest.fixture
def city_id(make_city) -> int:
    return make_city()


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


def add_request(
    db, organization_id: int, project_id: int, user_id: int, status: JoinRequestStatusEnum
) -> int:
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


@pytest.fixture
def published(org, make_project, make_user, db, city_id: int) -> dict[str, int]:
    """Опублікована офлайн-подія з волонтерами в усіх статусах заявок."""
    ids = dict(org)
    ids["project"] = make_project(
        org["org"],
        status=ProjectStatusEnum.published,
        is_online=False,
        city_id=city_id,
        address="вул. Зелена, 1",
    )
    for status in JoinRequestStatusEnum:
        ids[status.value] = make_user()
        add_request(db, org["org"], ids["project"], ids[status.value], status)
    return ids


def set_org_status(db, organization_id: int, status: OrgStatusEnum) -> None:
    async def update(session) -> None:
        organization = await session.get(Organization, organization_id)
        organization.status = status

    db(update)


def load_project(db, project_id: int) -> Project:
    async def load(session) -> Project:
        return await session.get(Project, project_id, populate_existing=True)

    return db(load)


def update_notifications(db) -> dict[int, list[Notification]]:
    """Сповіщення project_updated за адресатами."""

    async def load(session) -> list[Notification]:
        result = await session.scalars(
            select(Notification).where(Notification.type == NotificationTypeEnum.project_updated)
        )
        return list(result)

    by_user: dict[int, list[Notification]] = {}
    for notification in db(load):
        by_user.setdefault(notification.user_id, []).append(notification)
    return by_user


# =====================================================================
# Зміни полів
# =====================================================================


def test_partial_update_changes_only_sent_fields(client: TestClient, db, published) -> None:
    before = load_project(db, published["project"])
    sign_in(client, published["owner"])

    response = patch(client, published["project"], description="Новий опис", tags=["#Толока"])

    assert response.status_code == 200
    data = response.json()
    assert data["description"] == "Новий опис"
    assert data["tags"] == ["толока"]
    project = load_project(db, published["project"])
    assert project.description == "Новий опис"
    assert project.title == before.title
    assert project.starts_at == before.starts_at
    assert project.address == before.address
    assert project.capacity == before.capacity
    assert project.status is ProjectStatusEnum.published
    assert project.published_at == before.published_at


def test_admin_can_edit(client: TestClient, published) -> None:
    sign_in(client, published["admin"])

    response = patch(client, published["project"], title="Толока восени")

    assert response.status_code == 200
    assert response.json()["title"] == "Толока восени"


def test_empty_body_changes_nothing(client: TestClient, published) -> None:
    sign_in(client, published["owner"])

    response = patch(client, published["project"])

    assert response.status_code == 200
    assert response.json()["title"] == "Прибирання парку"


def test_draft_fields_can_be_filled_cleared_and_published(
    client: TestClient, db, org, make_project
) -> None:
    project_id = make_project(org["org"])
    sign_in(client, org["owner"])

    filled = patch(
        client,
        project_id,
        description="Опис",
        starts_at=STARTS_AT.isoformat(),
        ends_at=(STARTS_AT + timedelta(hours=2)).isoformat(),
        is_online=True,
        capacity=5,
        volunteer_hours="1.5",
        categories=["ecology", "ecology"],
    )
    assert filled.status_code == 200
    assert filled.json()["status"] == "draft"
    assert filled.json()["categories"] == ["ecology"]

    # Явний null у чернетці стирає поле
    cleared = patch(client, project_id, capacity=None)
    assert cleared.status_code == 200
    assert load_project(db, project_id).capacity is None
    assert client.post(f"/api/projects/{project_id}/publish").status_code == 422

    assert patch(client, project_id, capacity=5).status_code == 200
    assert client.post(f"/api/projects/{project_id}/publish").status_code == 200


def test_naive_time_is_treated_as_utc(client: TestClient, db, published) -> None:
    sign_in(client, published["owner"])
    naive = NEW_STARTS_AT.replace(tzinfo=None).isoformat()

    assert patch(client, published["project"], starts_at=naive).status_code == 200
    assert load_project(db, published["project"]).starts_at == NEW_STARTS_AT


# =====================================================================
# Валідація
# =====================================================================


def model_errors(errors: list[dict]) -> list[str]:
    # Помилки зв'язків між полями: loc без назви поля
    return [error["msg"] for error in errors if error["loc"] == ["body"]]


def test_draft_end_is_checked_against_saved_start(
    client: TestClient, db, org, make_project
) -> None:
    project_id = make_project(org["org"], starts_at=STARTS_AT)
    sign_in(client, org["owner"])

    response = patch(client, project_id, ends_at=(STARTS_AT - timedelta(hours=1)).isoformat())

    assert response.status_code == 422
    assert model_errors(response.json()["detail"]) == [
        "Value error, ends_at must be after starts_at"
    ]
    assert load_project(db, project_id).ends_at is None


def test_draft_does_not_require_location(client: TestClient, org, make_project) -> None:
    project_id = make_project(org["org"])
    sign_in(client, org["owner"])

    assert patch(client, project_id, is_online=False).status_code == 200


def test_published_start_is_checked_against_saved_end(client: TestClient, db, published) -> None:
    sign_in(client, published["owner"])

    response = patch(
        client, published["project"], starts_at=(STARTS_AT + timedelta(days=2)).isoformat()
    )

    assert response.status_code == 422
    assert model_errors(response.json()["detail"]) == [
        "Value error, ends_at must be after starts_at"
    ]
    assert load_project(db, published["project"]).starts_at == STARTS_AT


@pytest.mark.parametrize(
    "field", ["description", "starts_at", "ends_at", "capacity", "volunteer_hours"]
)
def test_published_required_field_cannot_be_cleared_422(
    client: TestClient, published, field: str
) -> None:
    sign_in(client, published["owner"])

    response = patch(client, published["project"], **{field: None})

    assert response.status_code == 422
    assert {"type": "missing", "loc": ["body", field], "msg": "Field required"} in response.json()[
        "detail"
    ]


def test_published_categories_cannot_be_emptied_422(client: TestClient, published) -> None:
    sign_in(client, published["owner"])

    response = patch(client, published["project"], categories=[])

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "categories"]


def test_published_offline_project_requires_location(
    client: TestClient, org, make_project, city_id: int
) -> None:
    project_id = make_project(org["org"], status=ProjectStatusEnum.published)
    sign_in(client, org["owner"])

    response = patch(client, project_id, is_online=False)
    assert response.status_code == 422
    assert model_errors(response.json()["detail"]) == [
        "Value error, Offline project requires city_id and address"
    ]

    response = patch(client, project_id, is_online=False, city_id=city_id, address="вул. Лісова, 2")
    assert response.status_code == 200


def test_offline_published_project_cannot_lose_address(client: TestClient, published) -> None:
    sign_in(client, published["owner"])

    response = patch(client, published["project"], address=None)

    assert response.status_code == 422
    assert model_errors(response.json()["detail"]) == [
        "Value error, Offline project requires city_id and address"
    ]


@pytest.mark.parametrize(
    "body",
    [
        {"title": None},
        {"title": "Т"},
        {"is_online": None},
        {"is_adult_only": None},
        {"experience_level": None},
        {"categories": None},
        {"tags": None},
        {"categories": ["ecology", "idp", "tech"]},
        {"categories": ["unknown"]},
        {"tags": ["a", "b", "c", "d", "e", "f"]},
        {"capacity": 0},
        {"capacity": 2**31},
        {"volunteer_hours": "1000"},
        {"city_id": 0},
        {"status": "draft"},
        {"status": "cancelled"},
        {"organization_id": 1},
        {"published_at": "2026-01-01T00:00:00Z"},
    ],
)
def test_invalid_values_422(client: TestClient, db, published, body: dict) -> None:
    sign_in(client, published["owner"])

    response = patch(client, published["project"], **body)

    assert response.status_code == 422
    field = next(iter(body))
    # Для елемента списку loc продовжується його індексом
    assert response.json()["detail"][0]["loc"][:2] == ["body", field]
    project = load_project(db, published["project"])
    assert project.status is ProjectStatusEnum.published
    assert project.title == "Прибирання парку"


def test_unknown_city_422(client: TestClient, published) -> None:
    sign_in(client, published["owner"])

    response = patch(client, published["project"], city_id=999_999)

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "city_id"]


def test_update_schema_does_not_accept_null_for_required_fields() -> None:
    properties = app.openapi()["components"]["schemas"]["ProjectUpdate"]["properties"]

    for field in ("title", "is_online", "is_adult_only", "experience_level", "categories", "tags"):
        assert "anyOf" not in properties[field], field
    for field in ("description", "starts_at", "ends_at", "city_id", "address", "capacity"):
        assert {"type": "null"} in properties[field]["anyOf"], field


# =====================================================================
# Кількість місць
# =====================================================================


def test_capacity_below_accepted_422(client: TestClient, db, published, make_user) -> None:
    add_request(
        db, published["org"], published["project"], make_user(), JoinRequestStatusEnum.accepted
    )
    sign_in(client, published["owner"])

    response = patch(client, published["project"], capacity=1)

    assert response.status_code == 422
    assert response.json()["detail"] == [
        {
            "type": "capacity_below_accepted",
            "loc": ["body", "capacity"],
            "msg": "Capacity cannot be lower than the number of accepted participants (2)",
        }
    ]
    assert load_project(db, published["project"]).capacity == 10


def test_capacity_equal_to_accepted_closes_free_places(client: TestClient, db, published) -> None:
    sign_in(client, published["owner"])

    assert patch(client, published["project"], capacity=1).status_code == 200

    # Єдине місце вже зайняте: заявку, що чекає, прийняти не можна
    async def pending_request_id(session) -> int:
        return await session.scalar(
            select(JoinRequest.id).where(JoinRequest.user_id == published["pending"])
        )

    request_id = db(pending_request_id)
    response = client.patch(f"/api/join-requests/{request_id}", json={"status": "accepted"})
    assert response.status_code == 409
    assert response.json()["detail"] == "Project has no free places"


def test_update_locks_project_before_counting_places(client: TestClient, published) -> None:
    sign_in(client, published["owner"])
    statements: list[str] = []

    def capture(conn, cursor, statement, parameters, context, executemany) -> None:
        statements.append(statement)

    event.listen(engine.sync_engine, "before_cursor_execute", capture)
    try:
        assert patch(client, published["project"], capacity=3).status_code == 200
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", capture)

    # Паралельне прийняття заявки блокує той самий рядок проєкту, тож чекає, доки зміну
    # збережено, і рахує місця вже з новою capacity
    locked = next(
        index
        for index, statement in enumerate(statements)
        if "FROM projects" in statement and "FOR UPDATE" in statement
    )
    counted = next(
        index
        for index, statement in enumerate(statements)
        if "count(" in statement and "FROM join_requests" in statement
    )
    assert locked < counted


# =====================================================================
# Права й стан проєкту
# =====================================================================


def test_guest_401(client: TestClient, published) -> None:
    assert patch(client, published["project"], title="Інша назва").status_code == 401


def test_plain_member_403(client: TestClient, db, published) -> None:
    sign_in(client, published["member"])

    response = patch(client, published["project"], title="Інша назва")

    assert response.status_code == 403
    assert response.json()["detail"] == "Only organization owner or admin can edit projects"
    assert load_project(db, published["project"]).title == "Прибирання парку"


@pytest.mark.parametrize("status", [ProjectStatusEnum.draft, ProjectStatusEnum.published])
def test_outsider_404(client: TestClient, org, make_project, status) -> None:
    project_id = make_project(org["org"], status=status)
    sign_in(client, org["outsider"])

    assert patch(client, project_id, title="Інша назва").status_code == 404


def test_owner_of_other_organization_404(
    client: TestClient, published, make_user, make_org
) -> None:
    other_owner = make_user()
    make_org({other_owner: OrgMemberRoleEnum.owner})
    sign_in(client, other_owner)

    assert patch(client, published["project"], title="Інша назва").status_code == 404


def test_missing_project_404(client: TestClient, org) -> None:
    sign_in(client, org["owner"])

    assert patch(client, 999_999, title="Інша назва").status_code == 404


def test_blocked_organization_403(client: TestClient, db, published) -> None:
    set_org_status(db, published["org"], OrgStatusEnum.blocked)
    sign_in(client, published["owner"])

    response = patch(client, published["project"], title="Інша назва")

    assert response.status_code == 403
    assert response.json()["detail"] == "Organization is blocked"


@pytest.mark.parametrize("status", [OrgStatusEnum.pending, OrgStatusEnum.rejected])
def test_unapproved_organization_can_edit_draft(
    client: TestClient, make_user, make_org, make_project, status: OrgStatusEnum
) -> None:
    owner = make_user()
    organization_id = make_org({owner: OrgMemberRoleEnum.owner}, status=status)
    project_id = make_project(organization_id)
    sign_in(client, owner)

    assert patch(client, project_id, description="Опис").status_code == 200


@pytest.mark.parametrize("status", [ProjectStatusEnum.completed, ProjectStatusEnum.cancelled])
def test_finished_project_is_not_editable_409(
    client: TestClient, db, org, make_project, status: ProjectStatusEnum
) -> None:
    project_id = make_project(org["org"], status=status)
    sign_in(client, org["owner"])

    response = patch(client, project_id, description="Новий опис")

    assert response.status_code == 409
    assert response.json()["detail"] == "Completed or cancelled project cannot be edited"
    assert load_project(db, project_id).description == "Опис"


def test_started_project_is_not_editable_409(client: TestClient, org, make_project) -> None:
    now = datetime.now(UTC)
    project_id = make_project(
        org["org"],
        status=ProjectStatusEnum.published,
        starts_at=now - timedelta(hours=1),
        ends_at=now + timedelta(hours=2),
    )
    sign_in(client, org["owner"])

    response = patch(client, project_id, description="Новий опис")

    assert response.status_code == 409
    assert response.json()["detail"] == "Project has already started"


def test_draft_with_past_date_is_editable(client: TestClient, org, make_project) -> None:
    project_id = make_project(org["org"], starts_at=datetime.now(UTC) - timedelta(days=1))
    sign_in(client, org["owner"])

    response = patch(client, project_id, starts_at=STARTS_AT.isoformat())

    assert response.status_code == 200


# =====================================================================
# Сповіщення про зміни
# =====================================================================


@pytest.mark.parametrize(
    "body",
    [
        {"starts_at": NEW_STARTS_AT.isoformat()},
        {"ends_at": (STARTS_AT + timedelta(hours=5)).isoformat()},
        {
            "starts_at": NEW_STARTS_AT.isoformat(),
            "ends_at": (NEW_STARTS_AT + timedelta(hours=3)).isoformat(),
        },
    ],
)
def test_time_change_notifies_accepted_and_pending(
    client: TestClient, db, published, body: dict
) -> None:
    sign_in(client, published["owner"])

    assert patch(client, published["project"], **body).status_code == 200

    notifications = update_notifications(db)
    assert set(notifications) == {published["accepted"], published["pending"]}
    for user_id in (published["accepted"], published["pending"]):
        [notification] = notifications[user_id]
        assert notification.title == "Зміни в проєкті"
        assert notification.message == (
            "Організація «Благодійний фонд» оновила проєкт «Прибирання парку». "
            "Змінено: дата або час. Подробиці — на сторінці проєкту."
        )
        assert notification.link == f"/projects/{published['project']}"
        assert notification.is_read is False


@pytest.mark.parametrize(
    "body",
    [
        {"address": "вул. Лісова, 2"},
        {"is_online": True},
    ],
)
def test_place_change_notifies_accepted_only(client: TestClient, db, published, body: dict) -> None:
    sign_in(client, published["owner"])

    assert patch(client, published["project"], **body).status_code == 200

    notifications = update_notifications(db)
    assert set(notifications) == {published["accepted"]}
    assert "Змінено: місце." in notifications[published["accepted"]][0].message


def test_city_change_notifies_accepted_only(client: TestClient, db, published, make_city) -> None:
    sign_in(client, published["owner"])

    assert patch(client, published["project"], city_id=make_city("Київ")).status_code == 200

    assert set(update_notifications(db)) == {published["accepted"]}


def test_hours_change_notifies_accepted_only(client: TestClient, db, published) -> None:
    sign_in(client, published["owner"])

    assert patch(client, published["project"], volunteer_hours="3.5").status_code == 200

    notifications = update_notifications(db)
    assert set(notifications) == {published["accepted"]}
    assert (
        "Змінено: кількість волонтерських годин." in notifications[published["accepted"]][0].message
    )


def test_several_changes_give_one_notification_per_volunteer(
    client: TestClient, db, published
) -> None:
    sign_in(client, published["owner"])

    response = patch(
        client,
        published["project"],
        title="Толока восени",
        starts_at=NEW_STARTS_AT.isoformat(),
        ends_at=(NEW_STARTS_AT + timedelta(hours=3)).isoformat(),
        address="вул. Лісова, 2",
        volunteer_hours="3",
    )

    assert response.status_code == 200
    notifications = update_notifications(db)
    [accepted] = notifications[published["accepted"]]
    assert accepted.message == (
        "Організація «Благодійний фонд» оновила проєкт «Толока восени». "
        "Змінено: дата або час, місце, кількість волонтерських годин. "
        "Подробиці — на сторінці проєкту."
    )
    # Тим, чия заявка на розгляді, — лише про час: місце їм ще не належить знати (R-22)
    [pending] = notifications[published["pending"]]
    assert "Змінено: дата або час." in pending.message
    assert "місце" not in pending.message


@pytest.mark.parametrize(
    "body",
    [
        {"title": "Толока восени"},
        {"description": "Новий опис"},
        {"tags": ["толока"]},
        {"categories": ["ecology", "animals"]},
        {"capacity": 20},
        {"is_adult_only": True},
        {"experience_level": "pro"},
    ],
)
def test_other_changes_create_no_notifications(
    client: TestClient, db, published, body: dict
) -> None:
    sign_in(client, published["owner"])

    assert patch(client, published["project"], **body).status_code == 200

    assert update_notifications(db) == {}


def test_resending_same_values_creates_no_notifications(
    client: TestClient, db, published, city_id: int
) -> None:
    # Форма редагування надсилає всі поля: незмінені значення в іншому записі — не зміна
    sign_in(client, published["owner"])
    kyiv_time = timezone(timedelta(hours=2))

    response = patch(
        client,
        published["project"],
        starts_at=STARTS_AT.astimezone(kyiv_time).isoformat(),
        ends_at=(STARTS_AT + timedelta(hours=3)).isoformat(),
        is_online=False,
        city_id=city_id,
        address="вул. Зелена, 1",
        volunteer_hours="2.00",
    )

    assert response.status_code == 200
    assert update_notifications(db) == {}


def test_draft_changes_create_no_notifications(client: TestClient, db, org, make_project) -> None:
    project_id = make_project(org["org"], starts_at=STARTS_AT)
    sign_in(client, org["owner"])

    assert patch(client, project_id, starts_at=NEW_STARTS_AT.isoformat()).status_code == 200

    assert update_notifications(db) == {}


def test_rejected_update_creates_no_notifications(client: TestClient, db, published) -> None:
    # Сповіщення зберігаються в одній транзакції зі зміною: відхилена зміна їх не лишає
    sign_in(client, published["owner"])

    response = patch(client, published["project"], starts_at=NEW_STARTS_AT.isoformat(), capacity=0)

    assert response.status_code == 422
    assert update_notifications(db) == {}
