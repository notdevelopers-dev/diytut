from datetime import date

import pytest
from sqlalchemy import delete, inspect, select, text
from sqlalchemy.exc import IntegrityError

from app.db import violated_constraint
from app.models import City, Notification, NotificationTypeEnum, User


@pytest.fixture
def user_ids(db) -> tuple[int, int]:
    async def create(session) -> tuple[int, int]:
        city = City(name="Львів", region="Львівська")
        session.add(city)
        await session.flush()
        users = [
            User(
                google_sub=f"google-{n}",
                email=f"user{n}@example.com",
                first_name="Тарас",
                last_name="Шевченко",
                phone="+380671234567",
                birth_date=date(1990, 3, 9),
                city_id=city.id,
            )
            for n in (1, 2)
        ]
        session.add_all(users)
        await session.flush()
        return users[0].id, users[1].id

    return db(create)


def _notification(user_id: int, **changes) -> Notification:
    fields = {
        "user_id": user_id,
        "type": NotificationTypeEnum.join_request_accepted,
        "title": "Заявку прийнято",
        "message": "Вашу заявку на участь у проєкті прийнято.",
    } | changes
    return Notification(**fields)


def _add_all(db, *notifications: Notification) -> None:
    async def create(session) -> None:
        session.add_all(notifications)
        await session.flush()

    db(create)


def test_defaults(db, user_ids: tuple[int, int]) -> None:
    notification = _notification(user_ids[0])
    _add_all(db, notification)

    assert notification.is_read is False
    assert notification.link is None
    # Час зберігається з часовою зоною (NF-08)
    assert notification.created_at.tzinfo is not None


def test_is_read_defaults_to_false_in_db(db, user_ids: tuple[int, int]) -> None:
    # Записи, створені в обхід ORM, теж мають бути непрочитаними
    async def create(session) -> bool:
        return await session.scalar(
            text(
                "INSERT INTO notifications (user_id, type, title, message) "
                "VALUES (:user_id, 'organization_approved', 't', 'm') RETURNING is_read"
            ),
            {"user_id": user_ids[0]},
        )

    assert db(create) is False


def test_user_must_exist(db) -> None:
    async def create(session) -> str | None:
        with pytest.raises(IntegrityError) as error:
            async with session.begin_nested():
                session.add(_notification(-1))
                await session.flush()
        return violated_constraint(error.value)

    assert db(create) == "fk_notifications_user_id_users"


def test_only_composite_index_on_user_id_and_is_read(db) -> None:
    async def indexes(session) -> list[dict]:
        connection = await session.connection()
        return await connection.run_sync(lambda sync: inspect(sync).get_indexes("notifications"))

    # Окремий індекс на user_id був би зайвим: його покриває перший стовпець композитного
    assert {index["name"]: index["column_names"] for index in db(indexes)} == {
        "ix_notifications_user_id_is_read": ["user_id", "is_read"]
    }


def test_notifications_are_deleted_with_their_user(db, user_ids: tuple[int, int]) -> None:
    user_id, other_user_id = user_ids
    _add_all(
        db,
        _notification(user_id),
        _notification(user_id, is_read=True),
        _notification(other_user_id),
    )

    async def delete_user(session) -> list[int]:
        # Видаляємо в обхід ORM, щоб спрацював саме ON DELETE CASCADE у БД
        session.expunge_all()
        await session.execute(delete(User).where(User.id == user_id))
        return list(await session.scalars(select(Notification.user_id)))

    assert db(delete_user) == [other_user_id]


def test_db_enum_matches_model(db) -> None:
    # Autogenerate не помічає нових значень enum: забуте в міграції значення впало б лише на вставці
    async def values(session) -> list[str]:
        return await session.scalar(text("SELECT enum_range(NULL::notificationtypeenum)::text[]"))

    assert db(values) == [member.value for member in NotificationTypeEnum]
