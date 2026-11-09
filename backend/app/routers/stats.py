from fastapi import APIRouter
from sqlalchemy import func, select

from app.db import DbSessionDep
from app.models import Organization, OrgStatusEnum, Project, ProjectStatusEnum, User
from app.schemas.stats import PlatformStatsRead

router = APIRouter()


@router.get("", response_model=PlatformStatsRead)
async def get_stats(db_session: DbSessionDep) -> PlatformStatsRead:
    volunteers_count = await db_session.scalar(select(func.count(User.id))) or 0
    organizations_count = (
        await db_session.scalar(
            select(func.count(Organization.id)).where(Organization.status == OrgStatusEnum.approved)
        )
        or 0
    )
    projects_count = (
        await db_session.scalar(
            select(func.count(Project.id)).where(Project.status == ProjectStatusEnum.published)
        )
        or 0
    )

    return PlatformStatsRead(
        volunteers_count=volunteers_count,
        organizations_count=organizations_count,
        projects_count=projects_count,
    )
