from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import or_, select

from app import errors
from app.auth import CurrentUserId
from app.db import DbSessionDep
from app.models import (
    OrgMemberRoleEnum,
    OrgStatusEnum,
    Project,
    ProjectStatusEnum,
    User,
)
from app.schemas.projects import ProjectCreate, ProjectListItem, ProjectRead
from app.schemas.users import MAX_INT32
from app.services.cities import ensure_city_exists
from app.services.organizations import get_user_membership

router = APIRouter()


def _escape_like(value: str) -> str:
    """Escapes %, _ and \\ characters for SQL LIKE/ILIKE statements."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.get("")
async def list_projects(
    db_session: DbSessionDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0, le=MAX_INT32)] = 0,
    search: Annotated[str | None, Query()] = None,
    city_id: Annotated[int | None, Query(gt=0, le=MAX_INT32)] = None,
) -> list[ProjectListItem]:
    query = select(Project).where(Project.status == ProjectStatusEnum.published)

    if search and search.strip():
        search_pattern = f"%{_escape_like(search.strip())}%"
        query = query.where(
            or_(
                Project.title.ilike(search_pattern),
                Project.description.ilike(search_pattern),
            )
        )

    if city_id is not None:
        query = query.where(Project.city_id == city_id)

    query = query.order_by(Project.created_at.desc(), Project.id.desc()).limit(limit).offset(offset)

    projects = await db_session.scalars(query)
    return [ProjectListItem.model_validate(p) for p in projects]


@router.get("/{id}")
async def get_project(
    id: int,
    db_session: DbSessionDep,
) -> ProjectRead:
    query = select(Project).where(
        Project.id == id,
        Project.status == ProjectStatusEnum.published,
    )
    project = await db_session.scalar(query)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")

    return ProjectRead.model_validate(project)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    db_session: DbSessionDep,
    user_id: CurrentUserId,
) -> ProjectRead:
    if await db_session.get(User, user_id) is None:
        raise errors.not_authenticated()

    member = await get_user_membership(db_session, user_id)
    if member is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "User does not belong to an organization")

    if member.role not in (OrgMemberRoleEnum.owner, OrgMemberRoleEnum.admin):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Only organization owner or admin can create projects",
        )

    if member.organization.status == OrgStatusEnum.blocked:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Organization is blocked")

    if member.organization.status == OrgStatusEnum.rejected:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Organization is rejected")

    if data.city_id is not None:
        await ensure_city_exists(db_session, data.city_id)

    project = Project(
        organization_id=member.organization_id,
        title=data.title,
        description=data.description,
        starts_at=data.starts_at,
        ends_at=data.ends_at,
        is_online=data.is_online,
        city_id=data.city_id,
        address=data.address,
        capacity=data.capacity,
        volunteer_hours=data.volunteer_hours,
        is_adult_only=data.is_adult_only,
        experience_level=data.experience_level,
        tags=data.tags,
        status=ProjectStatusEnum.published,
    )
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)

    return ProjectRead.model_validate(project)
