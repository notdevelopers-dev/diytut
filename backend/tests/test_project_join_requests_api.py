from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import auth
from app.models import (
    Attendance,
    City,
    JoinRequest,
    JoinRequestStatusEnum,
    JoinRequestTargetEnum,
    Notification,
    NotificationTypeEnum,
    Organization,
    OrganizationIgnoredUser,
    OrganizationMember,
    OrgMemberRoleEnum,
    OrgStatusEnum,
    Project,
    ProjectStatusEnum,
    User,
)
from app.models.experience import ExperienceLevelEnum, level_for_hours
from app.services.project_join_requests import reapply_delay


def sign_in(client: TestClient, user_id: int) -> None:
    token = auth._encode({"sub": str(user_id), "typ": "session"}, auth.SESSION_TTL)
    client.cookies.set("session", token, path="/api")


def requests_url(project_id: int | str) -> str:
    return f"/api/projects/{project_id}/join-requests"


def status_url(project_id: int | str) -> str:
    return f"/api/projects/{project_id}/my-request-status"


def my_request_url(project_id: int | str) -> str:
    return f"/api/projects/{project_id}/my-request"


def review_url(join_request_id: int) -> str:
    return f"/api/join-requests/{join_request_id}"


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

    def make(birth_date: date = date(1990, 3, 9)) -> int:
        n = next(counter)

        async def create(session) -> int:
            user = User(
                google_sub=f"google-{n}",
                email=f"user{n}@example.com",
                first_name="Тарас",
                last_name="Шевченко",
                nickname=f"user_{n}",
                phone="+380671234567",
                birth_date=birth_date,
                city_id=city_id,
            )
            session.add(user)
            await session.flush()
            return user.id

        return db(create)

    return make


@pytest.fixture
def make_org(db, city_id: int, make_user):
    """Організація з власником; повертає (id організації, id власника)."""
    counter = iter(range(1, 1000))

    def make(status=OrgStatusEnum.approved) -> tuple[int, int]:
        n = next(counter)
        owner_id = make_user()

        async def create(session) -> int:
            org = Organization(
                name=f"Фонд {n}",
                email=f"fund{n}@example.com",
                phone="+380671112233",
                city_id=city_id,
                status=status,
                created_by=owner_id,
            )
            org.members.append(OrganizationMember(user_id=owner_id, role=OrgMemberRoleEnum.owner))
            session.add(org)
            await session.flush()
            return org.id

        return db(create), owner_id

    return make


@pytest.fixture
def make_project(db):
    def make(organization_id: int, **changes) -> int:
        starts_at = changes.pop("starts_at", datetime.now(UTC) + timedelta(days=7))

        fields = {
            "title": "Толока",
            "description": "Опис",
            "is_online": True,
            "capacity": 10,
            "volunteer_hours": Decimal("2"),
            "status": ProjectStatusEnum.published,
        } | changes
        if fields["status"] != ProjectStatusEnum.draft:
            fields.setdefault("published_at", datetime.now(UTC))

        async def create(session) -> int:
            project = Project(
                organization_id=organization_id,
                starts_at=starts_at,
                ends_at=starts_at + timedelta(hours=3),
                **fields,
            )
            session.add(project)
            await session.flush()
            return project.id

        return db(create)

    return make


def add_member(db, organization_id: int, user_id: int, role: OrgMemberRoleEnum) -> None:
    async def create(session) -> None:
        session.add(OrganizationMember(organization_id=organization_id, user_id=user_id, role=role))
        await session.flush()

    db(create)


def add_hours(db, user_id: int, project_id: int, hours: str) -> None:
    async def create(session) -> None:
        session.add(Attendance(project_id=project_id, user_id=user_id, hours=Decimal(hours)))
        await session.flush()

    db(create)


def add_request(db, organization_id: int, project_id: int, user_id: int, **changes) -> int:
    async def create(session) -> int:
        request = JoinRequest(
            user_id=user_id,
            organization_id=organization_id,
            project_id=project_id,
            target=JoinRequestTargetEnum.project,
            **changes,
        )
        session.add(request)
        await session.flush()
        return request.id

    return db(create)


def get_request(db, request_id: int) -> JoinRequest:
    async def fetch(session) -> JoinRequest:
        return await session.get(JoinRequest, request_id, populate_existing=True)

    return db(fetch)


