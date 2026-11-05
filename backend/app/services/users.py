import secrets

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.base import User

GENERATED_NICKNAME_PREFIX = "volunteer_"
NICKNAME_ATTEMPTS = 5


async def get_user_id_by_google_sub(session: AsyncSession, google_sub: str) -> int | None:
    return await session.scalar(select(User.id).where(User.google_sub == google_sub))


async def get_user_with_details(session: AsyncSession, user_id: int) -> User | None:
    """Користувач разом із містом."""
    query = select(User).options(joinedload(User.city)).where(User.id == user_id)
    return await session.scalar(query)


async def get_user_for_update(session: AsyncSession, user_id: int) -> User | None:
    """Користувач, заблокований до кінця транзакції для безпечного оновлення."""
    query = (
        select(User)
        .where(User.id == user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return await session.scalar(query)


async def is_nickname_taken(session: AsyncSession, nickname: str) -> bool:
    found = await session.scalar(select(User.id).where(User.nickname == nickname))
    return found is not None


async def is_nickname_taken_by_other(session: AsyncSession, nickname: str, user_id: int) -> bool:
    found = await session.scalar(
        select(User.id).where(User.nickname == nickname, User.id != user_id)
    )
    return found is not None


def generate_nickname() -> str:
    return GENERATED_NICKNAME_PREFIX + secrets.token_hex(3)


async def free_generated_nickname(session: AsyncSession) -> str:
    for _ in range(NICKNAME_ATTEMPTS):
        nickname = generate_nickname()
        if not await is_nickname_taken(session, nickname):
            return nickname
    raise RuntimeError("Could not generate a free nickname")
