import time
from decimal import Decimal
from typing import Any

from sqlalchemy import Numeric, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Attendance, Organization, OrgStatusEnum, Project, ProjectStatusEnum, User

# Скільки секунд публічний лічильник віддається з пам'яті, без запитів до БД
PUBLIC_STATS_TTL_SECONDS = 60

# Час підрахунку за time.monotonic() і самі лічильники. Кеш живе в пам'яті процесу:
# у проді API працює одним процесом uvicorn, тож кеш спільний для всіх запитів
_public_cache: tuple[float, dict[str, Any]] | None = None


def _is_active_project():
    """Проєкт у каталозі: опублікований і ще не завершився, як у list_active_projects."""
    return (Project.status == ProjectStatusEnum.published) & (Project.ends_at > func.now())


def _count(entity, *conditions):
    return select(func.count()).select_from(entity).where(*conditions)


def _total_hours():
    # Усі підтверджені години, зокрема знеособлені після видалення акаунта. Завжди два знаки
    # після коми: без жодного підтвердження відповідь "0.00", а не "0"
    return cast(func.coalesce(func.sum(Attendance.hours), 0), Numeric(12, 2))


async def _fetch_public_stats(db_session: AsyncSession) -> dict[str, Any]:
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
    return dict(row._mapping)


async def get_public_stats(db_session: AsyncSession) -> dict[str, Any]:
    """Лічильники для головної сторінки; можуть відставати від БД до PUBLIC_STATS_TTL_SECONDS.

    Головна — найвідвідуваніша сторінка, а точність до секунди лічильникам не потрібна.
    Одночасні запити після закінчення строку можуть порахувати кілька разів: це дешевше
    за блокування.
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


async def _counts_by_status(db_session: AsyncSession, column, statuses) -> dict[Any, int]:
    """Кількість за кожним статусом, зокрема нульова для статусів без записів."""
    rows = await db_session.execute(select(column, func.count()).group_by(column))
    counts = dict(rows.all())
    return {status: counts.get(status, 0) for status in statuses}


async def get_admin_stats(db_session: AsyncSession) -> dict[str, Any]:
    """Показники для адмін-панелі: завжди свіжі, без кешу."""
    users_count = await db_session.scalar(_count(User))
    organizations = await _counts_by_status(db_session, Organization.status, OrgStatusEnum)
    projects = await _counts_by_status(db_session, Project.status, ProjectStatusEnum)
    active_projects = await db_session.scalar(_count(Project, _is_active_project()))
    total_hours: Decimal = await db_session.scalar(select(_total_hours()))
    return {
        "users_count": users_count,
        "organizations": {"total": sum(organizations.values()), "by_status": organizations},
        "projects": {
            "total": sum(projects.values()),
            "active": active_projects,
            "by_status": projects,
        },
        "total_hours": total_hours,
    }
