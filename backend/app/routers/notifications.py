from typing import Annotated

from fastapi import APIRouter, Path, Query

from app.auth import CurrentUserId
from app.db import DbSessionDep
from app.schemas.notifications import NotificationRead, ReadAllResult, UnreadCount
from app.schemas.users import MAX_BIGINT, MAX_INT32
from app.services import notifications as service

# Більше за раз центру сповіщень у шапці не потрібно
MAX_NOTIFICATIONS = 50

router = APIRouter()


@router.get("")
async def list_notifications(
    db_session: DbSessionDep,
    user_id: CurrentUserId,
    limit: Annotated[int, Query(ge=1, le=MAX_NOTIFICATIONS)] = MAX_NOTIFICATIONS,
    offset: Annotated[int, Query(ge=0, le=MAX_INT32)] = 0,
) -> list[NotificationRead]:
    notifications = await service.list_notifications(
        db_session, user_id, limit=limit, offset=offset
    )
    return [NotificationRead.model_validate(n) for n in notifications]


@router.get("/unread-count")
async def read_unread_count(db_session: DbSessionDep, user_id: CurrentUserId) -> UnreadCount:
    return UnreadCount(count=await service.count_unread(db_session, user_id))


@router.post("/read-all")
async def mark_all_notifications_read(
    db_session: DbSessionDep, user_id: CurrentUserId
) -> ReadAllResult:
    return ReadAllResult(updated=await service.mark_all_read(db_session, user_id))


@router.patch("/{notification_id}/read")
async def mark_notification_read(
    notification_id: Annotated[int, Path(gt=0, le=MAX_BIGINT)],
    db_session: DbSessionDep,
    user_id: CurrentUserId,
) -> NotificationRead:
    notification = await service.mark_read(db_session, user_id, notification_id)
    return NotificationRead.model_validate(notification)