def get_notifications(db, user_id: int) -> list[Notification]:
    async def fetch(session) -> list[Notification]:
        result = await session.scalars(
            select(Notification).where(Notification.user_id == user_id).order_by(Notification.id)
        )
        return list(result)

    return db(fetch)


@pytest.fixture
def setup(make_org, make_project, make_user) -> dict[str, int]:
    org_id, owner_id = make_org()
    return {
        "org": org_id,
        "owner": owner_id,
        "project": make_project(org_id),
        "volunteer": make_user(),
    }


# --- рівні досвіду (R-27) ---


@pytest.mark.parametrize(
    ("hours", "level"),
    [
        ("0", ExperienceLevelEnum.novice),
        ("50", ExperienceLevelEnum.novice),
        ("50.5", ExperienceLevelEnum.interested),
        ("150", ExperienceLevelEnum.interested),
        ("300", ExperienceLevelEnum.amateur),
        ("500", ExperienceLevelEnum.experienced),
        ("500.01", ExperienceLevelEnum.pro),
        ("2000", ExperienceLevelEnum.pro),
    ],
)
def test_level_for_hours(hours: str, level: ExperienceLevelEnum) -> None:
    assert level_for_hours(Decimal(hours)) is level


# --- подання заявки (R-23) ---


def test_apply_creates_request_and_notifies_owner(client, db, setup) -> None:
    sign_in(client, setup["volunteer"])

    response = client.post(requests_url(setup["project"]), json={"message": "Буду"})

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending"
    assert body["target"] == "project"
    assert body["project_id"] == setup["project"]
    assert body["organization_id"] == setup["org"]
    assert body["message"] == "Буду"
    [notification] = get_notifications(db, setup["owner"])
    assert notification.type is NotificationTypeEnum.join_request_received
    assert notification.link == (
        f"/organization/projects/{setup['project']}/join-requests?organization_id={setup['org']}"
    )


def test_apply_notifies_admins_but_not_plain_members(client, db, make_user, setup) -> None:
    admin_id, member_id = make_user(), make_user()
    add_member(db, setup["org"], admin_id, OrgMemberRoleEnum.admin)
    add_member(db, setup["org"], member_id, OrgMemberRoleEnum.member)
    sign_in(client, setup["volunteer"])

    client.post(requests_url(setup["project"]), json={})

    [notification] = get_notifications(db, admin_id)
    assert notification.type is NotificationTypeEnum.join_request_received
    assert get_notifications(db, member_id) == []


def test_apply_does_not_require_membership_and_message(client, setup) -> None:
    sign_in(client, setup["volunteer"])

    assert client.post(requests_url(setup["project"]), json={}).status_code == 201


def test_apply_requires_auth(client, setup) -> None:
    assert client.post(requests_url(setup["project"]), json={}).status_code == 401


@pytest.mark.parametrize("status", [JoinRequestStatusEnum.pending, JoinRequestStatusEnum.accepted])
def test_apply_twice_conflicts(client, db, setup, status) -> None:
    add_request(db, setup["org"], setup["project"], setup["volunteer"], status=status)
    sign_in(client, setup["volunteer"])

    response = client.post(requests_url(setup["project"]), json={})

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Join request to this project is already pending or accepted"
    }


@pytest.mark.parametrize(
    ("rejections", "delay"),
    [
        (1, timedelta(seconds=10)),
        (2, timedelta(seconds=50)),
        (3, timedelta(seconds=250)),
        (5, timedelta(seconds=6250)),
        (7, timedelta(seconds=156_250)),
        (8, timedelta(weeks=1)),
        (1000, timedelta(weeks=1)),
    ],
)
def test_reapply_delay_grows_fivefold_up_to_a_week(rejections, delay) -> None:
    assert reapply_delay(rejections) == delay


def add_rejections(db, setup, count: int, last_rejected_at: datetime) -> None:
    for n in range(count):
        add_request(
            db, setup["org"], setup["project"], setup["volunteer"],
            status=JoinRequestStatusEnum.rejected,
            reviewed_at=last_rejected_at - timedelta(days=30 * (count - 1 - n)),
        )  # fmt: skip


def test_apply_right_after_rejection_is_too_soon(client, db, setup) -> None:
    add_rejections(db, setup, 1, datetime.now(UTC))
    sign_in(client, setup["volunteer"])

    response = client.post(requests_url(setup["project"]), json={})

    assert response.status_code == 429
    assert 1 <= int(response.headers["Retry-After"]) <= 10


