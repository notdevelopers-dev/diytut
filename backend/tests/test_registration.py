from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.models.base import City, User
from app.routers import auth as auth_router
from tests.conftest import GOOGLE_CLAIMS


@pytest.fixture
def city_id(db) -> int:
    async def create(session) -> int:
        city = City(name="Львів", region="Львівська")
        session.add(city)
        await session.flush()
        return city.id

    return db(create)


@pytest.fixture
def form(city_id: int) -> dict:
    return {
        "first_name": "Тарас",
        "last_name": "Шевченко",
        "phone": "+380671234567",
        "birth_date": "1990-03-09",
        "city_id": city_id,
    }


@pytest.fixture
def signed_in_with_google(client: TestClient, google_returns) -> None:
    google_returns(GOOGLE_CLAIMS)
    client.get("/api/auth/google/callback?code=abc&state=xyz")


async def _add_other_user(session, city_id: int, nickname: str) -> None:
    session.add(
        User(
            google_sub="google-other",
            email="other@example.com",
            first_name="Леся",
            last_name="Українка",
            nickname=nickname,
            phone="+380501234567",
            birth_date=date(1991, 2, 25),
            city_id=city_id,
        )
    )


def register(client: TestClient, form: dict, **changes):
    return client.post("/api/auth/register", json={**form, **changes})


def error_fields(response) -> set[str]:
    return {error["loc"][-1] for error in response.json()["detail"]}


@pytest.mark.usefixtures("signed_in_with_google")
def test_registration_creates_user_and_session(client: TestClient, form: dict, db) -> None:
    response = register(client, form, nickname="Taras_1814", bio="  Волонтерю з 2022  ")

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "taras@example.com"
    assert body["nickname"] == "taras_1814"
    assert body["gender"] == "prefer_not_to_say"
    assert body["bio"] == "Волонтерю з 2022"
    assert body["platform_role"] == "user"

    me = client.get("/api/auth/me").json()
    assert me == {"status": "authenticated", "user": body}

    user = db(lambda session: session.get(User, body["id"]))
    assert user.google_sub == GOOGLE_CLAIMS["sub"]
    assert user.profile_completed_at is not None


@pytest.mark.usefixtures("signed_in_with_google")
@pytest.mark.parametrize("nickname", [None, "", "   "])
def test_nickname_is_generated_when_missing(client: TestClient, form: dict, nickname) -> None:
    response = register(client, form, nickname=nickname)

    assert response.status_code == 201
    assert response.json()["nickname"].startswith("volunteer_")


@pytest.mark.usefixtures("signed_in_with_google")
def test_nickname_must_be_unique_ignoring_case(
    client: TestClient, form: dict, city_id: int, db
) -> None:
    db(lambda session: _add_other_user(session, city_id, nickname="taras"))

    response = register(client, form, nickname="Taras")

    assert response.status_code == 409
    assert response.json()["detail"][0]["type"] == "nickname_taken"
    assert error_fields(response) == {"nickname"}


@pytest.mark.usefixtures("signed_in_with_google")
def test_nickname_taken_between_check_and_insert(
    client: TestClient, form: dict, city_id: int, db, monkeypatch: pytest.MonkeyPatch
) -> None:
    db(lambda session: _add_other_user(session, city_id, nickname="taras"))

    async def not_taken(session, nickname: str) -> bool:
        return False

    monkeypatch.setattr(auth_router, "is_nickname_taken", not_taken)

    response = register(client, form, nickname="taras")

    assert response.status_code == 409
    assert response.json()["detail"][0]["type"] == "nickname_taken"


@pytest.mark.usefixtures("signed_in_with_google")
@pytest.mark.parametrize(
    "phone", ["+380 67 123 45 67", "380671234567", "0671234567", "(067) 123-45-67"]
)
def test_phone_is_normalized(client: TestClient, form: dict, phone: str) -> None:
    response = register(client, form, phone=phone)

    assert response.status_code == 201
    assert response.json()["phone"] == "+380671234567"


@pytest.mark.usefixtures("signed_in_with_google")
@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("phone", "+48123456789"),
        ("phone", "067123456"),
        ("phone", "+3806712345678"),
        ("first_name", "Тарас1"),
        ("first_name", "   "),
        ("last_name", "-Шевченко"),
        ("patronymic", "Григорович!"),
        ("nickname", "ta"),
        ("nickname", "тарас"),
        ("nickname", "taras shevchenko"),
        ("gender", "other"),
        ("birth_date", "2099-01-01"),
        ("birth_date", "1800-01-01"),
        ("bio", "x" * 2001),
    ],
)
def test_invalid_field_is_rejected(client: TestClient, form: dict, field: str, value) -> None:
    response = register(client, form, **{field: value})

    assert response.status_code == 422
    assert error_fields(response) == {field}


@pytest.mark.usefixtures("signed_in_with_google")
def test_names_with_apostrophes_and_hyphens(client: TestClient, form: dict) -> None:
    response = register(
        client, form, first_name="Мар’яна", last_name="Квітка-Основ'яненко", patronymic="Ілліч"
    )

    assert response.status_code == 201


def years_ago(years: int) -> date:
    today = date.today()
    try:
        return today.replace(year=today.year - years)
    except ValueError:  # 29 лютого
        return today.replace(year=today.year - years, day=28)


@pytest.mark.usefixtures("signed_in_with_google")
def test_user_turning_18_tomorrow_is_rejected(client: TestClient, form: dict) -> None:
    response = register(client, form, birth_date=(years_ago(18) + timedelta(days=1)).isoformat())

    assert response.status_code == 422
    assert error_fields(response) == {"birth_date"}


@pytest.mark.usefixtures("signed_in_with_google")
def test_user_turning_18_today_is_accepted(client: TestClient, form: dict) -> None:
    response = register(client, form, birth_date=years_ago(18).isoformat())

    assert response.status_code == 201


@pytest.mark.usefixtures("signed_in_with_google")
def test_unknown_city_is_rejected(client: TestClient, form: dict) -> None:
    response = register(client, form, city_id=form["city_id"] + 1)

    assert response.status_code == 422
    assert error_fields(response) == {"city_id"}


@pytest.mark.usefixtures("signed_in_with_google")
def test_user_cannot_set_privileged_fields(client: TestClient, form: dict) -> None:
    response = register(client, form, platform_role="admin")

    assert response.status_code == 422
    assert error_fields(response) == {"platform_role"}


@pytest.mark.usefixtures("signed_in_with_google")
def test_registration_cannot_be_repeated(client: TestClient, form: dict) -> None:
    registration_cookie = client.cookies.get("registration")
    assert register(client, form).status_code == 201

    client.cookies.set("registration", registration_cookie, path="/api")
    response = register(client, form, nickname="another_one")

    assert response.status_code == 409


def test_registration_requires_google_sign_in(client: TestClient, form: dict) -> None:
    assert register(client, form).status_code == 401


def test_cities_are_listed_by_name(client: TestClient, db) -> None:
    async def create(session) -> None:
        session.add_all(
            [City(name="Ятестове", region="Тестова"), City(name="Атестове", region="Тестова")]
        )

    db(create)

    response = client.get("/api/cities")

    assert response.status_code == 200
    names = [city["name"] for city in response.json()]
    # У БД є й справжні міста, тож перевіряємо лише порядок доданих
    assert [name for name in names if name.endswith("тестове")] == ["Атестове", "Ятестове"]
