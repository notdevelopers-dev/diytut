from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models import NotificationTypeEnum


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: NotificationTypeEnum
    title: str
    message: str
    is_read: bool
    link: str | None
    created_at: datetime


class UnreadCount(BaseModel):
    count: int


class ReadAllResult(BaseModel):
    # Скільки сповіщень цей запит позначив прочитаними
    updated: int
