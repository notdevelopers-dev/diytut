from datetime import date, timedelta

from sqlalchemy import Date, DateTime, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import errors
from app.models import LoginEvent, LoginMethodEnum

# Дні для статистики рахуються за київським часом, а не за UTC
STATS_TIMEZONE = "Europe/Kyiv"
DEFAULT_STATS_DAYS = 30
MAX_STATS_DAYS = 366


async def record_login(db_session: AsyncSession, user_id: int, method: LoginMethodEnum) -> None:
    db_session.add(LoginEvent(user_id=user_id, method=method))
    await db_session.commit()


def _local_midnight(day: date):
    """Початок дня day за київським часом як timestamptz: так працює індекс по created_at."""
    # timezone() з timestamp без часового поясу трактує його як місцевий час у STATS_TIMEZONE
    return func.timezone(STATS_TIMEZONE, cast(day, DateTime()))


async def _today(db_session: AsyncSession) -> date:
    return await db_session.scalar(select(cast(func.timezone(STATS_TIMEZONE, func.now()), Date)))


async def resolve_period(
    db_session: AsyncSession, date_from: date | None, date_to: date | None
) -> tuple[date, date]:
    if date_to is None:
        date_to = await _today(db_session)
    if date_from is None:
        date_from = date_to - timedelta(days=DEFAULT_STATS_DAYS - 1)
    if date_from > date_to:
        raise errors.invalid_period("date_from must not be later than date_to")
    if (date_to - date_from).days + 1 > MAX_STATS_DAYS:
        raise errors.invalid_period(f"Period must not exceed {MAX_STATS_DAYS} days")
    return date_from, date_to


async def get_login_stats(
    db_session: AsyncSession, date_from: date, date_to: date
) -> tuple[int, int, dict[date, tuple[int, int]]]:
    """Входи за період [date_from, date_to]: усього, унікальних користувачів і по днях."""
    in_period = (
        LoginEvent.created_at >= _local_midnight(date_from),
        LoginEvent.created_at < _local_midnight(date_to + timedelta(days=1)),
    )
    total, unique_users = (
        await db_session.execute(
            select(func.count(), func.count(LoginEvent.user_id.distinct())).where(*in_period)
        )
    ).one()

    day = cast(func.timezone(STATS_TIMEZONE, LoginEvent.created_at), Date).label("day")
    rows = await db_session.execute(
        select(day, func.count(), func.count(LoginEvent.user_id.distinct()))
        .where(*in_period)
        .group_by(day)
    )
    by_day = {row_day: (logins, users) for row_day, logins, users in rows.all()}
    return total, unique_users, by_day
