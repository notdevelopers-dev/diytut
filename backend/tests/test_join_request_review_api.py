from datetime import date

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
    User,
)


def sign_in(client: TestClient, user_id: int) -> None:
    token = auth._encode({"sub": str(user_id), "typ": "session"}, auth.SESSION_TTL)
    client.cookies.set("session", token, path="/api")


def review_url(join_request_id: int | str) -> str:
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


def make_request(db, organization_id: int, user_id: int, **changes) -> int:
    async def create(session) -> int:
        request = JoinRequest(
            user_id=user_id, organization_id=organization_id, message="Хочу допомагати", **changes
        )
        session.add(request)
        await session.flush()
        return request.id

    return db(create)


def get_request(db, request_id: int) -> JoinRequest:
    async def fetch(session) -> JoinRequest:
        return await session.get(JoinRequest, request_id, populate_existing=True)

    return db(fetch)


def get_membership(db, user_id: int, organization_id: int) -> OrganizationMember | None:
    async def fetch(session) -> OrganizationMember | None:
        return await session.scalar(
            select(OrganizationMember)
            .where(
                OrganizationMember.user_id == user_id,
                OrganizationMember.organization_id == organization_id,
            )
            .execution_options(populate_existing=True)
        )

    return db(fetch)


def get_notifications(db, user_id: int) -> list[Notification]:
    async def fetch(session) -> list[Notification]:
        result = await session.scalars(select(Notification).where(Notification.user_id == user_id))
        return list(result)

    return db(fetch)


@pytest.fixture
def pending(make_org, make_user, db) -> dict[str, int]:
    """Схвалена організація, її власник і волонтер із заявкою на розгляді."""
    org_id, owner_id = make_org()
    volunteer_id = make_user()
    request_id = make_request(db, org_id, volunteer_id)
    return {"org": org_id, "owner": owner_id, "volunteer": volunteer_id, "request": request_id}


def test_accept_adds_member_and_notifies(client, db, pending) -> None:
    sign_in(client, pending["owner"])

    response = client.patch(review_url(pending["request"]), json={"status": "accepted"})

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == pending["request"]
    assert body["status"] == "accepted"
    assert body["reviewed_by"] == pending["owner"]
    assert body["reviewed_at"] is not None

    membership = get_membership(db, pending["volunteer"], pending["org"])
    assert membership is not None
    assert membership.organization_id == pending["org"]
    assert membership.role is OrgMemberRoleEnum.member

    [notification] = get_notifications(db, pending["volunteer"])
    assert notification.type is NotificationTypeEnum.join_request_accepted
    assert notification.is_read is False
    assert "Фонд" in notification.message
    assert notification.link == f"/organizations/{pending['org']}"


def test_reject_does_not_add_member(client, db, pending) -> None:
    sign_in(client, pending["owner"])

    response = client.patch(review_url(pending["request"]), json={"status": "rejected"})

    assert response.status_code == 200
    assert response.json()["status"] == "rejected"
    assert response.json()["reviewed_by"] == pending["owner"]
    assert get_membership(db, pending["volunteer"], pending["org"]) is None
    [notification] = get_notifications(db, pending["volunteer"])
    assert notification.type is NotificationTypeEnum.join_request_rejected


def test_admin_can_review(client, db, make_user, pending) -> None:
    admin_id = make_user()
    add_member(db, pending["org"], admin_id, OrgMemberRoleEnum.admin)
    sign_in(client, admin_id)

    response = client.patch(review_url(pending["request"]), json={"status": "accepted"})

    assert response.status_code == 200
    assert response.json()["reviewed_by"] == admin_id


@pytest.mark.parametrize(
    "payload",
    [{}, {"status": "pending"}, {"status": "approved"}, {"status": "accepted", "role": "admin"}],
    ids=["missing", "pending", "unknown", "extra_field"],
)
def test_validation(client, db, pending, payload) -> None:
    sign_in(client, pending["owner"])

    assert client.patch(review_url(pending["request"]), json=payload).status_code == 422
    assert get_request(db, pending["request"]).status is JoinRequestStatusEnum.pending


@pytest.mark.parametrize("request_id", ["0", "-1", str(2**63), "abc"])
def test_invalid_id(client, pending, request_id) -> None:
    sign_in(client, pending["owner"])

    assert client.patch(review_url(request_id), json={"status": "accepted"}).status_code == 422


def test_requires_auth(client, pending) -> None:
    assert (
        client.patch(review_url(pending["request"]), json={"status": "accepted"}).status_code == 401
    )


def test_unknown_request(client, pending) -> None:
    sign_in(client, pending["owner"])

    response = client.patch(review_url(999_999), json={"status": "accepted"})

    assert response.status_code == 404
    assert response.json() == {"detail": "Join request not found"}


def test_other_organization_owner_cannot_review(client, db, make_org, pending) -> None:
    _, other_owner_id = make_org()
    sign_in(client, other_owner_id)

    response = client.patch(review_url(pending["request"]), json={"status": "accepted"})

    # Як для неіснуючої заявки: чужі заявки не видно
    assert response.status_code == 404
    assert get_request(db, pending["request"]).status is JoinRequestStatusEnum.pending


def test_user_without_organization_cannot_review(client, db, make_user, pending) -> None:
    sign_in(client, make_user())

    assert (
        client.patch(review_url(pending["request"]), json={"status": "accepted"}).status_code == 404
    )