def test_apply_after_rejection_delay(client, db, setup) -> None:
    add_rejections(db, setup, 1, datetime.now(UTC) - timedelta(seconds=11))
    sign_in(client, setup["volunteer"])

    assert client.post(requests_url(setup["project"]), json={}).status_code == 201


def test_delay_counts_all_rejections_on_project(client, db, setup) -> None:
    # Третя відмова — пауза 250 с: через хвилину ще зарано
    add_rejections(db, setup, 3, datetime.now(UTC) - timedelta(minutes=1))
    sign_in(client, setup["volunteer"])

    response = client.post(requests_url(setup["project"]), json={})

    assert response.status_code == 429
    assert 180 < int(response.headers["Retry-After"]) <= 190


def test_rejection_on_other_project_does_not_delay(client, db, make_project, setup) -> None:
    add_rejections(db, setup, 1, datetime.now(UTC))
    other_project = make_project(setup["org"])
    sign_in(client, setup["volunteer"])

    assert client.post(requests_url(other_project), json={}).status_code == 201


def test_apply_again_after_cancel(client, db, setup) -> None:
    add_request(
        db, setup["org"], setup["project"], setup["volunteer"],
        status=JoinRequestStatusEnum.cancelled,
    )  # fmt: skip
    sign_in(client, setup["volunteer"])

    assert client.post(requests_url(setup["project"]), json={}).status_code == 201


@pytest.mark.parametrize(
    "changes",
    [
        {"status": ProjectStatusEnum.draft},
        {"status": ProjectStatusEnum.cancelled},
    ],
)
def test_apply_to_unpublished_project(client, make_project, setup, changes) -> None:
    project_id = make_project(setup["org"], **changes)
    sign_in(client, setup["volunteer"])

    assert client.post(requests_url(project_id), json={}).status_code == 404


def test_apply_to_project_of_unapproved_organization(client, make_org, make_project, setup) -> None:
    org_id, _ = make_org(status=OrgStatusEnum.blocked)
    project_id = make_project(org_id)
    sign_in(client, setup["volunteer"])

    assert client.post(requests_url(project_id), json={}).status_code == 404


def test_apply_to_started_project(client, make_project, setup) -> None:
    project_id = make_project(setup["org"], starts_at=datetime.now(UTC) - timedelta(hours=1))
    sign_in(client, setup["volunteer"])

    response = client.post(requests_url(project_id), json={})

    assert response.status_code == 409
    assert response.json() == {"detail": "Project has already started"}


@pytest.mark.parametrize("role", [OrgMemberRoleEnum.owner, OrgMemberRoleEnum.admin])
def test_organizer_cannot_apply(client, db, make_user, setup, role) -> None:
    organizer_id = setup["owner"]
    if role is OrgMemberRoleEnum.admin:
        organizer_id = make_user()
        add_member(db, setup["org"], organizer_id, role)
    sign_in(client, organizer_id)

    assert client.post(requests_url(setup["project"]), json={}).status_code == 409


def test_plain_member_can_apply(client, db, setup) -> None:
    add_member(db, setup["org"], setup["volunteer"], OrgMemberRoleEnum.member)
    sign_in(client, setup["volunteer"])

    assert client.post(requests_url(setup["project"]), json={}).status_code == 201


# Подія наступного року 15 червня о 13:00 за Києвом: фіксована дата без 29 лютого
EVENT_YEAR = datetime.now(UTC).year + 1
EVENT_AT = datetime(EVENT_YEAR, 6, 15, 10, 0, tzinfo=UTC)


@pytest.mark.parametrize(
    ("starts_at", "birth_date", "expected"),
    [
        # 18 виповниться наступного дня після події
        (EVENT_AT, date(EVENT_YEAR - 18, 6, 16), 403),
        # 18 виповнюється в день події
        (EVENT_AT, date(EVENT_YEAR - 18, 6, 15), 201),
        # 22:30 UTC 14 червня — це вже 15 червня за Києвом, день повноліття
        (datetime(EVENT_YEAR, 6, 14, 22, 30, tzinfo=UTC), date(EVENT_YEAR - 18, 6, 15), 201),
    ],
    ids=["minor", "turns_18_that_day", "kyiv_date_not_utc"],
)
def test_adult_only_project(
    client, make_user, make_project, setup, starts_at, birth_date, expected
) -> None:
    project_id = make_project(setup["org"], is_adult_only=True, starts_at=starts_at)
    sign_in(client, make_user(birth_date=birth_date))

    response = client.post(requests_url(project_id), json={})

    assert response.status_code == expected
    if expected == 403:
        assert response.json() == {"detail": "Project is for adults only"}


