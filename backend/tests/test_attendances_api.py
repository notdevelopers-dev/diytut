"""Підтвердження участі й нарахування годин після події (R-25, R-26, NF-09)."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event as sa_event
from sqlalchemy import select

from app import auth
from app.db import engine
from app.models import (
    Attendance,
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

# Подія вже закінчилася: початок за два дні, кінець — учора
STARTED_AT = datetime.now(UTC).replace(microsecond=0) - timedelta(days=2)
ENDED_AT = STARTED_AT + timedelta(days=1)


def sign_in(client: TestClient, user_id: int) -> None:
    token = auth._encode({"sub": str(user_id), "typ": "session"}, auth.SESSION_TTL)
    client.cookies.set("session", token, path="/api")


def confirm(client: TestClient, project_id: int, *entries: dict):
    return client.post(f"/api/projects/{project_id}/attendances", json={"entries": list(entries)})


def correct(client: TestClient, project_id: int, volunteer_id: int, hours):
    return client.patch(
        f"/api/projects/{project_id}/attendances/{volunteer_id}", json={"hours": hours}
    )


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
def make_project(db):
    def make(organization_id: int, **changes) -> int:
        fields = {
            "title": "Прибирання парку",
            "description": "Опис",
            "starts_at": STARTED_AT,
            "ends_at": ENDED_AT,
            "is_online": True,
            "capacity": 10,
            "volunteer_hours": Decimal("2"),
            "categories": ["ecology"],
            "status": ProjectStatusEnum.published,
            "published_at": STARTED_AT - timedelta(days=5),
        } | changes

        async def create(session) -> int:
            project = Project(organization_id=organization_id, **fields)
            session.add(project)
            await session.flush()
            return project.id

        return db(create)

    return make


def add_request(
    db,
    organization_id: int,
    project_id: int,
    user_id: int,
    status: JoinRequestStatusEnum = JoinRequestStatusEnum.accepted,
) -> None:
    async def create(session) -> None:
        session.add(
            JoinRequest(
                user_id=user_id,
                organization_id=organization_id,
                project_id=project_id,
                target=JoinRequestTargetEnum.project,
                status=status,
            )
        )

    db(create)


@pytest.fixture
def event(db, city_id: int, make_user, make_project) -> dict[str, int]:
    """Завершена подія зі схваленими волонтерами, а також тими, кого підтверджувати не можна."""
    ids = {
        name: make_user()
        for name in (
            "owner",
            "admin",
            "member",
            "outsider",
            "alice",
            "bob",
            "carol",
            "pending",
            "rejected",
            "stranger",
        )
    }

    async def create_org(session) -> int:
        org = Organization(
            name="Благодійний фонд",
            email="fund@example.com",
            phone="+380679998877",
            city_id=city_id,
            status=OrgStatusEnum.approved,
            created_by=ids["owner"],
        )
        for name, role in (
            ("owner", OrgMemberRoleEnum.owner),
            ("admin", OrgMemberRoleEnum.admin),
            ("member", OrgMemberRoleEnum.member),
        ):
            org.members.append(OrganizationMember(user_id=ids[name], role=role))
        session.add(org)
        await session.flush()
        return org.id

    ids["org"] = db(create_org)
    ids["project"] = make_project(ids["org"])
    for name in ("alice", "bob", "carol"):
        add_request(db, ids["org"], ids["project"], ids[name])
    add_request(db, ids["org"], ids["project"], ids["pending"], JoinRequestStatusEnum.pending)
    add_request(db, ids["org"], ids["project"], ids["rejected"], JoinRequestStatusEnum.rejected)
    return ids


def load_attendances(db, project_id: int) -> dict[int, Attendance]:
    async def load(session) -> dict[int, Attendance]:
        rows = await session.scalars(
            select(Attendance)
            .where(Attendance.project_id == project_id)
            .execution_options(populate_existing=True)
        )
        return {row.user_id: row for row in rows}

    return db(load)


def load_notifications(db, type_: NotificationTypeEnum, user_id: int) -> list[Notification]:
    async def load(session) -> list[Notification]:
        rows = await session.scalars(
            select(Notification)
            .where(Notification.type == type_, Notification.user_id == user_id)
            .order_by(Notification.id)
        )
        return list(rows)

    return db(load)


def count_notifications(db) -> int:
    async def count(session) -> int:
        return len(list(await session.scalars(select(Notification.id))))

    return db(count)


def credit_earlier(db, make_project, ids: dict[str, int], volunteer: str, hours: str) -> None:
    """Години, нараховані раніше за іншу подію: від них залежить рівень волонтера."""
    other_project = make_project(ids["org"])

    async def create(session) -> None:
        session.add(
            Attendance(project_id=other_project, user_id=ids[volunteer], hours=Decimal(hours))
        )

    db(create)


# =====================================================================
# Нарахування
# =====================================================================


def test_confirm_credits_default_explicit_and_zero_hours(client: TestClient, db, event) -> None:
    sign_in(client, event["owner"])

    response = confirm(
        client,
        event["project"],
        {"user_id": event["alice"]},
        {"user_id": event["bob"], "hours": "3.5"},
        {"user_id": event["carol"], "hours": "0"},
    )

    assert response.status_code == 201
    by_user = {item["user_id"]: item for item in response.json()}
    assert by_user[event["alice"]]["hours"] == "2.00"
    assert by_user[event["bob"]]["hours"] == "3.50"
    assert by_user[event["carol"]]["hours"] == "0.00"
    assert all(item["confirmed_by"] == event["owner"] for item in by_user.values())
    assert all(item["project_id"] == event["project"] for item in by_user.values())
    saved = load_attendances(db, event["project"])
    assert {user: row.hours for user, row in saved.items()} == {
        event["alice"]: Decimal("2.00"),
        event["bob"]: Decimal("3.50"),
        event["carol"]: Decimal("0.00"),
    }


def test_admin_can_confirm(client: TestClient, db, event) -> None:
    sign_in(client, event["admin"])

    response = confirm(client, event["project"], {"user_id": event["alice"]})

    assert response.status_code == 201
    assert load_attendances(db, event["project"])[event["alice"]].confirmed_by == event["admin"]


def test_hours_may_exceed_planned_hours(client: TestClient, db, event) -> None:
    sign_in(client, event["owner"])

    response = confirm(client, event["project"], {"user_id": event["alice"], "hours": "7.25"})

    assert response.status_code == 201
    assert response.json()[0]["hours"] == "7.25"


def test_confirm_sends_hours_credited_including_zero(client: TestClient, db, event) -> None:
    sign_in(client, event["owner"])

    confirm(
        client,
        event["project"],
        {"user_id": event["alice"], "hours": "2.5"},
        {"user_id": event["carol"], "hours": "0"},
    )

    (credited,) = load_notifications(db, NotificationTypeEnum.hours_credited, event["alice"])
    assert "2.5 год" in credited.message
    assert "Прибирання парку" in credited.message
    assert credited.link == f"/projects/{event['project']}"
    (absent,) = load_notifications(db, NotificationTypeEnum.hours_credited, event["carol"])
    assert "не нараховано" in absent.message
    # Тим, кого не підтверджували, нічого не надходить
    assert load_notifications(db, NotificationTypeEnum.hours_credited, event["bob"]) == []


def test_confirm_does_not_create_level_up_without_a_new_level(
    client: TestClient, db, event
) -> None:
    sign_in(client, event["owner"])

    confirm(client, event["project"], {"user_id": event["alice"]})

    assert load_notifications(db, NotificationTypeEnum.level_up, event["alice"]) == []


def test_confirm_sends_level_up_when_hours_cross_a_level_boundary(
    client: TestClient, db, event, make_project
) -> None:
    # 48 + 2 = 50: верхня межа рівня включно, тож рівень ще novice
    credit_earlier(db, make_project, event, "alice", "48")
    # 49 + 2 = 51: уже interested
    credit_earlier(db, make_project, event, "bob", "49")
    sign_in(client, event["owner"])

    confirm(client, event["project"], {"user_id": event["alice"]}, {"user_id": event["bob"]})

    assert load_notifications(db, NotificationTypeEnum.level_up, event["alice"]) == []
    (level_up,) = load_notifications(db, NotificationTypeEnum.level_up, event["bob"])
    assert "Зацікавлений" in level_up.message


def test_no_show_does_not_raise_level(client: TestClient, db, event, make_project) -> None:
    credit_earlier(db, make_project, event, "alice", "50")
    sign_in(client, event["owner"])

    confirm(client, event["project"], {"user_id": event["alice"], "hours": "0"})

    assert load_notifications(db, NotificationTypeEnum.level_up, event["alice"]) == []


# =====================================================================
# Подвійне нарахування
# =====================================================================


def test_second_confirmation_of_same_volunteer_is_conflict(client: TestClient, db, event) -> None:
    sign_in(client, event["owner"])
    confirm(client, event["project"], {"user_id": event["alice"], "hours": "2"})

    response = confirm(client, event["project"], {"user_id": event["alice"], "hours": "5"})

    assert response.status_code == 409
    detail = response.json()["detail"][0]
    assert detail["loc"] == ["body", "entries"]
    assert detail["type"] == "attendance_already_confirmed"
    assert str(event["alice"]) in detail["msg"]
    # Години першого підтвердження не змінилися, дубліката немає
    saved = load_attendances(db, event["project"])
    assert len(saved) == 1
    assert saved[event["alice"]].hours == Decimal("2.00")


def test_batch_with_one_already_confirmed_volunteer_saves_nothing(
    client: TestClient, db, event
) -> None:
    sign_in(client, event["owner"])
    confirm(client, event["project"], {"user_id": event["alice"]})
    notifications_before = count_notifications(db)

    response = confirm(
        client, event["project"], {"user_id": event["alice"]}, {"user_id": event["bob"]}
    )

    assert response.status_code == 409
    assert set(load_attendances(db, event["project"])) == {event["alice"]}
    assert count_notifications(db) == notifications_before


def test_same_volunteer_twice_in_one_batch_is_rejected(client: TestClient, db, event) -> None:
    sign_in(client, event["owner"])

    response = confirm(
        client, event["project"], {"user_id": event["alice"]}, {"user_id": event["alice"]}
    )

    assert response.status_code == 422
    assert load_attendances(db, event["project"]) == {}


# =====================================================================
# Кого можна підтвердити
# =====================================================================


def test_only_accepted_participants_can_be_confirmed(client: TestClient, db, event) -> None:
    sign_in(client, event["owner"])

    response = confirm(
        client,
        event["project"],
        {"user_id": event["alice"]},
        {"user_id": event["pending"]},
        {"user_id": event["rejected"]},
        {"user_id": event["stranger"]},
    )

    assert response.status_code == 422
    detail = response.json()["detail"][0]
    assert detail["loc"] == ["body", "entries"]
    assert detail["type"] == "not_accepted_participants"
    for name in ("pending", "rejected", "stranger"):
        assert str(event[name]) in detail["msg"]
    assert str(event["alice"]) not in detail["msg"]
    # Усе або нічого: схваленого волонтера з того ж пакета теж не збережено
    assert load_attendances(db, event["project"]) == {}
    assert count_notifications(db) == 0


def test_cancelled_application_does_not_count(client: TestClient, db, event, make_user) -> None:
    withdrawn = make_user()
    add_request(db, event["org"], event["project"], withdrawn, JoinRequestStatusEnum.cancelled)
    sign_in(client, event["owner"])

    response = confirm(client, event["project"], {"user_id": withdrawn})

    assert response.status_code == 422


def test_accepted_for_another_project_does_not_count(
    client: TestClient, db, event, make_project, make_user
) -> None:
    other_project = make_project(event["org"])
    volunteer = make_user()
    add_request(db, event["org"], other_project, volunteer)
    sign_in(client, event["owner"])

    response = confirm(client, event["project"], {"user_id": volunteer})

    assert response.status_code == 422


# =====================================================================
# Подія має завершитися
# =====================================================================


def test_ongoing_event_cannot_be_confirmed(client: TestClient, db, event, make_project) -> None:
    now = datetime.now(UTC)
    ongoing = make_project(
        event["org"], starts_at=now - timedelta(hours=1), ends_at=now + timedelta(hours=1)
    )
    add_request(db, event["org"], ongoing, event["alice"])
    sign_in(client, event["owner"])

    response = confirm(client, ongoing, {"user_id": event["alice"]})

    assert response.status_code == 409
    assert load_attendances(db, ongoing) == {}


def test_future_event_cannot_be_confirmed(client: TestClient, db, event, make_project) -> None:
    now = datetime.now(UTC)
    future = make_project(
        event["org"], starts_at=now + timedelta(days=1), ends_at=now + timedelta(days=2)
    )
    add_request(db, event["org"], future, event["alice"])
    sign_in(client, event["owner"])

    assert confirm(client, future, {"user_id": event["alice"]}).status_code == 409


def test_completed_project_can_be_confirmed_even_before_planned_end(
    client: TestClient, db, event, make_project
) -> None:
    # Організатор міг завершити проєкт раніше за ends_at: подія для нього скінчилася
    now = datetime.now(UTC)
    completed = make_project(
        event["org"],
        status=ProjectStatusEnum.completed,
        starts_at=now - timedelta(hours=2),
        ends_at=now + timedelta(hours=2),
    )
    add_request(db, event["org"], completed, event["alice"])
    sign_in(client, event["owner"])

    assert confirm(client, completed, {"user_id": event["alice"]}).status_code == 201


def test_cancelled_project_cannot_be_confirmed(client: TestClient, db, event, make_project) -> None:
    cancelled = make_project(event["org"], status=ProjectStatusEnum.cancelled)
    add_request(db, event["org"], cancelled, event["alice"])
    sign_in(client, event["owner"])

    assert confirm(client, cancelled, {"user_id": event["alice"]}).status_code == 409


def test_draft_project_cannot_be_confirmed(client: TestClient, db, event, make_project) -> None:
    draft = make_project(event["org"], status=ProjectStatusEnum.draft, published_at=None)
    sign_in(client, event["owner"])

    assert confirm(client, draft, {"user_id": event["alice"]}).status_code == 409


# =====================================================================
# Права
# =====================================================================


def test_member_cannot_confirm(client: TestClient, db, event) -> None:
    sign_in(client, event["member"])

    response = confirm(client, event["project"], {"user_id": event["alice"]})

    assert response.status_code == 403
    assert load_attendances(db, event["project"]) == {}


def test_outsider_sees_no_such_project(client: TestClient, db, event) -> None:
    sign_in(client, event["outsider"])

    assert confirm(client, event["project"], {"user_id": event["alice"]}).status_code == 404


def test_owner_of_another_organization_sees_no_such_project(
    client: TestClient, db, event, make_user, city_id: int
) -> None:
    other_owner = make_user()

    async def create(session) -> None:
        org = Organization(
            name="Інший фонд",
            email="other@example.com",
            phone="+380679998877",
            city_id=city_id,
            status=OrgStatusEnum.approved,
            created_by=other_owner,
        )
        org.members.append(OrganizationMember(user_id=other_owner, role=OrgMemberRoleEnum.owner))
        session.add(org)

    db(create)
    sign_in(client, other_owner)

    assert confirm(client, event["project"], {"user_id": event["alice"]}).status_code == 404


def test_unknown_project_is_not_found(client: TestClient, event) -> None:
    sign_in(client, event["owner"])

    assert confirm(client, 999999, {"user_id": event["alice"]}).status_code == 404


def test_anonymous_gets_401(client: TestClient, event) -> None:
    assert confirm(client, event["project"], {"user_id": event["alice"]}).status_code == 401
    assert client.get(f"/api/projects/{event['project']}/attendances").status_code == 401
    assert correct(client, event["project"], event["alice"], "1").status_code == 401


def test_blocked_organization_cannot_confirm(client: TestClient, db, event) -> None:
    async def block(session) -> None:
        (await session.get(Organization, event["org"])).status = OrgStatusEnum.blocked

    db(block)
    sign_in(client, event["owner"])

    assert confirm(client, event["project"], {"user_id": event["alice"]}).status_code == 403


# =====================================================================
# Перевірка тіла запиту
# =====================================================================


@pytest.mark.parametrize("hours", ["-1", "-0.5", "1000", "2.001", "abc"])
def test_invalid_hours_are_rejected(client: TestClient, db, event, hours: str) -> None:
    sign_in(client, event["owner"])

    response = confirm(client, event["project"], {"user_id": event["alice"], "hours": hours})

    assert response.status_code == 422
    assert load_attendances(db, event["project"]) == {}


def test_maximum_hours_are_accepted(client: TestClient, event) -> None:
    sign_in(client, event["owner"])

    response = confirm(client, event["project"], {"user_id": event["alice"], "hours": "999.99"})

    assert response.status_code == 201


@pytest.mark.parametrize(
    "body",
    [
        {"entries": []},
        {},
        {"entries": [{"hours": "1"}]},
        {"entries": [{"user_id": 0}]},
        {"entries": [{"user_id": 1, "extra": True}]},
        {"entries": [{"user_id": i} for i in range(1, 102)]},
    ],
)
def test_malformed_body_is_rejected(client: TestClient, event, body: dict) -> None:
    sign_in(client, event["owner"])

    response = client.post(f"/api/projects/{event['project']}/attendances", json=body)

    assert response.status_code == 422


# =====================================================================
# Виправлення годин
# =====================================================================


def test_correct_hours_changes_the_existing_record(client: TestClient, db, event) -> None:
    sign_in(client, event["owner"])
    first = confirm(client, event["project"], {"user_id": event["alice"], "hours": "2"}).json()[0]

    response = correct(client, event["project"], event["alice"], "3.25")

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == first["id"]
    assert data["hours"] == "3.25"
    # confirmed_at лишається часом першого підтвердження, updated_at — час виправлення
    assert data["confirmed_at"] == first["confirmed_at"]
    assert data["updated_at"] >= first["updated_at"]
    saved = load_attendances(db, event["project"])
    assert len(saved) == 1
    assert saved[event["alice"]].hours == Decimal("3.25")


def test_correct_hours_notifies_the_volunteer(client: TestClient, db, event) -> None:
    sign_in(client, event["owner"])
    confirm(client, event["project"], {"user_id": event["alice"], "hours": "2"})

    correct(client, event["project"], event["alice"], "4")

    credited = load_notifications(db, NotificationTypeEnum.hours_credited, event["alice"])
    assert len(credited) == 2
    assert credited[1].title == "Години змінено"
    assert "4 год" in credited[1].message


def test_correct_with_same_hours_does_nothing(client: TestClient, db, event) -> None:
    sign_in(client, event["owner"])
    confirm(client, event["project"], {"user_id": event["alice"], "hours": "2"})
    notifications_before = count_notifications(db)

    response = correct(client, event["project"], event["alice"], "2.00")

    assert response.status_code == 200
    assert count_notifications(db) == notifications_before


def test_correct_can_turn_no_show_into_attendance(client: TestClient, db, event) -> None:
    sign_in(client, event["owner"])
    confirm(client, event["project"], {"user_id": event["alice"], "hours": "0"})

    response = correct(client, event["project"], event["alice"], "2")

    assert response.status_code == 200
    assert load_attendances(db, event["project"])[event["alice"]].hours == Decimal("2.00")


def test_correct_sends_level_up_only_when_the_level_rises(
    client: TestClient, db, event, make_project
) -> None:
    credit_earlier(db, make_project, event, "alice", "49")
    sign_in(client, event["owner"])
    confirm(client, event["project"], {"user_id": event["alice"], "hours": "1"})
    assert load_notifications(db, NotificationTypeEnum.level_up, event["alice"]) == []

    # 49 + 2 = 51: рівень піднявся
    correct(client, event["project"], event["alice"], "2")
    assert len(load_notifications(db, NotificationTypeEnum.level_up, event["alice"])) == 1

    # Назад до 50 рівень падає: про це не сповіщаємо
    correct(client, event["project"], event["alice"], "1")
    assert len(load_notifications(db, NotificationTypeEnum.level_up, event["alice"])) == 1


def test_correct_unknown_attendance_is_not_found(client: TestClient, event) -> None:
    sign_in(client, event["owner"])

    assert correct(client, event["project"], event["alice"], "2").status_code == 404


def test_correct_does_not_touch_other_projects(client: TestClient, db, event, make_project) -> None:
    other_project = make_project(event["org"])
    add_request(db, event["org"], other_project, event["alice"])
    sign_in(client, event["owner"])
    confirm(client, other_project, {"user_id": event["alice"], "hours": "5"})

    # У цьому проєкті участі Аліси ще немає, тож виправляти нічого
    assert correct(client, event["project"], event["alice"], "1").status_code == 404
    assert load_attendances(db, other_project)[event["alice"]].hours == Decimal("5.00")


def test_member_cannot_correct(client: TestClient, db, event) -> None:
    sign_in(client, event["owner"])
    confirm(client, event["project"], {"user_id": event["alice"], "hours": "2"})
    sign_in(client, event["member"])

    assert correct(client, event["project"], event["alice"], "9").status_code == 403
    assert load_attendances(db, event["project"])[event["alice"]].hours == Decimal("2.00")


def test_outsider_cannot_correct(client: TestClient, event) -> None:
    sign_in(client, event["outsider"])

    assert correct(client, event["project"], event["alice"], "9").status_code == 404


@pytest.mark.parametrize("hours", ["-1", "1000", "2.001"])
def test_correct_rejects_invalid_hours(client: TestClient, db, event, hours: str) -> None:
    sign_in(client, event["owner"])
    confirm(client, event["project"], {"user_id": event["alice"], "hours": "2"})

    assert correct(client, event["project"], event["alice"], hours).status_code == 422
    assert load_attendances(db, event["project"])[event["alice"]].hours == Decimal("2.00")


def test_correct_rejects_extra_fields(client: TestClient, event) -> None:
    sign_in(client, event["owner"])

    response = client.patch(
        f"/api/projects/{event['project']}/attendances/{event['alice']}",
        json={"hours": "1", "user_id": event["bob"]},
    )

    assert response.status_code == 422


# =====================================================================
# Список учасників для підтвердження
# =====================================================================


def test_list_shows_accepted_participants_with_attendance(client: TestClient, db, event) -> None:
    sign_in(client, event["owner"])
    confirm(client, event["project"], {"user_id": event["alice"], "hours": "2.5"})

    response = client.get(f"/api/projects/{event['project']}/attendances")

    assert response.status_code == 200
    rows = {row["user"]["id"]: row for row in response.json()}
    # Лише схвалені: ні заявка на розгляді, ні відхилена, ні стороній користувач
    assert set(rows) == {event["alice"], event["bob"], event["carol"]}
    assert rows[event["alice"]]["attendance"]["hours"] == "2.50"
    assert rows[event["bob"]]["attendance"] is None
    assert rows[event["carol"]]["attendance"] is None
    # Організація не бачить контактів: лише коротку картку
    assert "email" not in rows[event["alice"]]["user"]
    assert "phone" not in rows[event["alice"]]["user"]


def test_list_paginates_in_a_stable_order(client: TestClient, event) -> None:
    sign_in(client, event["admin"])
    url = f"/api/projects/{event['project']}/attendances"

    first = client.get(url, params={"limit": 2}).json()
    second = client.get(url, params={"limit": 2, "offset": 2}).json()

    assert len(first) == 2
    assert len(second) == 1
    ids = [row["user"]["id"] for row in first + second]
    assert len(set(ids)) == 3


def test_list_is_forbidden_for_a_member_and_hidden_from_an_outsider(
    client: TestClient, event
) -> None:
    url = f"/api/projects/{event['project']}/attendances"

    sign_in(client, event["member"])
    assert client.get(url).status_code == 403

    sign_in(client, event["outsider"])
    assert client.get(url).status_code == 404


def test_list_of_unknown_project_is_not_found(client: TestClient, event) -> None:
    sign_in(client, event["owner"])

    assert client.get("/api/projects/999999/attendances").status_code == 404


def test_list_is_available_before_the_event_ends(
    client: TestClient, db, event, make_project
) -> None:
    now = datetime.now(UTC)
    future = make_project(
        event["org"], starts_at=now + timedelta(days=1), ends_at=now + timedelta(days=2)
    )
    add_request(db, event["org"], future, event["alice"])
    sign_in(client, event["owner"])

    response = client.get(f"/api/projects/{future}/attendances")

    assert response.status_code == 200
    assert [row["attendance"] for row in response.json()] == [None]


# =====================================================================
# Пов'язані з участю обчислення
# =====================================================================


def test_confirmed_hours_are_visible_in_the_applicant_list(
    client: TestClient, db, event, make_project, make_user
) -> None:
    # Нараховані години одразу потрапляють у баланс волонтера, який бачить організація
    # в заявках на інші проєкти (R-27): окремого стовпця з балансом немає
    sign_in(client, event["owner"])
    confirm(client, event["project"], {"user_id": event["alice"], "hours": "40.5"})
    upcoming = make_project(
        event["org"],
        starts_at=datetime.now(UTC) + timedelta(days=5),
        ends_at=datetime.now(UTC) + timedelta(days=6),
    )
    add_request(db, event["org"], upcoming, event["alice"], JoinRequestStatusEnum.pending)

    response = client.get(f"/api/projects/{upcoming}/join-requests")

    (row,) = response.json()
    assert Decimal(row["user"]["confirmed_hours"]) == Decimal("40.5")
    assert row["user"]["experience_level"] == "novice"


# =====================================================================
# Паралельні нарахування одному волонтеру
# =====================================================================


def capture_statements(client: TestClient, request) -> list[str]:
    statements: list[str] = []

    def capture(conn, cursor, statement, parameters, context, executemany) -> None:
        statements.append(statement)

    sa_event.listen(engine.sync_engine, "before_cursor_execute", capture)
    try:
        assert request().status_code in (200, 201)
    finally:
        sa_event.remove(engine.sync_engine, "before_cursor_execute", capture)
    return statements


def assert_volunteers_locked_before_totals(statements: list[str]) -> None:
    # Паралельне нарахування тому ж волонтеру чекає на блокування й рахує суму годин уже
    # з урахуванням першого, тож level_up не губиться й не дублюється
    locked = next(
        index
        for index, statement in enumerate(statements)
        if "FROM users" in statement and "FOR NO KEY UPDATE" in statement
    )
    summed = next(
        index for index, statement in enumerate(statements) if "sum(attendances.hours)" in statement
    )
    assert locked < summed


def test_confirm_locks_volunteers_before_summing_their_hours(client: TestClient, event) -> None:
    sign_in(client, event["owner"])

    statements = capture_statements(
        client,
        lambda: confirm(
            client,
            event["project"],
            {"user_id": event["bob"]},
            {"user_id": event["alice"]},
        ),
    )

    assert_volunteers_locked_before_totals(statements)


def test_correct_locks_volunteer_before_summing_hours(client: TestClient, event) -> None:
    sign_in(client, event["owner"])
    confirm(client, event["project"], {"user_id": event["alice"], "hours": "2"})

    statements = capture_statements(
        client, lambda: correct(client, event["project"], event["alice"], "3")
    )

    assert_volunteers_locked_before_totals(statements)
