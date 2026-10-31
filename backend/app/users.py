import secrets

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import User

GENERATED_NICKNAME_PREFIX = "volunteer_"
NICKNAME_ATTEMPTS = 5


async def get_user_id_by_google_sub(session: AsyncSession, google_sub: str) -> int | None:
    return await session.scalar(select(User.id).where(User.google_sub == google_sub))


async def is_nickname_taken(session: AsyncSession, nickname: str) -> bool:
    found = await session.scalar(select(User.id).where(User.nickname == nickname))
    return found is not None


def generate_nickname() -> str:
    return GENERATED_NICKNAME_PREFIX + secrets.token_hex(3)


async def free_generated_nickname(session: AsyncSession) -> str:
    for _ in range(NICKNAME_ATTEMPTS):
        nickname = generate_nickname()
        if not await is_nickname_taken(session, nickname):
            return nickname
    raise RuntimeError("Could not generate a free nickname")