def test_minor_applicant_allowed_for_regular_project_rejected_for_adult_only(
    client, make_user, make_project, setup
) -> None:
    minor_user_id = make_user(birth_date=date(EVENT_YEAR - 15, 1, 1))
    sign_in(client, minor_user_id)

    regular_project_id = make_project(setup["org"], is_adult_only=False, starts_at=EVENT_AT)
    adult_project_id = make_project(setup["org"], is_adult_only=True, starts_at=EVENT_AT)

    response = client.post(requests_url(regular_project_id), json={})
    assert response.status_code == 201

    response_adult = client.post(requests_url(adult_project_id), json={})
    assert response_adult.status_code == 403
    assert response_adult.json() == {"detail": "Project is for adults only"}


def test_level_requirement(client, db, make_project, setup) -> None:
    project_id = make_project(setup["org"], experience_level=ExperienceLevelEnum.interested)
    sign_in(client, setup["volunteer"])

    response = client.post(requests_url(project_id), json={})
    assert response.status_code == 403
    assert response.json() == {"detail": "Experience level is too low for this project"}

    past_project = make_project(setup["org"])
    add_hours(db, setup["volunteer"], past_project, "51")
    assert client.post(requests_url(project_id), json={}).status_code == 201


def test_apply_to_full_project(client, db, make_user, make_project, setup) -> None:
    project_id = make_project(setup["org"], capacity=1)
    add_request(db, setup["org"], project_id, make_user(), status=JoinRequestStatusEnum.accepted)
    sign_in(client, setup["volunteer"])

    response = client.post(requests_url(project_id), json={})

    assert response.status_code == 409
    assert response.json() == {"detail": "Project has no free places"}


# --- власна заявка волонтера ---


def test_read_my_request(client, db, setup) -> None:
    sign_in(client, setup["volunteer"])
    assert client.get(status_url(setup["project"])).status_code == 404

    request_id = add_request(db, setup["org"], setup["project"], setup["volunteer"])

    response = client.get(status_url(setup["project"]))
    assert response.status_code == 200
    assert response.json()["id"] == request_id
    assert response.json()["can_reapply_at"] is None


@pytest.mark.parametrize("status", [JoinRequestStatusEnum.pending, JoinRequestStatusEnum.accepted])
def test_cancel_request(client, db, setup, status) -> None:
    request_id = add_request(db, setup["org"], setup["project"], setup["volunteer"], status=status)
    sign_in(client, setup["volunteer"])

    response = client.delete(my_request_url(setup["project"]))

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert get_request(db, request_id).status is JoinRequestStatusEnum.cancelled
    [notification] = get_notifications(db, setup["owner"])
    assert notification.type is NotificationTypeEnum.join_request_cancelled


def test_cancel_without_active_request(client, db, setup) -> None:
    add_request(
        db, setup["org"], setup["project"], setup["volunteer"],
        status=JoinRequestStatusEnum.rejected,
    )  # fmt: skip
    sign_in(client, setup["volunteer"])

    assert client.delete(my_request_url(setup["project"])).status_code == 404


def test_cancel_after_start(client, db, make_project, setup) -> None:
    project_id = make_project(setup["org"], starts_at=datetime.now(UTC) - timedelta(hours=1))
    request_id = add_request(db, setup["org"], project_id, setup["volunteer"])
    sign_in(client, setup["volunteer"])

    assert client.delete(my_request_url(project_id)).status_code == 409
    assert get_request(db, request_id).status is JoinRequestStatusEnum.pending


def test_list_my_project_requests(client, db, make_project, setup) -> None:
    other_project = make_project(setup["org"])
    first = add_request(db, setup["org"], setup["project"], setup["volunteer"])
    second = add_request(db, setup["org"], other_project, setup["volunteer"])
    sign_in(client, setup["volunteer"])

    response = client.get("/api/users/me/project-requests")

    assert response.status_code == 200
    body = response.json()
    assert [item["id"] for item in body] == [second, first]
    assert body[0]["project"]["id"] == other_project
    assert body[0]["project"]["title"] == "Толока"


# --- заявки в кабінеті організації (R-24, R-27) ---


