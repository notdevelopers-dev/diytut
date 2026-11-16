from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

engine = create_async_engine(settings.database_url, pool_pre_ping=True)
DbSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db_session() -> AsyncIterator[AsyncSession]:
    async with DbSessionLocal() as db_session:
        yield db_session


DbSessionDep = Annotated[AsyncSession, Depends(get_db_session)]


def violated_constraint(error: IntegrityError) -> str | None:
    """Назва обмеження БД, яке порушив запис, якщо asyncpg її повідомив."""
    return getattr(error.orig.__cause__, "constraint_name", None)
