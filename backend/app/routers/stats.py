from fastapi import APIRouter

from app.db import DbSessionDep
from app.schemas.stats import PlatformStatsRead
from app.services import stats as service

router = APIRouter()


@router.get("")
async def get_stats(db_session: DbSessionDep) -> PlatformStatsRead:
    return await service.get_public_stats(db_session)