def test_owner_lists_requests_with_level(client, db, make_project, setup) -> None:
    past_project = make_project(setup["org"])
    add_hours(db, setup["volunteer"], past_project, "160")
    request_id = add_request(db, setup["org"], setup["project"], setup["volunteer"])
    sign_in(client, setup["owner"])

    response = client.get(requests_url(setup["project"]))

    assert response.status_code == 200
    [item] = response.json()
    assert item["id"] == request_id
    assert item["user"]["id"] == setup["volunteer"]
    assert Decimal(item["user"]["confirmed_hours"]) == Decimal("160")
    assert item["user"]["experience_level"] == "amateur"


def test_list_filters_by_status(client, db, make_user, setup) -> None:
    add_request(db, setup["org"], setup["project"], setup["volunteer"])
    accepted = add_request(
        db, setup["org"], setup["project"], make_user(), status=JoinRequestStatusEnum.accepted
    )
    sign_in(client, setup["owner"])

    response = client.get(requests_url(setup["project"]), params={"status": "accepted"})

    assert [item["id"] for item in response.json()] == [accepted]
    assert response.json()[0]["user"]["experience_level"] == "novice"


def test_plain_member_cannot_list_requests(client, db, make_user, setup) -> None:
    member_id = make_user()
    add_member(db, setup["org"], member_id, OrgMemberRoleEnum.member)
    sign_in(client, member_id)

    assert client.get(requests_url(setup["project"])).status_code == 403


def test_outsider_cannot_list_requests(client, setup) -> None:
    sign_in(client, setup["volunteer"])

    assert client.get(requests_url(setup["project"])).status_code == 404


# --- розгляд заявки на проєкт ---


def test_accept_project_request(client, db, setup) -> None:
    request_id = add_request(db, setup["org"], setup["project"], setup["volunteer"])
    sign_in(client, setup["owner"])

    response = client.patch(review_url(request_id), json={"status": "accepted"})

    assert response.status_code == 200
    assert response.json()["status"] == "accepted"
    assert response.json()["reviewed_by"] == setup["owner"]
    [notification] = get_notifications(db, setup["volunteer"])
    assert notification.type is NotificationTypeEnum.join_request_accepted
    assert notification.link == f"/projects/{setup['project']}"
    assert "Толока" in notification.message


def test_accept_does_not_add_organization_member(client, db, setup) -> None:
    request_id = add_request(db, setup["org"], setup["project"], setup["volunteer"])
    sign_in(client, setup["owner"])
    client.patch(review_url(request_id), json={"status": "accepted"})

    async def fetch(session):
        return await session.get(OrganizationMember, (setup["org"], setup["volunteer"]))

    assert db(fetch) is None


def test_accept_respects_capacity(client, db, make_user, make_project, setup) -> None:
    project_id = make_project(setup["org"], capacity=1)
    first = add_request(db, setup["org"], project_id, setup["volunteer"])
    second = add_request(db, setup["org"], project_id, make_user())
    sign_in(client, setup["owner"])

    assert client.patch(review_url(first), json={"status": "accepted"}).status_code == 200
    response = client.patch(review_url(second), json={"status": "accepted"})

    assert response.status_code == 409
    assert response.json() == {"detail": "Project has no free places"}
    assert get_request(db, second).status is JoinRequestStatusEnum.pending
    # Відхилити можна й коли місць немає
    assert client.patch(review_url(second), json={"status": "rejected"}).status_code == 200


def test_cancelled_request_frees_place(client, db, make_user, make_project, setup) -> None:
    project_id = make_project(setup["org"], capacity=1)
    add_request(
        db, setup["org"], project_id, setup["volunteer"], status=JoinRequestStatusEnum.cancelled
    )
    waiting = add_request(db, setup["org"], project_id, make_user())
    sign_in(client, setup["owner"])

    assert client.patch(review_url(waiting), json={"status": "accepted"}).status_code == 200


def test_accept_after_start(client, db, make_project, setup) -> None:
    project_id = make_project(setup["org"], starts_at=datetime.now(UTC) - timedelta(hours=1))
    request_id = add_request(db, setup["org"], project_id, setup["volunteer"])
    sign_in(client, setup["owner"])

    response = client.patch(review_url(request_id), json={"status": "accepted"})

    assert response.status_code == 409
    assert response.json() == {"detail": "Project is not open for applications"}


