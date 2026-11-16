from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app import errors
from app.models import Notification


async def list_notifications(
    db_session: AsyncSession, user_id: int, *, limit: int, offset: int
) -> list[Notification]:
    """Сповіщення користувача, нові спершу."""
    query = (
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(await db_session.scalars(query))


async def count_unread(db_session: AsyncSession, user_id: int) -> int:
    # Покривається індексом ix_notifications_user_id_is_read
    return await db_session.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id, Notification.is_read.is_(False))
    )


async def mark_read(db_session: AsyncSession, user_id: int, notification_id: int) -> Notification:
    # Чуже сповіщення для користувача не існує: так не видно, які id зайняті
    notification = await db_session.scalar(
        select(Notification).where(
            Notification.id == notification_id, Notification.user_id == user_id
        )
    )
    if notification is None:
        raise errors.notification_not_found()
    # Повторна позначка нічого не змінює і не є помилкою
    if not notification.is_read:
        notification.is_read = True
        await db_session.commit()
    return notification


async def mark_all_read(db_session: AsyncSession, user_id: int) -> int:
    result = await db_session.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    await db_session.commit()
    return result.rowcount
