from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import errors
from app.models import City


async def list_cities(db_session: AsyncSession) -> list[City]:
    # Українська абетка: без цього Є, І та Ї опиняються перед А
    cities = await db_session.scalars(select(City).order_by(City.name.collate("uk-x-icu")))
    return list(cities)


async def ensure_city_exists(db_session: AsyncSession, city_id: int) -> None:
    # Схема перевіряє лише формат id; чи є таке місто, знає тільки БД
    if await db_session.get(City, city_id) is None:
        raise errors.city_not_found()
