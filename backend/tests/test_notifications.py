from datetime import date

import pytest
from sqlalchemy import delete, func, inspect, select, text

from app.models import City, Notification, NotificationTypeEnum, User


@pytest.fixture
def user_id(db) -> int:
    async def create(session) -> int:
        city = City(name="Львів", region="Львівська")
        session.add(city)
        await session.flush()
        user = User(
            google_sub="google-1",
            email="user1@example.com",
            first_name="Тарас",
            last_name="Шевченко",
            phone="+380671234567",
            birth_date=date(1990, 3, 9),
            city_id=city.id,
        )
        session.add(user)
        await session.flush()
        return user.id

    return db(create)


def _notification(user_id: int, **changes) -> Notification:
    fields = {
        "user_id": user_id,
        "type": NotificationTypeEnum.join_request_accepted,
        "title": "Заявку прийнято",
        "message": "Вашу заявку на участь у проєкті прийнято.",
    } | changes
    return Notification(**fields)


def test_defaults(db, user_id: int) -> None:
    notification = _notification(user_id)

    async def create(session) -> None:
        session.add(notification)
        await session.flush()

    db(create)

    assert notification.is_read is False
    assert notification.link is None
    assert notification.created_at is not None


def test_is_read_defaults_to_false_in_db(db, user_id: int) -> None:
    # Записи, створені в обхід ORM, теж мають бути непрочитаними
    async def create(session) -> bool:
        return await session.scalar(
            text(
                "INSERT INTO notifications (user_id, type, title, message) "
                "VALUES (:user_id, 'organization_approved', 't', 'm') RETURNING is_read"
            ),
            {"user_id": user_id},
        )

    assert db(create) is False


def test_composite_index_on_user_id_and_is_read(db) -> None:
    async def indexes(session) -> list[dict]:
        connection = await session.connection()
        return await connection.run_sync(lambda sync: inspect(sync).get_indexes("notifications"))

    by_name = {index["name"]: index for index in db(indexes)}

    assert by_name["ix_notifications_user_id_is_read"]["column_names"] == ["user_id", "is_read"]


def test_notifications_are_deleted_with_user(db, user_id: int) -> None:
    async def run(session) -> int:
        session.add_all([_notification(user_id), _notification(user_id, is_read=True)])
        await session.flush()
        session.expunge_all()
        await session.execute(delete(User).where(User.id == user_id))
        return await session.scalar(select(func.count()).select_from(Notification))

    assert db(run) == 0


def test_db_enum_matches_model(db) -> None:
    # Autogenerate не помічає нових значень enum: забуте в міграції значення впало б лише на вставці
    async def values(session) -> list[str]:
        return await session.scalar(text("SELECT enum_range(NULL::notificationtypeenum)::text[]"))

    assert db(values) == [member.value for member in NotificationTypeEnum]
