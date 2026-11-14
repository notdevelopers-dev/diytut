from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event

from app import auth
from app.db import engine
from app.main import app
from app.models import (
    City,
    Organization,
    OrganizationMember,
    OrgMemberRoleEnum,
    OrgStatusEnum,
    User,
)
from app.schemas.organizations import _check_edrpou
from app.services import organizations as organizations_service

# Справжні коди ЄДРПОУ з різних діапазонів алгоритму контрольної цифри
VALID_EDRPOU = ["14360570", "21133352", "40075815", "00032106"]


@pytest.fixture
def city_id(db) -> int:
    async def create(session) -> int:
        city = City(name="Львів", region="Львівська")
        session.add(city)
        await session.flush()
        return city.id

    return db(create)


def _user(city_id: int, n: int) -> User:
    return User(
        google_sub=f"google-{n}",
        email=f"user{n}@example.com",
        first_name="Тарас",
        last_name="Шевченко",
        nickname=f"user_{n}",
        phone="+380671234567",
        birth_date=date(1990, 3, 9),
        city_id=city_id,
    )


@pytest.fixture
def make_user(db, city_id: int):
    counter = iter(range(1, 1000))

    def make() -> int:
        async def create(session) -> int:
            user = _user(city_id, next(counter))
            session.add(user)
            await session.flush()
            return user.id

        return db(create)

    return make


def sign_in(client: TestClient, user_id: int) -> None:
    token = auth._encode({"sub": str(user_id), "typ": "session"}, auth.SESSION_TTL)
    client.cookies.set("session", token, path="/api")


@pytest.fixture
def user_id(client: TestClient, make_user) -> int:
    user_id = make_user()
    sign_in(client, user_id)
    return user_id


@pytest.fixture
def form(city_id: int) -> dict:
    return {
        "name": "Добрі справи",
        "email": "info@dobri.org.ua",
        "phone": "+380671234567",
        "city_id": city_id,
        "description": "Допомагаємо переселенцям",
        "edrpou": "14360570",
    }


def create(client: TestClient, form: dict, **changes):
    return client.post("/api/organizations", json={**form, **changes})


def error_fields(response) -> set[str]:
    return {error["loc"][-1] for error in response.json()["detail"]}


def test_organization_is_created_and_linked_to_creator(
    client: TestClient, form: dict, user_id: int, db
) -> None:
    response = create(client, form, name="  Добрі справи ", email="Info@Dobri.org.ua")

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Добрі справи"
    assert body["email"] == "info@dobri.org.ua"
    assert body["status"] == "pending"
    assert body["created_at"]

    organization = db(lambda session: session.get(Organization, body["id"]))
    assert organization.created_by == user_id
    member = db(lambda session: session.get(OrganizationMember, (body["id"], user_id)))
    assert member.role == "owner"


def test_optional_fields_can_be_omitted(client: TestClient, form: dict, user_id: int) -> None:
    del form["edrpou"], form["description"]

    response = create(client, form)

    assert response.status_code == 201
    assert response.json()["edrpou"] is None
    assert response.json()["description"] is None


@pytest.mark.usefixtures("user_id")
def test_empty_optional_fields_become_null(client: TestClient, form: dict) -> None:
    response = create(client, form, edrpou=" ", description="")

    assert response.status_code == 201
    assert response.json()["edrpou"] is None
    assert response.json()["description"] is None


def test_requires_sign_in(client: TestClient, form: dict) -> None:
    assert create(client, form).status_code == 401


def test_session_of_deleted_user_is_rejected(client: TestClient, form: dict) -> None:
    sign_in(client, 2**63 - 1)

    assert create(client, form).status_code == 401


