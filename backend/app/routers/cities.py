from fastapi import APIRouter
from sqlalchemy import select

from app.db import SessionDep
from app.models.base import City
from app.schemas.users import CityRead

router = APIRouter(prefix="/cities", tags=["cities"])


@router.get("")
async def list_cities(session: SessionDep) -> list[CityRead]:
    # Українська абетка: без цього Є, І та Ї опиняються перед А
    cities = await session.scalars(select(City).order_by(City.name.collate("uk-x-icu")))
    return [CityRead.model_validate(city) for city in cities]
