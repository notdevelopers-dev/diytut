from fastapi import APIRouter
from sqlalchemy import text

from app.db import DbSessionDep

router = APIRouter()


@router.get("/health")
async def health(db_session: DbSessionDep) -> dict[str, str]:
    await db_session.execute(text("SELECT 1"))
    return {"status": "ok"}