@pytest.mark.usefixtures("user_id")
def test_user_can_create_several_organizations(client: TestClient, form: dict) -> None:
    first = create(client, form)
    second = create(client, form, name="Інший фонд", edrpou="21133352")

    assert first.status_code == 201
    assert second.status_code == 201
    # Творець — власник кожної з них; список іде від найдавнішої
    assert client.get("/api/users/me/organizations").json() == [
        {"id": first.json()["id"], "name": form["name"], "status": "pending", "role": "owner"},
        {"id": second.json()["id"], "name": "Інший фонд", "status": "pending", "role": "owner"},
    ]


def test_edrpou_must_be_unique(client: TestClient, form: dict, make_user) -> None:
    sign_in(client, make_user())
    assert create(client, form).status_code == 201

    sign_in(client, make_user())
    response = create(client, form)

    assert response.status_code == 409
    assert response.json()["detail"][0]["type"] == "edrpou_taken"
    assert error_fields(response) == {"edrpou"}


def test_edrpou_taken_between_check_and_insert(
    client: TestClient, form: dict, make_user, monkeypatch: pytest.MonkeyPatch
) -> None:
    sign_in(client, make_user())
    assert create(client, form).status_code == 201

    async def not_taken(session, edrpou: str) -> bool:
        return False

    monkeypatch.setattr(organizations_service, "is_edrpou_taken", not_taken)
    sign_in(client, make_user())
    response = create(client, form)

    assert response.status_code == 409
    assert response.json()["detail"][0]["type"] == "edrpou_taken"


@pytest.mark.usefixtures("user_id")
def test_unknown_city_is_rejected(client: TestClient, form: dict) -> None:
    response = create(client, form, city_id=999_999_999)

    assert response.status_code == 422
    assert error_fields(response) == {"city_id"}


@pytest.mark.usefixtures("user_id")
@pytest.mark.parametrize("field", ["name", "email", "phone", "city_id"])
def test_required_field_is_missing(client: TestClient, form: dict, field: str) -> None:
    del form[field]

    response = create(client, form)

    assert response.status_code == 422
    assert error_fields(response) == {field}


@pytest.mark.usefixtures("user_id")
@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("name", " "),
        ("name", "x" * 201),
        ("email", "not-an-email"),
        ("email", "a@b"),
        ("phone", "+48123456789"),
        ("description", "x" * 2001),
        ("edrpou", "1436057"),
        ("edrpou", "1436057a"),
        ("edrpou", "14360571"),
        ("city_id", 0),
        ("city_id", 2**31),
    ],
)
def test_invalid_field_is_rejected(client: TestClient, form: dict, field: str, value) -> None:
    response = create(client, form, **{field: value})

    assert response.status_code == 422
    assert error_fields(response) == {field}


@pytest.mark.usefixtures("user_id")
@pytest.mark.parametrize("field", ["status", "created_by", "reviewed_by", "id"])
def test_user_cannot_set_privileged_fields(client: TestClient, form: dict, field: str) -> None:
    response = create(client, form, **{field: "approved" if field == "status" else 1})

    assert response.status_code == 422


@pytest.mark.usefixtures("user_id")
def test_phone_is_normalized(client: TestClient, form: dict) -> None:
    response = create(client, form, phone="(067) 123-45-67")

    assert response.json()["phone"] == "+380671234567"


@pytest.mark.parametrize("code", VALID_EDRPOU)
def test_valid_edrpou_codes(code: str) -> None:
    assert _check_edrpou(code) == code


@pytest.fixture
def organization_id(client: TestClient, form: dict, user_id: int) -> int:
    return create(client, form).json()["id"]


def add_member(db, organization_id: int, user_id: int, role: OrgMemberRoleEnum) -> None:
    async def add(session) -> None:
        session.add(OrganizationMember(organization_id=organization_id, user_id=user_id, role=role))

    db(add)


def set_status(db, organization_id: int, new_status: OrgStatusEnum) -> None:
    async def change(session) -> None:
        organization = await session.get(Organization, organization_id)
        organization.status = new_status

    db(change)


def update(client: TestClient, **changes):
    return client.patch("/api/organizations/me", json=changes)


