import os

# Налаштування для тестів; змінні з оточення контейнера мають пріоритет
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-client-secret")
os.environ.setdefault("GOOGLE_REDIRECT_URI", "http://testserver/api/auth/google/callback")
os.environ.setdefault("SECRET_KEY", "test-secret-key-at-least-32-bytes-long")
os.environ.setdefault("COOKIE_SECURE", "false")

from collections.abc import AsyncIterator, Callable, Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession

from app import auth
from app.db import engine, get_session
from app.main import app

GOOGLE_CLAIMS = {
    "sub": "google-123",
    "email": "Taras@Example.com",
    "email_verified": True,
    "given_name": "Тарас",
    "family_name": "Шевченко",
}


@pytest.fixture(scope="session")
def _shared_client() -> Iterator[TestClient]:
    # Один клієнт, а отже й один event loop, на всі тести: пул з'єднань БД прив'язаний до loop
    with TestClient(app, follow_redirects=False) as client:
        yield client


@pytest.fixture
def db_session(_shared_client: TestClient) -> Iterator[AsyncSession]:
    """Сесія всередині транзакції, яку після тесту відкочуємо: у БД нічого не лишається.

    commit і rollback у коді застосунку працюють із точками збереження всередині неї.
    """
    portal = _shared_client.portal

    async def begin() -> tuple[AsyncConnection, AsyncSession]:
        connection = await engine.connect()
        await connection.begin()
        session = AsyncSession(
            bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )
        return connection, session

    async def rollback(connection: AsyncConnection, session: AsyncSession) -> None:
        await session.close()
        await connection.rollback()
        await connection.close()

    connection, session = portal.call(begin)
    yield session
    portal.call(rollback, connection, session)


@pytest.fixture
def client(_shared_client: TestClient, db_session: AsyncSession) -> Iterator[TestClient]:
    async def get_test_session() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_session] = get_test_session
    yield _shared_client
    app.dependency_overrides.clear()
    _shared_client.cookies.clear()


@pytest.fixture
def db(client: TestClient, db_session: AsyncSession) -> Callable[..., Any]:
    """Виконує async-функцію з сесією БД тесту в тому ж event loop, що й застосунок."""

    def run(fn: Callable[..., Any]) -> Any:
        async def wrapper() -> Any:
            result = await fn(db_session)
            await db_session.commit()
            return result

        return client.portal.call(wrapper)

    return run


@pytest.fixture
def google_returns(monkeypatch: pytest.MonkeyPatch) -> Callable[[dict], None]:
    """Підміняє обмін коду на токен у Google заданими claims з ID-токена."""

    def _set(claims: dict) -> None:
        async def fake_authorize_access_token(request):
            return {"userinfo": claims}

        monkeypatch.setattr(
            auth.oauth.google, "authorize_access_token", fake_authorize_access_token
        )

    return _set
