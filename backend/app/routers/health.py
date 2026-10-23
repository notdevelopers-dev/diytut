from fastapi import APIRouter
from sqlalchemy import text

from app.db import SessionDep

router = APIRouter(tags=["service"])


@router.get("/health")
async def health(session: SessionDep) -> dict[str, str]:
    await session.execute(text("SELECT 1"))
    return {"status": "ok"}
