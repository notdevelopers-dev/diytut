from fastapi import APIRouter

from app.db import DbSessionDep
from app.schemas.users import CityRead
from app.services import cities as service

router = APIRouter()


@router.get("")
async def list_cities(db_session: DbSessionDep) -> list[CityRead]:
    return [CityRead.model_validate(city) for city in await service.list_cities(db_session)]
