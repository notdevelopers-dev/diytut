from datetime import date

import pytest
from fastapi.testclient import TestClient

from app import auth
from app.models import City, Organization, OrganizationMember, OrgMemberRoleEnum, User


@pytest.fixture
def city_id(db) -> int:
    async def create(session) -> int:
        city = City(name="Київ", region="Київська")
        session.add(city)
        await session.flush()
        return city.id

    return db(create)


@pytest.fixture
def second_city_id(db) -> int:
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
        patronymic="Григорович",
        nickname=f"user_{n}",
        phone="+380671234567",
        birth_date=date(1990, 3, 9),
        bio="Тестова біографія",
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
    client.cookies.set("session", token, domain="testserver.local", path="/api")


# --- GET /api/users/me ---


def test_get_profile_requires_auth(client: TestClient) -> None:
    response = client.get("/api/users/me")
    assert response.status_code == 401


def test_get_profile_success(client: TestClient, make_user) -> None:
    user_id = make_user()
    sign_in(client, user_id)

    response = client.get("/api/users/me")
    assert response.status_code == 200

    data = response.json()
    assert data["id"] == user_id
    assert data["email"] == "user1@example.com"
    assert data["first_name"] == "Тарас"
    assert data["last_name"] == "Шевченко"
    assert data["patronymic"] == "Григорович"
    assert data["nickname"] == "user_1"
    assert data["phone"] == "+380671234567"
    assert data["birth_date"] == "1990-03-09"
    assert data["gender"] == "prefer_not_to_say"
    assert data["bio"] == "Тестова біографія"
    assert data["city_id"] is not None
    assert data["city"] == {"id": data["city_id"], "name": "Київ", "region": "Київська"}


def test_get_profile_nonexistent_user(client: TestClient) -> None:
    sign_in(client, 999999)
    response = client.get("/api/users/me")
    assert response.status_code == 404


# --- PATCH /api/users/me ---


def test_patch_profile_requires_auth(client: TestClient) -> None:
    response = client.patch("/api/users/me", json={"first_name": "Іван"})
    assert response.status_code == 401


def test_patch_profile_partial_update(client: TestClient, make_user) -> None:
    user_id = make_user()
    sign_in(client, user_id)

    response = client.patch(
        "/api/users/me",
        json={"first_name": "Богдан", "bio": "Оновлений опис", "phone": "+380991112233"},
    )
    assert response.status_code == 200

    data = response.json()
    assert data["first_name"] == "Богдан"
    assert data["last_name"] == "Шевченко"  # незмінне
    assert data["bio"] == "Оновлений опис"
    assert data["phone"] == "+380991112233"


def test_patch_profile_change_city(client: TestClient, make_user, second_city_id: int) -> None:
    user_id = make_user()
    sign_in(client, user_id)

    response = client.patch("/api/users/me", json={"city_id": second_city_id})
    assert response.status_code == 200

    data = response.json()
    assert data["city_id"] == second_city_id
    assert data["city"] == {"id": second_city_id, "name": "Львів", "region": "Львівська"}


def test_patch_profile_invalid_city(client: TestClient, make_user) -> None:
    user_id = make_user()
    sign_in(client, user_id)

    response = client.patch("/api/users/me", json={"city_id": 999999})
    assert response.status_code == 422
    error = response.json()["detail"][0]
    assert error["loc"] == ["body", "city_id"]
    assert error["type"] == "city_not_found"


def test_patch_profile_keep_own_nickname(client: TestClient, make_user) -> None:
    user_id = make_user()
    sign_in(client, user_id)

    response = client.patch("/api/users/me", json={"nickname": "user_1"})
    assert response.status_code == 200
    assert response.json()["nickname"] == "user_1"


def test_patch_profile_change_nickname_success(client: TestClient, make_user) -> None:
    user_id = make_user()
    sign_in(client, user_id)

    response = client.patch("/api/users/me", json={"nickname": "new_unique_nick"})
    assert response.status_code == 200
    assert response.json()["nickname"] == "new_unique_nick"