def test_applicant_cannot_review_own_request(client, db, pending) -> None:
    sign_in(client, pending["volunteer"])

    response = client.patch(review_url(pending["request"]), json={"status": "accepted"})

    assert response.status_code == 404
    assert get_membership(db, pending["volunteer"], pending["org"]) is None


def test_member_cannot_review(client, db, make_user, pending) -> None:
    member_id = make_user()
    add_member(db, pending["org"], member_id, OrgMemberRoleEnum.member)
    sign_in(client, member_id)

    response = client.patch(review_url(pending["request"]), json={"status": "accepted"})

    assert response.status_code == 403
    assert response.json() == {"detail": "Only the owner or an admin can manage join requests"}
    assert get_membership(db, pending["volunteer"], pending["org"]) is None


def test_blocked_organization_cannot_review(client, db, make_org, make_user) -> None:
    org_id, owner_id = make_org(status=OrgStatusEnum.blocked)
    volunteer_id = make_user()
    request_id = make_request(db, org_id, volunteer_id)
    sign_in(client, owner_id)

    response = client.patch(review_url(request_id), json={"status": "accepted"})

    assert response.status_code == 403
    assert get_membership(db, volunteer_id, org_id) is None


@pytest.mark.parametrize("status", [JoinRequestStatusEnum.accepted, JoinRequestStatusEnum.rejected])
def test_already_reviewed(client, db, make_org, make_user, status) -> None:
    org_id, owner_id = make_org()
    volunteer_id = make_user()
    request_id = make_request(db, org_id, volunteer_id, status=status)
    sign_in(client, owner_id)

    response = client.patch(review_url(request_id), json={"status": "accepted"})

    assert response.status_code == 409
    assert response.json() == {"detail": "Join request has already been reviewed"}
    assert get_membership(db, volunteer_id, org_id) is None
    assert get_notifications(db, volunteer_id) == []


def test_second_review_conflicts(client, db, pending) -> None:
    sign_in(client, pending["owner"])
    assert (
        client.patch(review_url(pending["request"]), json={"status": "rejected"}).status_code == 200
    )

    response = client.patch(review_url(pending["request"]), json={"status": "accepted"})

    assert response.status_code == 409
    assert get_membership(db, pending["volunteer"], pending["org"]) is None
    assert len(get_notifications(db, pending["volunteer"])) == 1


def test_accept_when_applicant_belongs_to_another_organization(
    client, db, make_org, pending
) -> None:
    other_org, _ = make_org()
    add_member(db, other_org, pending["volunteer"], OrgMemberRoleEnum.member)
    sign_in(client, pending["owner"])

    response = client.patch(review_url(pending["request"]), json={"status": "accepted"})

    # Користувач може належати до кількох організацій
    assert response.status_code == 200
    assert get_membership(db, pending["volunteer"], pending["org"]) is not None
    assert get_membership(db, pending["volunteer"], other_org) is not None


def test_accept_when_applicant_already_member_here(client, db, pending) -> None:
    # Волонтер став учасником цієї організації, поки заявка чекала на розгляд
    add_member(db, pending["org"], pending["volunteer"], OrgMemberRoleEnum.admin)
    sign_in(client, pending["owner"])

    response = client.patch(review_url(pending["request"]), json={"status": "accepted"})

    assert response.status_code == 409
    assert response.json() == {"detail": "Volunteer is already a member of this organization"}
    # Транзакцію відкочено: роль не змінилася, заявка на розгляді, сповіщення немає
    membership = get_membership(db, pending["volunteer"], pending["org"])
    assert membership.role is OrgMemberRoleEnum.admin
    assert get_request(db, pending["request"]).status is JoinRequestStatusEnum.pending
    assert get_notifications(db, pending["volunteer"]) == []


def test_reject_when_applicant_already_member_here(client, db, pending) -> None:
    add_member(db, pending["org"], pending["volunteer"], OrgMemberRoleEnum.member)
    sign_in(client, pending["owner"])

    # Відхилити таку заявку можна: інакше вона висіла б у кабінеті вічно
    response = client.patch(review_url(pending["request"]), json={"status": "rejected"})

    assert response.status_code == 200


def test_owner_of_several_organizations_reviews_non_default(
    client, db, make_org, make_user
) -> None:
    _, owner_id = make_org()
    second_org, _ = make_org()
    # Друга організація власника, не за замовчуванням
    add_member(db, second_org, owner_id, OrgMemberRoleEnum.owner)
    volunteer_id = make_user()
    request_id = make_request(db, second_org, volunteer_id)
    sign_in(client, owner_id)

    response = client.patch(review_url(request_id), json={"status": "accepted"})

    assert response.status_code == 200
    assert response.json()["reviewed_by"] == owner_id
    assert get_membership(db, volunteer_id, second_org) is not None


def test_role_checked_in_request_organization(client, db, make_org, make_user) -> None:
    _, owner_id = make_org()
    other_org, _ = make_org()
    # Власник своєї організації, але лише учасник організації заявки
    add_member(db, other_org, owner_id, OrgMemberRoleEnum.member)
    volunteer_id = make_user()
    request_id = make_request(db, other_org, volunteer_id)
    sign_in(client, owner_id)

    response = client.patch(review_url(request_id), json={"status": "accepted"})

    assert response.status_code == 403
    assert get_membership(db, volunteer_id, other_org) is None
