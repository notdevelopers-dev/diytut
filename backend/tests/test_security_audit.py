from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app import auth
from app.models import (
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


def _sign_in(client: TestClient, user_id: int) -> None:
    token = auth._encode({"sub": str(user_id), "typ": "session"}, auth.SESSION_TTL)
    client.cookies.set("session", token, path="/api")


@pytest.fixture
def city_id(db) -> int:
    async def create(session) -> int:
        city = City(name="Київ", region="Київська")
        session.add(city)
        await session.flush()
        return city.id

    return db(create)


@pytest.fixture
def make_user(db, city_id: int):
    counter = iter(range(1, 1000))

    def make(nickname: str | None = None) -> int:
        n = next(counter)

        async def create(session) -> int:
            user = User(
                google_sub=f"audit-google-{n}",
                email=f"audit{n}@example.com",
                first_name="Олена",
                last_name="Коваленко",
                nickname=nickname or f"audit_user_{n}",
                phone="+380671234567",
                birth_date=date(1995, 5, 10),
                city_id=city_id,
            )
            session.add(user)
            await session.flush()
            return user.id

        return db(create)

    return make


@pytest.fixture
def make_org(db, city_id: int, make_user):
    counter = iter(range(1, 1000))

    def make(
        *,
        status: OrgStatusEnum = OrgStatusEnum.approved,
        owner_id: int | None = None,
    ) -> tuple[int, int]:
        n = next(counter)
        uid = owner_id or make_user()

        async def create(session) -> tuple[int, int]:
            org = Organization(
                name=f"Audit Org {n}",
                email=f"org{n}@example.com",
                phone="+380671112233",
                city_id=city_id,
                status=status,
                created_by=uid,
            )
            org.members.append(OrganizationMember(user_id=uid, role=OrgMemberRoleEnum.owner))
            session.add(org)
            await session.flush()
            return org.id, uid

        return db(create)

    return make


def _make_project(
    db,
    org_id: int,
    *,
    title: str = "Проєкт",
    status: ProjectStatusEnum = ProjectStatusEnum.published,
    published_at: datetime | None = None,
) -> int:
    starts_at = datetime.now(UTC).replace(microsecond=0) + timedelta(days=14)

    async def create(session) -> int:
        project = Project(
            organization_id=org_id,
            title=title,
            description="Опис проєкту",
            starts_at=starts_at,
            ends_at=starts_at + timedelta(hours=3),
            is_online=True,
            capacity=10,
            volunteer_hours=Decimal("2.00"),
            status=status,
            published_at=published_at
            or (datetime.now(UTC) if status != ProjectStatusEnum.draft else None),
        )
        session.add(project)
        await session.flush()
        return project.id

    return db(create)


# --- 1. Unauthenticated access (401) matrix ---


@pytest.mark.parametrize(
    ("method", "url", "body"),
    [
        ("get", "/api/users/me", None),
        ("patch", "/api/users/me", {}),
        ("get", "/api/users/me/organizations", None),
        ("get", "/api/users/me/project-requests", None),
        ("post", "/api/organizations", {}),
        ("get", "/api/organizations/me", None),
        ("patch", "/api/organizations/me", {}),
        ("get", "/api/organizations/me/projects", None),
        ("get", "/api/organizations/me/join-requests", None),
        ("get", "/api/organizations/me/ignored-users", None),
        ("delete", "/api/organizations/me/ignored-users/1", None),
        ("post", "/api/organizations/1/join-requests", {}),
        ("get", "/api/organizations/1/my-request-status", None),
        ("patch", "/api/join-requests/1", {"status": "accepted"}),
        ("post", "/api/projects", {}),
        ("get", "/api/projects/my-request-statuses?project_id=1", None),
        ("patch", "/api/projects/1", {}),
        ("post", "/api/projects/1/publish", None),
        ("post", "/api/projects/1/join-requests", {}),
        ("get", "/api/projects/1/join-requests", None),
        ("get", "/api/projects/1/my-request-status", None),
        ("delete", "/api/projects/1/my-request", None),
        ("get", "/api/notifications", None),
        ("get", "/api/notifications/unread-count", None),
        ("post", "/api/notifications/read-all", None),
        ("patch", "/api/notifications/1/read", None),
        ("get", "/api/admin/stats", None),
        ("get", "/api/admin/organizations", None),
        ("get", "/api/admin/organizations/1", None),
        ("post", "/api/admin/organizations/1/review", {"decision": "approved"}),
        ("get", "/api/admin/stats/logins", None),
        ("get", "/api/admin/stats/logins/recent", None),
    ],
)
def test_protected_routes_require_auth(
    client: TestClient, method: str, url: str, body: dict | None
) -> None:
    kwargs = {"json": body} if body is not None else {}
    assert client.request(method, url, **kwargs).status_code == 401


# --- 2. Blocked organization & visibility fixes ---


def test_blocked_organization_cannot_unignore_user(
    client: TestClient, db, make_org, make_user
) -> None:
    approved_org_id, owner_id = make_org(status=OrgStatusEnum.approved)
    blocked_org_id, _ = make_org(status=OrgStatusEnum.approved, owner_id=owner_id)
    volunteer_id = make_user()

    async def setup(session) -> None:
        session.add(
            OrganizationIgnoredUser(
                organization_id=blocked_org_id, user_id=volunteer_id, ignored_by=owner_id
            )
        )
        org = await session.get(Organization, blocked_org_id)
        org.status = OrgStatusEnum.blocked

    db(setup)
    _sign_in(client, owner_id)

    # Перша (за замовчуванням) організація схвалена, а друга за ?organization_id= — заблокована
    response = client.delete(
        f"/api/organizations/me/ignored-users/{volunteer_id}",
        params={"organization_id": blocked_org_id},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Organization is blocked"
    assert approved_org_id != blocked_org_id


@pytest.mark.parametrize(
    "hidden_status",
    [OrgStatusEnum.blocked, OrgStatusEnum.pending, OrgStatusEnum.rejected],
)
def test_unapproved_organization_projects_hidden_from_public_and_outsiders(
    client: TestClient, db, make_org, make_user, hidden_status: OrgStatusEnum
) -> None:
    approved_org, _ = make_org(status=OrgStatusEnum.approved)
    hidden_org, owner_id = make_org(status=OrgStatusEnum.approved)
    member_id = make_user()

    async def add_member(session) -> None:
        session.add(
            OrganizationMember(
                organization_id=hidden_org, user_id=member_id, role=OrgMemberRoleEnum.member
            )
        )

    db(add_member)
    visible_id = _make_project(db, approved_org, title="Видимий проєкт")
    hidden_id = _make_project(db, hidden_org, title="Прихований проєкт")

    async def update_org_status(session) -> None:
        org = await session.get(Organization, hidden_org)
        org.status = hidden_status

    db(update_org_status)

    # Каталог показує лише проєкт схваленої організації
    catalog_ids = [item["id"] for item in client.get("/api/projects").json()]
    assert catalog_ids == [visible_id]

    # Гість і сторонній користувач не бачать проєкт несхваленої/заблокованої організації
    assert client.get(f"/api/projects/{hidden_id}").status_code == 404
    _sign_in(client, make_user())
    assert client.get(f"/api/projects/{hidden_id}").status_code == 404

    # Учасники цієї організації все ще бачать його у своєму кабінеті
    _sign_in(client, member_id)
    assert client.get(f"/api/projects/{hidden_id}").status_code == 200
    _sign_in(client, owner_id)
    assert client.get(f"/api/projects/{hidden_id}").status_code == 200


# --- 3. Search bounds & pagination ---


def test_projects_search_max_length_422(client: TestClient) -> None:
    assert client.get("/api/projects", params={"search": "a" * 200}).status_code == 200
    assert client.get("/api/projects", params={"search": "a" * 201}).status_code == 422


def test_organization_detail_projects_pagination(client: TestClient, db, make_org) -> None:
    org_id, _ = make_org(status=OrgStatusEnum.approved)
    base_time = datetime.now(UTC)
    created_ids = [
        _make_project(
            db,
            org_id,
            title=f"Проєкт {i}",
            published_at=base_time + timedelta(minutes=i),
        )
        for i in range(25)
    ]
    newest_first = list(reversed(created_ids))

    # За замовчуванням повертаються перші 20 опублікованих проєктів
    page1 = client.get(f"/api/organizations/{org_id}")
    assert page1.status_code == 200
    assert [p["id"] for p in page1.json()["projects"]] == newest_first[:20]

    page2 = client.get(
        f"/api/organizations/{org_id}", params={"projects_limit": 5, "projects_offset": 20}
    )
    assert page2.status_code == 200
    assert [p["id"] for p in page2.json()["projects"]] == newest_first[20:25]


@pytest.mark.parametrize(
    "params", [{"projects_limit": 0}, {"projects_limit": 101}, {"projects_offset": -1}]
)
def test_organization_detail_projects_pagination_validation(
    client: TestClient, make_org, params: dict
) -> None:
    org_id, _ = make_org(status=OrgStatusEnum.approved)
    assert client.get(f"/api/organizations/{org_id}", params=params).status_code == 422


def test_my_organizations_pagination(client: TestClient, make_org, make_user) -> None:
    user_id = make_user()
    org_ids = [make_org(owner_id=user_id)[0] for _ in range(3)]
    _sign_in(client, user_id)

    res = client.get("/api/users/me/organizations", params={"limit": 2, "offset": 1})
    assert res.status_code == 200
    assert [o["id"] for o in res.json()] == org_ids[1:3]

    assert client.get("/api/users/me/organizations", params={"limit": 0}).status_code == 422
    assert client.get("/api/users/me/organizations", params={"limit": 101}).status_code == 422
    assert client.get("/api/users/me/organizations", params={"offset": -1}).status_code == 422


# --- 4. Mass assignment & cross-tenant isolation ---


def test_mass_assignment_rejected_422(client: TestClient, make_org, make_user) -> None:
    user_id = make_user()
    org_id, _ = make_org(owner_id=user_id)
    _sign_in(client, user_id)

    assert client.patch("/api/users/me", json={"platform_role": "admin"}).status_code == 422
    assert client.patch("/api/organizations/me", json={"status": "approved"}).status_code == 422
    assert client.patch("/api/organizations/me", json={"name": "Хак"}).status_code == 422
    assert (
        client.patch(
            "/api/organizations/me", params={"organization_id": org_id}, json={"edrpou": "12345678"}
        ).status_code
        == 422
    )


def test_cross_user_notification_and_join_request_isolation(
    client: TestClient, db, make_org, make_user
) -> None:
    org1_id, owner1_id = make_org()
    _, owner2_id = make_org()
    volunteer_id = make_user()

    async def seed(session) -> tuple[int, int]:
        notif = Notification(
            user_id=owner1_id,
            type=NotificationTypeEnum.join_request_received,
            title="T",
            message="M",
        )
        req = JoinRequest(
            user_id=volunteer_id,
            organization_id=org1_id,
            target=JoinRequestTargetEnum.organization,
            status=JoinRequestStatusEnum.pending,
        )
        session.add_all([notif, req])
        await session.flush()
        return notif.id, req.id

    notif_id, req_id = db(seed)
    _sign_in(client, owner2_id)

    assert client.patch(f"/api/notifications/{notif_id}/read").status_code == 404
    assert (
        client.patch(f"/api/join-requests/{req_id}", json={"status": "accepted"}).status_code == 404
    )
    assert (
        client.get("/api/organizations/me", params={"organization_id": org1_id}).status_code == 404
    )
