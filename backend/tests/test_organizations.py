from datetime import date

import pytest
from fastapi.testclient import TestClient

from app import auth
from app.models.base import City, Organization, OrganizationMember, User
from app.routers import organizations as organizations_router
from app.schemas.organizations import _check_edrpou

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
def test_user_can_have_only_one_organization(client: TestClient, form: dict) -> None:
    assert create(client, form).status_code == 201

    response = create(client, form, edrpou="21133352")

    assert response.status_code == 409


@pytest.mark.usefixtures("user_id")
def test_second_organization_between_check_and_insert(
    client: TestClient, form: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert create(client, form).status_code == 201

    async def no_organization(session, user_id: int) -> None:
        return None

    monkeypatch.setattr(organizations_router, "get_user_organization_id", no_organization)

    assert create(client, form, edrpou="21133352").status_code == 409


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

    monkeypatch.setattr(organizations_router, "is_edrpou_taken", not_taken)
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