def stored(db, organization_id: int) -> Organization:
    """Організація такою, якою вона є в БД, а не в пам'яті сесії.

    Тести й застосунок працюють з однією сесією: без refresh незбережені зміни
    виглядали б збереженими.
    """

    async def load(session) -> Organization:
        organization = await session.get(Organization, organization_id)
        await session.refresh(organization)
        return organization

    return db(load)


@pytest.fixture
def second_organization_id(client: TestClient, form: dict, organization_id: int) -> int:
    return create(client, form, name="Інший фонд", edrpou="21133352").json()["id"]


def test_first_organization_is_the_default(
    client: TestClient, db, organization_id: int, second_organization_id: int
) -> None:
    # Клієнт, що не передає organization_id, завжди працює з однією й тією самою організацією
    assert client.get("/api/organizations/me").json()["id"] == organization_id
    assert client.get("/api/auth/me").json()["organization"]["id"] == organization_id

    assert update(client, description="Змінено").status_code == 200
    assert stored(db, organization_id).description == "Змінено"
    assert stored(db, second_organization_id).description != "Змінено"


def test_organization_is_chosen_by_id(
    client: TestClient, db, form: dict, organization_id: int, second_organization_id: int
) -> None:
    params = {"organization_id": second_organization_id}

    response = client.get("/api/organizations/me", params=params)
    assert response.status_code == 200
    assert response.json()["id"] == second_organization_id
    assert response.json()["name"] == "Інший фонд"

    response = client.patch("/api/organizations/me", params=params, json={"description": "Нове"})
    assert response.status_code == 200
    assert response.json()["id"] == second_organization_id
    assert stored(db, second_organization_id).description == "Нове"
    assert stored(db, organization_id).description == form["description"]


def test_foreign_organization_cannot_be_chosen(
    client: TestClient, db, make_user, form: dict, organization_id: int
) -> None:
    # Чужа організація не відрізняється від неіснуючої, навіть якщо користувач має власну
    sign_in(client, make_user())
    assert create(client, form, edrpou="21133352").status_code == 201
    params = {"organization_id": organization_id}

    assert client.get("/api/organizations/me", params=params).status_code == 404
    response = client.patch("/api/organizations/me", params=params, json={"description": "x"})
    assert response.status_code == 404
    assert stored(db, organization_id).description == form["description"]


def test_role_and_status_are_checked_per_organization(
    client: TestClient, db, make_user, user_id: int, organization_id: int
) -> None:
    # Власник своєї організації й рядовий учасник чужої, до того ж заблокованої
    other_owner = make_user()

    async def add_other(session) -> int:
        other = Organization(
            name="Чужий фонд",
            email="other@example.com",
            phone="+380671234567",
            city_id=(await session.get(Organization, organization_id)).city_id,
            status=OrgStatusEnum.blocked,
            created_by=other_owner,
        )
        session.add(other)
        await session.flush()
        return other.id

    other_id = db(add_other)
    add_member(db, other_id, user_id, OrgMemberRoleEnum.member)

    in_other = client.patch(
        "/api/organizations/me", params={"organization_id": other_id}, json={"description": "x"}
    )
    assert in_other.status_code == 403
    read_other = client.get("/api/organizations/me", params={"organization_id": other_id})
    assert read_other.json()["role"] == "member"
    # Чужі обмеження не заважають керувати власною організацією
    assert update(client, description="Своє").status_code == 200


@pytest.mark.parametrize("value", ["0", "-1", "abc", str(2**31)])
def test_invalid_organization_id_is_rejected(
    client: TestClient, organization_id: int, value: str
) -> None:
    response = client.get("/api/organizations/me", params={"organization_id": value})

    assert response.status_code == 422


def test_owner_reads_own_organization(client: TestClient, form: dict, organization_id: int) -> None:
    response = client.get("/api/organizations/me")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == organization_id
    assert body["name"] == form["name"]
    assert body["edrpou"] == form["edrpou"]
    assert body["status"] == "pending"
    assert body["role"] == "owner"


