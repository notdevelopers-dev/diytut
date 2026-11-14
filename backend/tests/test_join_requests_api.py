from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

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
    User,
)


def sign_in(client: TestClient, user_id: int) -> None:
    token = auth._encode({"sub": str(user_id), "typ": "session"}, auth.SESSION_TTL)
    client.cookies.set("session", token, path="/api")


def join_url(organization_id: int) -> str:
    return f"/api/organizations/{organization_id}/join-requests"


def status_url(organization_id: int) -> str:
    return f"/api/organizations/{organization_id}/my-request-status"


DASHBOARD_URL = "/api/organizations/me/join-requests"


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


def add_member(db, organization_id: int, user_id: int, role: OrgMemberRoleEnum) -> None:
    async def create(session) -> None:
        session.add(OrganizationMember(organization_id=organization_id, user_id=user_id, role=role))
        await session.flush()

    db(create)


def set_status(db, request_id: int, status: JoinRequestStatusEnum) -> None:
    async def update(session) -> None:
        request = await session.get(JoinRequest, request_id)
        request.status = status

    db(update)


def count_requests(db) -> int:
    async def count(session) -> int:
        return await session.scalar(select(func.count()).select_from(JoinRequest))

    return db(count)


# POST /organizations/{id}/join-requests


def test_create_join_request(client: TestClient, make_org, make_user) -> None:
    org_id, _ = make_org()
    volunteer_id = make_user()
    sign_in(client, volunteer_id)

    response = client.post(join_url(org_id), json={"message": "  Хочу допомагати  "})

    assert response.status_code == 201
    body = response.json()
    assert body["user_id"] == volunteer_id
    assert body["organization_id"] == org_id
    assert body["message"] == "Хочу допомагати"
    assert body["status"] == "pending"
    assert body["reviewed_at"] is None
    assert body["created_at"]


@pytest.mark.parametrize("payload", [{}, {"message": None}, {"message": "   "}])
def test_create_join_request_without_message(client, make_org, make_user, payload) -> None:
    org_id, _ = make_org()
    sign_in(client, make_user())

    response = client.post(join_url(org_id), json=payload)

    assert response.status_code == 201
    assert response.json()["message"] is None


@pytest.mark.parametrize(
    "payload",
    [{"message": "x" * 1001}, {"message": 1}, {"status": "accepted"}],
    ids=["too_long", "not_string", "extra_field"],
)
def test_create_join_request_validation(client, make_org, make_user, db, payload) -> None:
    org_id, _ = make_org()
    sign_in(client, make_user())

    response = client.post(join_url(org_id), json=payload)

    assert response.status_code == 422
    assert count_requests(db) == 0


def test_create_join_request_requires_auth(client: TestClient, make_org) -> None:
    org_id, _ = make_org()

    assert client.post(join_url(org_id), json={}).status_code == 401


def test_create_join_request_for_deleted_user(client: TestClient, make_org) -> None:
    org_id, _ = make_org()
    sign_in(client, 999_999)

    assert client.post(join_url(org_id), json={}).status_code == 401


@pytest.mark.parametrize(
    "status", [OrgStatusEnum.pending, OrgStatusEnum.rejected, OrgStatusEnum.blocked]
)
def test_cannot_join_unapproved_organization(client, make_org, make_user, db, status) -> None:
    org_id, _ = make_org(status=status)
    sign_in(client, make_user())

    response = client.post(join_url(org_id), json={})

    assert response.status_code == 404
    assert response.json() == {"detail": "Organization not found"}
    assert count_requests(db) == 0


def test_create_join_request_unknown_organization(client, make_user) -> None:
    sign_in(client, make_user())

    assert client.post(join_url(999_999), json={}).status_code == 404


@pytest.mark.parametrize("organization_id", ["0", "-1", str(2**63), "abc"])
def test_create_join_request_invalid_organization_id(client, make_user, organization_id) -> None:
    sign_in(client, make_user())

    assert client.post(join_url(organization_id), json={}).status_code == 422


