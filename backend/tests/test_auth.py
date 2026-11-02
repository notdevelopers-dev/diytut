from datetime import date
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from app import auth
from app.models.base import City, User
from app.routers import auth as auth_router
from tests.conftest import GOOGLE_CLAIMS


@pytest.fixture
def existing_user(db) -> int:
    async def create(session) -> int:
        city = City(name="Київ", region="Київська")
        user = User(
            google_sub=GOOGLE_CLAIMS["sub"],
            email="taras@example.com",
            first_name="Тарас",
            last_name="Шевченко",
            nickname="taras",
            phone="+380671234567",
            birth_date=date(1990, 3, 9),
            city=city,
        )
        session.add(user)
        await session.flush()
        return user.id

    return db(create)


def test_login_redirects_to_google(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    # Без звернення до Google за метаданими
    monkeypatch.setitem(
        auth.oauth.google.server_metadata,
        "authorization_endpoint",
        "https://accounts.google.com/o/oauth2/v2/auth",
    )
    monkeypatch.setitem(auth.oauth.google.server_metadata, "_loaded_at", 0)

    response = client.get("/api/auth/google/login")

    assert response.status_code == 302
    location = urlparse(response.headers["location"])
    assert location.netloc == "accounts.google.com"
    params = parse_qs(location.query)
    assert params["client_id"] == ["test-client-id"]
    assert params["redirect_uri"] == ["http://testserver/api/auth/google/callback"]
    assert params["code_challenge_method"] == ["S256"]
    assert {"state", "nonce", "code_challenge"} <= params.keys()
    assert "oauth_state" in response.cookies


def test_callback_rejects_unknown_state(client: TestClient) -> None:
    response = client.get("/api/auth/google/callback?code=abc&state=forged")

    assert response.status_code == 302
    assert response.headers["location"] == auth_router.LOGIN_FAILED_URL
    assert "session" not in response.cookies


def test_callback_rejects_unverified_email(client: TestClient, google_returns) -> None:
    google_returns({**GOOGLE_CLAIMS, "email_verified": False})

    response = client.get("/api/auth/google/callback?code=abc&state=xyz")

    assert response.headers["location"] == auth_router.LOGIN_FAILED_URL
    assert "session" not in response.cookies
    assert "registration" not in response.cookies


def test_new_user_goes_to_registration(client: TestClient, google_returns) -> None:
    google_returns(GOOGLE_CLAIMS)

    response = client.get("/api/auth/google/callback?code=abc&state=xyz")

    assert response.headers["location"] == auth_router.REGISTRATION_URL
    assert "session" not in response.cookies
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json() == {
        "status": "registration_required",
        "email": "Taras@Example.com",
        "first_name": "Тарас",
        "last_name": "Шевченко",
    }


def test_existing_user_gets_session(client: TestClient, google_returns, existing_user) -> None:
    google_returns(GOOGLE_CLAIMS)

    response = client.get("/api/auth/google/callback?code=abc&state=xyz")

    assert response.headers["location"] == auth_router.AFTER_LOGIN_URL
    me = client.get("/api/auth/me").json()
    assert me["status"] == "authenticated"
    assert me["user"]["id"] == existing_user
    assert me["user"]["nickname"] == "taras"


def test_logout_clears_session(client: TestClient, google_returns, existing_user) -> None:
    google_returns(GOOGLE_CLAIMS)
    client.get("/api/auth/google/callback?code=abc&state=xyz")

    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_me_without_cookies(client: TestClient) -> None:
    assert client.get("/api/auth/me").status_code == 401


def test_session_of_deleted_user_is_rejected(client: TestClient) -> None:
    # Такого id не може бути навіть у БД з даними
    token = auth._encode({"sub": str(2**63 - 1), "typ": "session"}, auth.SESSION_TTL)
    client.cookies.set("session", token, path="/api")

    assert client.get("/api/auth/me").status_code == 401


def test_registration_token_is_not_a_session(client: TestClient) -> None:
    token = auth._encode({"sub": "1", "typ": "registration"}, auth.REGISTRATION_TTL)
    client.cookies.set("session", token, path="/api")

    assert client.get("/api/auth/me").status_code == 401


def test_tampered_session_is_rejected(client: TestClient) -> None:
    token = auth._encode({"sub": "1", "typ": "session"}, auth.SESSION_TTL)
    client.cookies.set("session", token[:-2] + "xx", path="/api")

    assert client.get("/api/auth/me").status_code == 401
