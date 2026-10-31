from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from app import auth
from app.main import app
from app.routers import auth as auth_router

GOOGLE_CLAIMS = {
    "sub": "google-123",
    "email": "taras@example.com",
    "email_verified": True,
    "given_name": "Тарас",
    "family_name": "Шевченко",
}


@pytest.fixture
def client() -> TestClient:
    return TestClient(app, follow_redirects=False)


@pytest.fixture
def google_returns(monkeypatch: pytest.MonkeyPatch):
    """Підміняє обмін коду на токен у Google заданими claims з ID-токена."""

    def _set(claims: dict) -> None:
        async def fake_authorize_access_token(request):
            return {"userinfo": claims}

        monkeypatch.setattr(
            auth.oauth.google, "authorize_access_token", fake_authorize_access_token
        )

    return _set


@pytest.fixture
def existing_user(monkeypatch: pytest.MonkeyPatch) -> int:
    async def fake_lookup(session, google_sub: str) -> int | None:
        return 42 if google_sub == GOOGLE_CLAIMS["sub"] else None

    monkeypatch.setattr(auth_router, "get_user_id_by_google_sub", fake_lookup)
    return 42


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
        "email": "taras@example.com",
        "first_name": "Тарас",
        "last_name": "Шевченко",
    }


def test_existing_user_gets_session(client: TestClient, google_returns, existing_user) -> None:
    google_returns(GOOGLE_CLAIMS)

    response = client.get("/api/auth/google/callback?code=abc&state=xyz")

    assert response.headers["location"] == auth_router.AFTER_LOGIN_URL
    me = client.get("/api/auth/me")
    assert me.json() == {"status": "authenticated", "user_id": existing_user}


def test_logout_clears_session(client: TestClient, google_returns, existing_user) -> None:
    google_returns(GOOGLE_CLAIMS)
    client.get("/api/auth/google/callback?code=abc&state=xyz")

    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_me_without_cookies(client: TestClient) -> None:
    assert client.get("/api/auth/me").status_code == 401


def test_registration_token_is_not_a_session(client: TestClient) -> None:
    token = auth._encode({"sub": "1", "typ": "registration"}, auth.REGISTRATION_TTL)
    client.cookies.set("session", token, path="/api")

    assert client.get("/api/auth/me").status_code == 401


def test_tampered_session_is_rejected(client: TestClient) -> None:
    token = auth._encode({"sub": "1", "typ": "session"}, auth.SESSION_TTL)
    client.cookies.set("session", token[:-2] + "xx", path="/api")

    assert client.get("/api/auth/me").status_code == 401