def test_patch_profile_nickname_conflict(client: TestClient, make_user) -> None:
    make_user()
    user2_id = make_user()

    sign_in(client, user2_id)
    # Спроба взяти нікнейм user_1
    response = client.patch("/api/users/me", json={"nickname": "user_1"})
    assert response.status_code == 409
    error = response.json()["detail"][0]
    assert error["loc"] == ["body", "nickname"]
    assert error["type"] == "nickname_taken"


def test_patch_profile_rejects_null_for_required_fields(client: TestClient, make_user) -> None:
    user_id = make_user()
    sign_in(client, user_id)

    required_fields = (
        "first_name",
        "last_name",
        "nickname",
        "phone",
        "birth_date",
        "gender",
        "city_id",
    )
    for field in required_fields:
        response = client.patch("/api/users/me", json={field: None})
        assert response.status_code == 422, f"Expected 422 for {field}=null"


def test_patch_profile_allows_null_for_optional_fields(client: TestClient, make_user) -> None:
    user_id = make_user()
    sign_in(client, user_id)

    response = client.patch("/api/users/me", json={"patronymic": None, "bio": None})
    assert response.status_code == 200
    data = response.json()
    assert data["patronymic"] is None
    assert data["bio"] is None


def test_patch_profile_forbids_extra_fields(client: TestClient, make_user) -> None:
    user_id = make_user()
    sign_in(client, user_id)

    response = client.patch("/api/users/me", json={"email": "hacked@example.com"})
    assert response.status_code == 422

    response = client.patch("/api/users/me", json={"platform_role": "admin"})
    assert response.status_code == 422

    response = client.patch("/api/users/me", json={"id": 123})
    assert response.status_code == 422


def test_patch_profile_empty_body(client: TestClient, make_user) -> None:
    user_id = make_user()
    sign_in(client, user_id)

    response = client.patch("/api/users/me", json={})
    assert response.status_code == 200
    assert response.json()["id"] == user_id


# --- GET /api/users/me/organizations & switching ---


def test_get_my_organizations_requires_auth(client: TestClient) -> None:
    response = client.get("/api/users/me/organizations")
    assert response.status_code == 401


def test_get_my_organizations_empty(client: TestClient, make_user) -> None:
    user_id = make_user()
    sign_in(client, user_id)

    response = client.get("/api/users/me/organizations")
    assert response.status_code == 200
    assert response.json() == []


def test_get_my_organizations_with_membership(
    client: TestClient, make_user, db, city_id: int
) -> None:
    user_id = make_user()
    sign_in(client, user_id)

    # Створюємо організацію для користувача
    async def create_org(session) -> int:
        org = Organization(
            name="Благодійний Фонд Світло",
            email="info@svitlo.org",
            phone="+380671112233",
            city_id=city_id,
            created_by=user_id,
        )
        session.add(org)
        await session.flush()
        member = OrganizationMember(
            organization_id=org.id,
            user_id=user_id,
            role=OrgMemberRoleEnum.owner,
        )
        session.add(member)
        await session.flush()
        return org.id

    org_id = db(create_org)

    # 1. Перевірка GET /api/users/me/organizations
    response = client.get("/api/users/me/organizations")
    assert response.status_code == 200
    orgs = response.json()
    assert len(orgs) == 1
    assert orgs[0]["id"] == org_id
    assert orgs[0]["name"] == "Благодійний Фонд Світло"
    assert orgs[0]["status"] == "pending"
    assert orgs[0]["role"] == "owner"

    # 2. Перевірка GET /api/auth/me містить дані організації для перемикання режиму
    auth_me = client.get("/api/auth/me")
    assert auth_me.status_code == 200
    auth_data = auth_me.json()
    assert auth_data["organization"] is not None
    assert auth_data["organization"]["id"] == org_id
    assert auth_data["organization"]["name"] == "Благодійний Фонд Світло"
    assert auth_data["organization"]["role"] == "owner"


# --- Logout ---


def test_logout_revokes_volunteer_access(client: TestClient, make_user) -> None:
    user_id = make_user()
    sign_in(client, user_id)

    # Профіль доступний
    assert client.get("/api/users/me").status_code == 200

    # Вихід
    logout_res = client.post("/api/auth/logout")
    assert logout_res.status_code == 204

    # Профіль більше недоступний
    assert client.get("/api/users/me").status_code == 401