def test_review_cancelled_request(client, db, setup) -> None:
    request_id = add_request(
        db, setup["org"], setup["project"], setup["volunteer"],
        status=JoinRequestStatusEnum.cancelled,
    )  # fmt: skip
    sign_in(client, setup["owner"])

    response = client.patch(review_url(request_id), json={"status": "accepted"})

    assert response.status_code == 409
    assert response.json() == {"detail": "Join request was cancelled by the volunteer"}


def test_other_organization_cannot_review(client, db, make_org, setup) -> None:
    request_id = add_request(db, setup["org"], setup["project"], setup["volunteer"])
    _, other_owner = make_org()
    sign_in(client, other_owner)

    assert client.patch(review_url(request_id), json={"status": "accepted"}).status_code == 404


# --- ігнор волонтера організацією ---


def is_ignored(db, organization_id: int, user_id: int) -> bool:
    async def fetch(session) -> bool:
        found = await session.get(
            OrganizationIgnoredUser, (organization_id, user_id), populate_existing=True
        )
        return found is not None

    return db(fetch)


def test_reject_with_ignore_blocks_all_projects(client, db, make_project, setup) -> None:
    request_id = add_request(db, setup["org"], setup["project"], setup["volunteer"])
    other_project = make_project(setup["org"])
    sign_in(client, setup["owner"])

    response = client.patch(review_url(request_id), json={"status": "rejected", "ignore": True})

    assert response.status_code == 200
    assert response.json()["status"] == "rejected"
    assert is_ignored(db, setup["org"], setup["volunteer"])
    # Волонтер бачить звичайну відмову, без згадки про ігнор
    [notification] = get_notifications(db, setup["volunteer"])
    assert notification.type is NotificationTypeEnum.join_request_rejected
    assert "ігнор" not in notification.message.lower()

    sign_in(client, setup["volunteer"])
    response = client.post(requests_url(other_project), json={})
    assert response.status_code == 403
    assert response.json() == {
        "detail": "Organization does not accept join requests from this user"
    }


def test_ignore_does_not_affect_other_organizations(client, db, make_org, make_project, setup):
    request_id = add_request(db, setup["org"], setup["project"], setup["volunteer"])
    sign_in(client, setup["owner"])
    client.patch(review_url(request_id), json={"status": "rejected", "ignore": True})
    other_org, _ = make_org()
    other_project = make_project(other_org)
    sign_in(client, setup["volunteer"])

    assert client.post(requests_url(other_project), json={}).status_code == 201


def test_reject_without_ignore(client, db, setup) -> None:
    request_id = add_request(db, setup["org"], setup["project"], setup["volunteer"])
    sign_in(client, setup["owner"])

    client.patch(review_url(request_id), json={"status": "rejected"})

    assert not is_ignored(db, setup["org"], setup["volunteer"])


def test_ignore_requires_rejection(client, db, setup) -> None:
    request_id = add_request(db, setup["org"], setup["project"], setup["volunteer"])
    sign_in(client, setup["owner"])

    response = client.patch(review_url(request_id), json={"status": "accepted", "ignore": True})

    assert response.status_code == 422
    assert get_request(db, request_id).status is JoinRequestStatusEnum.pending


def test_ignore_not_supported_for_organization_request(client, db, setup) -> None:
    async def create(session) -> int:
        request = JoinRequest(user_id=setup["volunteer"], organization_id=setup["org"])
        session.add(request)
        await session.flush()
        return request.id

    request_id = db(create)
    sign_in(client, setup["owner"])

    response = client.patch(review_url(request_id), json={"status": "rejected", "ignore": True})

    assert response.status_code == 422
    assert get_request(db, request_id).status is JoinRequestStatusEnum.pending


def test_ignore_twice_keeps_single_entry(client, db, make_project, setup) -> None:
    first = add_request(db, setup["org"], setup["project"], setup["volunteer"])
    second = add_request(db, setup["org"], make_project(setup["org"]), setup["volunteer"])
    sign_in(client, setup["owner"])

    for request_id in (first, second):
        response = client.patch(review_url(request_id), json={"status": "rejected", "ignore": True})
        assert response.status_code == 200

    assert len(client.get("/api/organizations/me/ignored-users").json()) == 1