@pytest.mark.parametrize("role", list(OrgMemberRoleEnum))
def test_member_sees_own_role(
    client: TestClient, db, make_user, organization_id: int, role: OrgMemberRoleEnum
) -> None:
    member_id = make_user()
    add_member(db, organization_id, member_id, role)
    sign_in(client, member_id)

    assert client.get("/api/organizations/me").json()["role"] == role


@pytest.mark.usefixtures("user_id")
def test_user_without_organization_gets_404(client: TestClient) -> None:
    assert client.get("/api/organizations/me").status_code == 404
    assert update(client, phone="0671234567").status_code == 404


def test_own_organization_requires_sign_in(client: TestClient) -> None:
    assert client.get("/api/organizations/me").status_code == 401
    assert update(client, phone="0671234567").status_code == 401


@pytest.mark.usefixtures("organization_id")
def test_owner_updates_contacts(client: TestClient, db, city_id: int) -> None:
    async def create_city(session) -> int:
        city = City(name="Київ", region="Київська")
        session.add(city)
        await session.flush()
        return city.id

    new_city_id = db(create_city)

    response = update(
        client,
        email=" New@Dobri.org.ua ",
        phone="(050) 111-22-33",
        city_id=new_city_id,
        description="  Новий опис ",
    )

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "new@dobri.org.ua"
    assert body["phone"] == "+380501112233"
    assert body["city_id"] == new_city_id
    assert body["description"] == "Новий опис"
    assert body["role"] == "owner"
    assert client.get("/api/organizations/me").json() == body
    organization = stored(db, body["id"])
    assert organization.phone == "+380501112233"
    assert organization.city_id == new_city_id


def test_omitted_fields_stay_unchanged(client: TestClient, form: dict, organization_id) -> None:
    response = update(client, phone="0501112233")

    assert response.status_code == 200
    body = response.json()
    assert body["phone"] == "+380501112233"
    assert body["email"] == form["email"]
    assert body["city_id"] == form["city_id"]
    assert body["description"] == form["description"]


@pytest.mark.usefixtures("organization_id")
@pytest.mark.parametrize("value", [None, "", "  "])
def test_description_can_be_cleared(client: TestClient, value) -> None:
    response = update(client, description=value)

    assert response.status_code == 200
    assert response.json()["description"] is None


@pytest.mark.usefixtures("organization_id")
def test_empty_update_changes_nothing(client: TestClient) -> None:
    before = client.get("/api/organizations/me").json()

    response = update(client)

    assert response.status_code == 200
    assert response.json() == before


def test_admin_can_update(client: TestClient, db, make_user, organization_id: int) -> None:
    admin_id = make_user()
    add_member(db, organization_id, admin_id, OrgMemberRoleEnum.admin)
    sign_in(client, admin_id)

    assert update(client, phone="0501112233").status_code == 200


def test_member_cannot_update(client: TestClient, db, make_user, organization_id: int) -> None:
    member_id = make_user()
    add_member(db, organization_id, member_id, OrgMemberRoleEnum.member)
    sign_in(client, member_id)

    assert update(client, phone="0501112233").status_code == 403
    assert stored(db, organization_id).phone == "+380671234567"


def test_blocked_organization_cannot_be_updated(
    client: TestClient, db, organization_id: int
) -> None:
    set_status(db, organization_id, OrgStatusEnum.blocked)

    assert update(client, phone="0501112233").status_code == 403
    assert stored(db, organization_id).phone == "+380671234567"


@pytest.mark.parametrize(
    "org_status", [OrgStatusEnum.pending, OrgStatusEnum.approved, OrgStatusEnum.rejected]
)
def test_not_blocked_organization_can_be_updated(
    client: TestClient, db, organization_id: int, org_status: OrgStatusEnum
) -> None:
    set_status(db, organization_id, org_status)

    assert update(client, phone="0501112233").status_code == 200


