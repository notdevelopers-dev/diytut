import secrets
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app import errors
from app.auth import GoogleIdentity
from app.db import violated_constraint
from app.models import User
from app.schemas.users import RegistrationRequest, UserUpdate
from app.services.cities import ensure_city_exists

GENERATED_NICKNAME_PREFIX = "volunteer_"
NICKNAME_ATTEMPTS = 5


async def get_user_id_by_google_sub(db_session: AsyncSession, google_sub: str) -> int | None:
    return await db_session.scalar(select(User.id).where(User.google_sub == google_sub))


async def get_user_with_details(db_session: AsyncSession, user_id: int) -> User | None:
    """Користувач разом із містом."""
    query = select(User).options(joinedload(User.city)).where(User.id == user_id)
    return await db_session.scalar(query)


async def get_user_for_update(db_session: AsyncSession, user_id: int) -> User | None:
    """Користувач, заблокований до кінця транзакції для безпечного оновлення."""
    query = (
        select(User)
        .where(User.id == user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return await db_session.scalar(query)


async def is_nickname_taken(db_session: AsyncSession, nickname: str) -> bool:
    found = await db_session.scalar(select(User.id).where(User.nickname == nickname))
    return found is not None


async def is_nickname_taken_by_other(db_session: AsyncSession, nickname: str, user_id: int) -> bool:
    found = await db_session.scalar(
        select(User.id).where(User.nickname == nickname, User.id != user_id)
    )
    return found is not None


def generate_nickname() -> str:
    return GENERATED_NICKNAME_PREFIX + secrets.token_hex(3)


async def free_generated_nickname(db_session: AsyncSession) -> str:
    for _ in range(NICKNAME_ATTEMPTS):
        nickname = generate_nickname()
        if not await is_nickname_taken(db_session, nickname):
            return nickname
    raise RuntimeError("Could not generate a free nickname")


async def register_user(
    db_session: AsyncSession, identity: GoogleIdentity, data: RegistrationRequest
) -> User:
    await ensure_city_exists(db_session, data.city_id)

    if data.nickname is None:
        nickname = await free_generated_nickname(db_session)
    elif await is_nickname_taken(db_session, data.nickname):
        raise errors.nickname_taken()
    else:
        nickname = data.nickname

    user = User(
        **data.model_dump(exclude={"nickname"}),
        nickname=nickname,
        google_sub=identity.sub,
        email=identity.email.lower(),
        profile_completed_at=datetime.now(UTC),
    )
    db_session.add(user)
    try:
        await db_session.commit()
    except IntegrityError as error:
        # Хтось встиг зайняти нікнейм між перевіркою й записом, або форму відправили двічі
        await db_session.rollback()
        if violated_constraint(error) == "uq_users_nickname":
            raise errors.nickname_taken() from error
        raise errors.user_already_registered() from error
    return user


async def get_profile(db_session: AsyncSession, user_id: int) -> User:
    user = await get_user_with_details(db_session, user_id)
    if user is None:
        raise errors.user_not_found()
    return user


async def update_profile(db_session: AsyncSession, user_id: int, data: UserUpdate) -> User:
    user = await get_user_for_update(db_session, user_id)
    if user is None:
        raise errors.user_not_found()

    changes = data.model_dump(exclude_unset=True)
    if changes:
        if changes.get("city_id") is not None:
            await ensure_city_exists(db_session, changes["city_id"])
        if changes.get("nickname") is not None and await is_nickname_taken_by_other(
            db_session, changes["nickname"], user_id
        ):
            raise errors.nickname_taken()

        for field, value in changes.items():
            setattr(user, field, value)

        try:
            await db_session.commit()
        except IntegrityError as error:
            await db_session.rollback()
            if violated_constraint(error) == "uq_users_nickname":
                raise errors.nickname_taken() from error
            raise

    # Місто потрібне для відповіді, а після commit зв'язок міг змінитися
    await db_session.refresh(user, attribute_names=["city"])
    return user