def test_duplicate_pending_request_conflicts(client, make_org, make_user, db) -> None:
    org_id, _ = make_org()
    sign_in(client, make_user())
    assert client.post(join_url(org_id), json={}).status_code == 201

    response = client.post(join_url(org_id), json={"message": "Ще раз"})

    assert response.status_code == 409
    assert response.json() == {"detail": "Join request to this organization is already pending"}
    assert count_requests(db) == 1


@pytest.mark.parametrize("status", [JoinRequestStatusEnum.accepted, JoinRequestStatusEnum.rejected])
def test_new_request_allowed_after_review(client, make_org, make_user, db, status) -> None:
    org_id, _ = make_org()
    sign_in(client, make_user())
    first = client.post(join_url(org_id), json={}).json()
    set_status(db, first["id"], status)

    assert client.post(join_url(org_id), json={}).status_code == 201


def test_requests_to_different_organizations_do_not_conflict(client, make_org, make_user) -> None:
    first_org, _ = make_org()
    second_org, _ = make_org()
    sign_in(client, make_user())

    assert client.post(join_url(first_org), json={}).status_code == 201
    assert client.post(join_url(second_org), json={}).status_code == 201


def test_member_cannot_join_own_organization(client, make_org, db) -> None:
    org_id, owner_id = make_org()
    sign_in(client, owner_id)

    response = client.post(join_url(org_id), json={})

    assert response.status_code == 409
    assert response.json() == {"detail": "User is already a member of this organization"}
    assert count_requests(db) == 0


def test_member_of_other_organization_cannot_join(client, make_org, db) -> None:
    org_id, _ = make_org()
    _, other_owner_id = make_org()
    sign_in(client, other_owner_id)

    response = client.post(join_url(org_id), json={})

    assert response.status_code == 409
    assert response.json() == {"detail": "User already belongs to an organization"}
    assert count_requests(db) == 0


def get_notifications(db, user_id: int) -> list[Notification]:
    async def fetch(session) -> list[Notification]:
        result = await session.scalars(select(Notification).where(Notification.user_id == user_id))
        return list(result)

    return db(fetch)


def test_owner_notified_about_new_request(client, make_org, make_user, db) -> None:
    org_id, owner_id = make_org()
    admin_id = make_user()
    add_member(db, org_id, admin_id, OrgMemberRoleEnum.admin)
    volunteer_id = make_user()
    sign_in(client, volunteer_id)

    client.post(join_url(org_id), json={})

    [notification] = get_notifications(db, owner_id)
    assert notification.type is NotificationTypeEnum.join_request_received
    assert notification.link == "/organization/join-requests"
    assert "Фонд" in notification.message
    assert notification.is_read is False
    # Лише власнику (за задачею); волонтер сповіщення про власну дію не отримує
    assert get_notifications(db, admin_id) == []
    assert get_notifications(db, volunteer_id) == []


def test_no_notification_for_rejected_request(client, make_org, make_user, db) -> None:
    org_id, owner_id = make_org()
    sign_in(client, make_user())
    client.post(join_url(org_id), json={})

    assert client.post(join_url(org_id), json={}).status_code == 409

    assert len(get_notifications(db, owner_id)) == 1


# GET /organizations/{id}/my-request-status


def test_my_request_status(client, make_org, make_user) -> None:
    org_id, _ = make_org()
    sign_in(client, make_user())
    created = client.post(join_url(org_id), json={"message": "Привіт"}).json()

    response = client.get(status_url(org_id))

    assert response.status_code == 200
    assert response.json() == created


def test_my_request_status_returns_latest(client, make_org, make_user, db) -> None:
    org_id, _ = make_org()
    sign_in(client, make_user())
    first = client.post(join_url(org_id), json={}).json()
    set_status(db, first["id"], JoinRequestStatusEnum.rejected)
    second = client.post(join_url(org_id), json={}).json()

    response = client.get(status_url(org_id))

    assert response.json()["id"] == second["id"]
    assert response.json()["status"] == "pending"


def test_my_request_status_shows_review_result(client, make_org, make_user, db) -> None:
    org_id, _ = make_org()
    sign_in(client, make_user())
    created = client.post(join_url(org_id), json={}).json()
    set_status(db, created["id"], JoinRequestStatusEnum.rejected)

    assert client.get(status_url(org_id)).json()["status"] == "rejected"


