from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


async def get_user_id_by_email(db_session: AsyncSession, email: str) -> int | None:
    return await db_session.scalar(select(User.id).where(User.email == email))


async def list_recent_users(db_session: AsyncSession, limit: int) -> list[tuple[str, str]]:
    """Email і нікнейм останніх зареєстрованих користувачів для сторінки dev-входу."""
    query = select(User.email, User.nickname).order_by(User.id.desc()).limit(limit)
    return [(email, nickname) for email, nickname in (await db_session.execute(query)).all()]
