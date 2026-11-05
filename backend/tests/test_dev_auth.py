from datetime import date

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings, settings
from app.models.base import City, User
from app.routers import auth as auth_router


@pytest.fixture
def dev_login(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "dev_login", True)


@pytest.fixture
def city_id(db) -> int:
    async def create(session) -> int:
        city = City(name="Львів", region="Львівська")
        session.add(city)
        await session.flush()
        return city.id

    return db(create)


@pytest.fixture
def existing_user(db, city_id: int) -> int:
    async def create(session) -> int:
        user = User(
            google_sub="real-google-sub",
            email="taras@example.com",
            first_name="Тарас",
            last_name="Шевченко",
            nickname="taras",
            phone="+380671234567",
            birth_date=date(1990, 3, 9),
            city_id=city_id,
        )
        session.add(user)
        await session.flush()
        return user.id

    return db(create)


def dev_sign_in(client: TestClient, **fields: str):
    return client.post("/api/auth/dev/login", data=fields)


def test_dev_login_is_off_by_default(client: TestClient) -> None:
    assert client.get("/api/auth/dev/login").status_code == 404
    assert dev_sign_in(client, email="new@example.com").status_code == 404


@pytest.mark.usefixtures("dev_login")
def test_google_login_redirects_to_dev_page(client: TestClient) -> None:
    response = client.get("/api/auth/google/login")

    assert response.status_code == 302
    assert response.headers["location"] == auth_router.DEV_LOGIN_URL


@pytest.mark.usefixtures("dev_login")
def test_dev_page_lists_existing_users(client: TestClient, existing_user: int) -> None:
    response = client.get("/api/auth/dev/login")

    assert response.status_code == 200
    assert 'value="taras@example.com"' in response.text


@pytest.mark.usefixtures("dev_login")
def test_new_dev_user_goes_to_registration(client: TestClient, city_id: int, db_session) -> None:
    response = dev_sign_in(client, email=" New@Example.com ", first_name="Леся")

    assert response.headers["location"] == auth_router.REGISTRATION_URL
    assert client.get("/api/auth/me").json() == {
        "status": "registration_required",
        "email": "new@example.com",
        "first_name": "Леся",
        "last_name": None,
    }

    # Далі — звичайна реєстрація, як після Google
    registered = client.post(
        "/api/auth/register",
        json={
            "first_name": "Леся",
            "last_name": "Українка",
            "phone": "+380671234568",
            "birth_date": "1990-02-25",
            "city_id": city_id,
        },
    )
    assert registered.status_code == 201
    assert client.get("/api/auth/me").json()["status"] == "authenticated"


@pytest.mark.usefixtures("dev_login")
def test_existing_user_gets_session_by_email(client: TestClient, existing_user: int) -> None:
    response = dev_sign_in(client, email="Taras@Example.com")

    assert response.headers["location"] == auth_router.AFTER_LOGIN_URL
    me = client.get("/api/auth/me").json()
    assert me["status"] == "authenticated"
    assert me["user"]["id"] == existing_user


@pytest.mark.usefixtures("dev_login")
def test_dev_login_requires_email(client: TestClient) -> None:
    assert dev_sign_in(client, email="").status_code == 422


def test_google_keys_are_required_without_dev_login() -> None:
    with pytest.raises(ValidationError, match="GOOGLE_CLIENT_ID"):
        Settings(google_client_id="", dev_login=False)


def test_google_keys_are_optional_with_dev_login() -> None:
    config = Settings(
        google_client_id="",
        google_client_secret="",
        google_redirect_uri="",
        dev_login=True,
        cookie_secure=False,
    )
    assert config.dev_login


def test_dev_login_is_refused_with_secure_cookies() -> None:
    with pytest.raises(ValidationError, match="COOKIE_SECURE"):
        Settings(dev_login=True, cookie_secure=True)