def test_list_and_unignore(client, db, make_project, setup) -> None:
    request_id = add_request(db, setup["org"], setup["project"], setup["volunteer"])
    sign_in(client, setup["owner"])
    client.patch(review_url(request_id), json={"status": "rejected", "ignore": True})

    response = client.get("/api/organizations/me/ignored-users")
    assert response.status_code == 200
    [item] = response.json()
    assert item["user"]["id"] == setup["volunteer"]
    assert item["ignored_by"] == setup["owner"]

    url = f"/api/organizations/me/ignored-users/{setup['volunteer']}"
    assert client.delete(url).status_code == 204
    assert client.delete(url).status_code == 404
    assert client.get("/api/organizations/me/ignored-users").json() == []

    other_project = make_project(setup["org"])
    sign_in(client, setup["volunteer"])
    assert client.post(requests_url(other_project), json={}).status_code == 201


def test_plain_member_cannot_manage_ignored_users(client, db, make_user, setup) -> None:
    member_id = make_user()
    add_member(db, setup["org"], member_id, OrgMemberRoleEnum.member)
    sign_in(client, member_id)

    assert client.get("/api/organizations/me/ignored-users").status_code == 403
    url = f"/api/organizations/me/ignored-users/{setup['volunteer']}"
    assert client.delete(url).status_code == 403


# --- стани для карток одним запитом і час повторної заявки ---

STATUSES_URL = "/api/projects/my-request-statuses"


def test_statuses_for_several_projects(client, db, make_project, setup) -> None:
    second = make_project(setup["org"])
    without_request = make_project(setup["org"])
    add_request(
        db, setup["org"], setup["project"], setup["volunteer"],
        status=JoinRequestStatusEnum.cancelled,
    )  # fmt: skip
    latest = add_request(db, setup["org"], setup["project"], setup["volunteer"])
    accepted = add_request(
        db, setup["org"], second, setup["volunteer"], status=JoinRequestStatusEnum.accepted
    )
    sign_in(client, setup["volunteer"])

    response = client.get(
        STATUSES_URL, params={"project_id": [setup["project"], second, without_request]}
    )

    assert response.status_code == 200
    by_project = {item["project_id"]: item for item in response.json()}
    # Проєкт без заявок у відповіді відсутній, з кількох заявок — остання
    assert set(by_project) == {setup["project"], second}
    assert by_project[setup["project"]]["id"] == latest
    assert by_project[second]["id"] == accepted


def test_statuses_show_only_own_requests(client, db, make_user, setup) -> None:
    add_request(db, setup["org"], setup["project"], make_user())
    sign_in(client, setup["volunteer"])

    assert client.get(STATUSES_URL, params={"project_id": setup["project"]}).json() == []


@pytest.mark.parametrize(
    "params",
    [{}, {"project_id": 0}, {"project_id": "abc"}, {"project_id": list(range(1, 102))}],
    ids=["missing", "zero", "not_int", "too_many"],
)
def test_statuses_validation(client, setup, params) -> None:
    sign_in(client, setup["volunteer"])

    assert client.get(STATUSES_URL, params=params).status_code == 422


def test_statuses_require_auth(client, setup) -> None:
    assert client.get(STATUSES_URL, params={"project_id": 1}).status_code == 401


def test_rejected_status_has_reapply_time(client, db, setup) -> None:
    rejected_at = datetime.now(UTC) - timedelta(seconds=3)
    add_rejections(db, setup, 2, rejected_at)
    sign_in(client, setup["volunteer"])

    body = client.get(status_url(setup["project"])).json()

    assert body["status"] == "rejected"
    # Друга відмова — пауза 50 с від останньої
    assert datetime.fromisoformat(body["can_reapply_at"]) == rejected_at + timedelta(seconds=50)


def test_ignored_volunteer_has_no_reapply_time(client, db, setup) -> None:
    request_id = add_request(db, setup["org"], setup["project"], setup["volunteer"])
    sign_in(client, setup["owner"])
    client.patch(review_url(request_id), json={"status": "rejected", "ignore": True})
    sign_in(client, setup["volunteer"])

    body = client.get(status_url(setup["project"])).json()

    assert body["status"] == "rejected"
    assert body["can_reapply_at"] is None


def test_started_project_has_no_reapply_time(client, db, make_project, setup) -> None:
    project_id = make_project(setup["org"], starts_at=datetime.now(UTC) - timedelta(hours=1))
    add_request(
        db, setup["org"], project_id, setup["volunteer"],
        status=JoinRequestStatusEnum.rejected, reviewed_at=datetime.now(UTC),
    )  # fmt: skip
    sign_in(client, setup["volunteer"])

    assert client.get(status_url(project_id)).json()["can_reapply_at"] is None
