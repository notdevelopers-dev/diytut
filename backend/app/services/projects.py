from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import errors
from app.models import OrgStatusEnum, Project, ProjectStatusEnum
from app.schemas.projects import ProjectCreate
from app.services.cities import ensure_city_exists
from app.services.organizations import EDITOR_ROLES, get_user_membership


def _escape_like(value: str) -> str:
    """Екранує %, _ і \\, щоб пошуковий запит не працював як шаблон LIKE."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def list_active_projects(
    db_session: AsyncSession,
    *,
    limit: int,
    offset: int,
    search: str | None = None,
    city_id: int | None = None,
) -> list[Project]:
    """Каталог: опубліковані проєкти, які ще не завершилися."""
    query = select(Project).where(
        Project.status == ProjectStatusEnum.published,
        Project.ends_at > func.now(),
    )
    if search and search.strip():
        pattern = f"%{_escape_like(search.strip())}%"
        query = query.where(or_(Project.title.ilike(pattern), Project.description.ilike(pattern)))
    if city_id is not None:
        query = query.where(Project.city_id == city_id)

    query = query.order_by(Project.created_at.desc(), Project.id.desc()).limit(limit).offset(offset)
    return list(await db_session.scalars(query))


async def get_published_project(db_session: AsyncSession, project_id: int) -> Project:
    project = await db_session.scalar(
        select(Project).where(
            Project.id == project_id,
            Project.status == ProjectStatusEnum.published,
        )
    )
    if project is None:
        raise errors.project_not_found()
    return project


async def create_project(db_session: AsyncSession, user_id: int, data: ProjectCreate) -> Project:
    # Блокування: роль і статус організації не зміняться, доки проєкт не збережено
    membership = await get_user_membership(db_session, user_id, data.organization_id, lock=True)
    if membership is None:
        if data.organization_id is not None:
            raise errors.project_requires_membership()
        raise errors.project_requires_organization()
    if membership.role not in EDITOR_ROLES:
        raise errors.not_project_manager()
    # Публікувати можуть лише схвалені організації (R-12, розділ 4.3 scope)
    if membership.organization.status == OrgStatusEnum.blocked:
        raise errors.organization_blocked()
    if membership.organization.status != OrgStatusEnum.approved:
        raise errors.organization_not_approved()

    if data.city_id is not None:
        await ensure_city_exists(db_session, data.city_id)

    project = Project(
        organization_id=membership.organization_id,
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
    return project