def test_my_request_status_without_request(client, make_org, make_user) -> None:
    org_id, _ = make_org()
    sign_in(client, make_user())

    response = client.get(status_url(org_id))

    assert response.status_code == 404
    assert response.json() == {"detail": "Join request not found"}


def test_my_request_status_ignores_other_users(client, make_org, make_user) -> None:
    org_id, _ = make_org()
    sign_in(client, make_user())
    client.post(join_url(org_id), json={})

    sign_in(client, make_user())

    assert client.get(status_url(org_id)).status_code == 404


def test_my_request_status_requires_auth(client, make_org) -> None:
    org_id, _ = make_org()

    assert client.get(status_url(org_id)).status_code == 401


# GET /organizations/me/join-requests


def test_dashboard_lists_pending_requests(client, make_org, make_user, db) -> None:
    org_id, owner_id = make_org()
    other_org, _ = make_org()
    first, second, reviewed, elsewhere = (make_user() for _ in range(4))
    ids = {}
    for user_id, target in ((first, org_id), (second, org_id), (reviewed, org_id)):
        sign_in(client, user_id)
        ids[user_id] = client.post(join_url(target), json={"message": f"m{user_id}"}).json()["id"]
    sign_in(client, elsewhere)
    client.post(join_url(other_org), json={})
    set_status(db, ids[reviewed], JoinRequestStatusEnum.accepted)

    sign_in(client, owner_id)
    response = client.get(DASHBOARD_URL)

    assert response.status_code == 200
    body = response.json()
    # Лише заявки на розгляді до своєї організації, давніші спершу
    assert [item["id"] for item in body] == [ids[first], ids[second]]
    assert body[0]["status"] == "pending"
    assert body[0]["message"] == f"m{first}"
    assert set(body[0]["user"]) == {"id", "first_name", "last_name", "nickname", "city_id"}
    assert body[0]["user"]["id"] == first
    # Контакти волонтера організації до рішення не потрібні
    assert "email" not in body[0]["user"]
    assert "phone" not in body[0]["user"]


def test_dashboard_pagination(client, make_org, make_user) -> None:
    org_id, owner_id = make_org()
    created = []
    for _ in range(3):
        sign_in(client, make_user())
        created.append(client.post(join_url(org_id), json={}).json()["id"])

    sign_in(client, owner_id)
    page = client.get(DASHBOARD_URL, params={"limit": 2, "offset": 1}).json()

    assert [item["id"] for item in page] == created[1:]


@pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 101}, {"offset": -1}])
def test_dashboard_pagination_validation(client, make_org, params) -> None:
    _, owner_id = make_org()
    sign_in(client, owner_id)

    assert client.get(DASHBOARD_URL, params=params).status_code == 422


def test_dashboard_empty(client, make_org) -> None:
    _, owner_id = make_org()
    sign_in(client, owner_id)

    response = client.get(DASHBOARD_URL)

    assert response.status_code == 200
    assert response.json() == []


def test_dashboard_admin_can_view(client, make_org, make_user, db) -> None:
    org_id, _ = make_org()
    admin_id = make_user()
    add_member(db, org_id, admin_id, OrgMemberRoleEnum.admin)
    sign_in(client, admin_id)

    assert client.get(DASHBOARD_URL).status_code == 200


def test_dashboard_forbidden_for_member(client, make_org, make_user, db) -> None:
    org_id, _ = make_org()
    member_id = make_user()
    add_member(db, org_id, member_id, OrgMemberRoleEnum.member)
    sign_in(client, member_id)

    response = client.get(DASHBOARD_URL)

    assert response.status_code == 403
    assert response.json() == {"detail": "Only the owner or an admin can manage join requests"}


def test_dashboard_without_organization(client, make_user) -> None:
    sign_in(client, make_user())

    assert client.get(DASHBOARD_URL).status_code == 404


def test_dashboard_requires_auth(client) -> None:
    assert client.get(DASHBOARD_URL).status_code == 401
