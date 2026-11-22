import time
from decimal import Decimal

from sqlalchemy import ColumnElement, Numeric, Select, and_, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Attendance, Organization, OrgStatusEnum, Project, ProjectStatusEnum, User
from app.schemas.stats import AdminStatsRead, OrganizationStats, PlatformStatsRead, ProjectStats

# Скільки секунд публічний лічильник віддається з пам'яті, без запитів до БД
PUBLIC_STATS_TTL_SECONDS = 60

# Час підрахунку за time.monotonic() і самі лічильники. Кеш живе в пам'яті процесу:
# у проді API працює одним процесом uvicorn, тож кеш спільний для всіх запитів
_public_cache: tuple[float, PlatformStatsRead] | None = None


def _is_active_project() -> ColumnElement[bool]:
    """Проєкт у каталозі: опублікований і ще не завершився, як у list_active_projects."""
    return and_(Project.status == ProjectStatusEnum.published, Project.ends_at > func.now())


def _count(entity, *conditions: ColumnElement[bool]) -> Select[tuple[int]]:
    return select(func.count()).select_from(entity).where(*conditions)


def _total_hours() -> ColumnElement[Decimal]:
    # Усі підтверджені години, зокрема знеособлені після видалення акаунта. Завжди два знаки
    # після коми: без жодного підтвердження відповідь "0.00", а не "0"
    return cast(func.coalesce(func.sum(Attendance.hours), 0), Numeric(12, 2))


async def _fetch_public_stats(db_session: AsyncSession) -> PlatformStatsRead:
    # Один запит із підзапитами замість п'яти окремих
    row = (
        await db_session.execute(
            select(
                _count(User).scalar_subquery().label("volunteers_count"),
                _count(Organization, Organization.status == OrgStatusEnum.approved)
                .scalar_subquery()
                .label("organizations_count"),
                _count(Project, Project.status == ProjectStatusEnum.published)
                .scalar_subquery()
                .label("projects_count"),
                _count(Project, _is_active_project())
                .scalar_subquery()
                .label("active_projects_count"),
                select(_total_hours()).scalar_subquery().label("total_hours"),
            )
        )
    ).one()
    return PlatformStatsRead.model_validate(row._asdict())


async def get_public_stats(db_session: AsyncSession) -> PlatformStatsRead:
    """Лічильники для головної сторінки; можуть відставати від БД до PUBLIC_STATS_TTL_SECONDS.

    Головна — найвідвідуваніша сторінка, а точність до секунди лічильникам не потрібна.
    Одночасні запити після закінчення строку можуть порахувати кілька разів: це дешевше
    за блокування. Модель незмінна, тож спільний для всіх запитів об'єкт ніхто не зіпсує.
    """
    global _public_cache
    now = time.monotonic()
    if _public_cache is not None and now - _public_cache[0] < PUBLIC_STATS_TTL_SECONDS:
        return _public_cache[1]
    stats = await _fetch_public_stats(db_session)
    _public_cache = (now, stats)
    return stats


def clear_public_stats_cache() -> None:
    global _public_cache
    _public_cache = None


async def _organization_stats(db_session: AsyncSession) -> OrganizationStats:
    rows = await db_session.execute(
        select(Organization.status, func.count()).group_by(Organization.status)
    )
    # Статуси без жодної організації теж потрапляють у відповідь, з нулем
    by_status = dict.fromkeys(OrgStatusEnum, 0) | dict(rows.all())
    return OrganizationStats(total=sum(by_status.values()), by_status=by_status)


async def _project_stats(db_session: AsyncSession) -> ProjectStats:
    # Активні рахуються в тому ж запиті: total, by_status і active бачать один стан БД
    rows = await db_session.execute(
        select(Project.status, func.count(), func.count().filter(_is_active_project())).group_by(
            Project.status
        )
    )
    by_status = dict.fromkeys(ProjectStatusEnum, 0)
    active = 0
    for status, count, active_count in rows.all():
        by_status[status] = count
        active += active_count
    return ProjectStats(total=sum(by_status.values()), active=active, by_status=by_status)


async def get_admin_stats(db_session: AsyncSession) -> AdminStatsRead:
    """Показники для адмін-панелі: завжди свіжі, без кешу."""
    return AdminStatsRead(
        users_count=await db_session.scalar(_count(User)),
        organizations=await _organization_stats(db_session),
        projects=await _project_stats(db_session),
        total_hours=await db_session.scalar(select(_total_hours())),
    )