@pytest.mark.usefixtures("organization_id")
@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("name", "Інша назва"),
        ("edrpou", "21133352"),
        ("status", "approved"),
        ("created_by", 1),
        ("id", 1),
    ],
)
def test_protected_fields_cannot_be_updated(client: TestClient, field: str, value) -> None:
    before = client.get("/api/organizations/me").json()

    response = update(client, **{field: value})

    assert response.status_code == 422
    assert error_fields(response) == {field}
    assert client.get("/api/organizations/me").json() == before


@pytest.mark.usefixtures("organization_id")
@pytest.mark.parametrize("field", ["email", "phone", "city_id"])
def test_required_field_cannot_be_null(client: TestClient, field: str) -> None:
    response = update(client, **{field: None})

    assert response.status_code == 422
    assert error_fields(response) == {field}


@pytest.mark.usefixtures("organization_id")
@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("email", "not-an-email"),
        ("phone", "+48123456789"),
        ("description", "x" * 2001),
        ("city_id", 0),
        ("city_id", 2**31),
    ],
)
def test_invalid_update_is_rejected(client: TestClient, field: str, value) -> None:
    response = update(client, **{field: value})

    assert response.status_code == 422
    assert error_fields(response) == {field}


@pytest.mark.usefixtures("organization_id")
def test_update_with_unknown_city_is_rejected(client: TestClient) -> None:
    response = update(client, city_id=999_999_999)

    assert response.status_code == 422
    assert response.json()["detail"][0]["type"] == "city_not_found"


def test_me_reports_organization_and_role(
    client: TestClient, form: dict, organization_id: int
) -> None:
    me = client.get("/api/auth/me").json()

    assert me["organization"] == {
        "id": organization_id,
        "name": form["name"],
        "status": "pending",
        "role": "owner",
    }


@pytest.mark.usefixtures("user_id")
def test_me_without_organization(client: TestClient) -> None:
    assert client.get("/api/auth/me").json()["organization"] is None


@pytest.mark.parametrize("role", list(OrgMemberRoleEnum))
def test_blocked_organization_is_still_readable(
    client: TestClient, db, make_user, organization_id: int, role: OrgMemberRoleEnum
) -> None:
    set_status(db, organization_id, OrgStatusEnum.blocked)
    member_id = make_user()
    add_member(db, organization_id, member_id, role)
    sign_in(client, member_id)

    response = client.get("/api/organizations/me")

    assert response.status_code == 200
    assert response.json()["status"] == "blocked"


def test_update_locks_rows_until_saved(client: TestClient, organization_id: int) -> None:
    statements: list[str] = []

    def capture(conn, cursor, statement, parameters, context, executemany) -> None:
        statements.append(statement)

    event.listen(engine.sync_engine, "before_cursor_execute", capture)
    try:
        client.get("/api/organizations/me")
        reads = len(statements)
        assert update(client, phone="0501112233").status_code == 200
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", capture)

    # Читання нічого не блокує, а зміна блокує членство й організацію до збереження
    assert not any("FOR UPDATE" in statement for statement in statements[:reads])
    assert any("FOR UPDATE" in statement for statement in statements[reads:])


def test_update_schema_does_not_accept_null_for_required_fields() -> None:
    properties = app.openapi()["components"]["schemas"]["OrganizationUpdate"]["properties"]

    for field in ("email", "phone", "city_id"):
        assert "anyOf" not in properties[field], field
    assert {"type": "null"} in properties["description"]["anyOf"]


def test_me_reports_role_of_non_owner(client: TestClient, db, make_user, organization_id) -> None:
    set_status(db, organization_id, OrgStatusEnum.approved)
    admin_id = make_user()
    add_member(db, organization_id, admin_id, OrgMemberRoleEnum.admin)
    sign_in(client, admin_id)

    organization = client.get("/api/auth/me").json()["organization"]

    assert organization["id"] == organization_id
    assert organization["role"] == "admin"
    assert organization["status"] == "approved"
