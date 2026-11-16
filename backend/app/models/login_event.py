import enum
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.models.base import Base


class LoginMethodEnum(enum.StrEnum):
    google = enum.auto()
    # Вхід одразу після заповнення форми реєстрації
    registration = enum.auto()
    dev = enum.auto()


class LoginEvent(Base):
    """Один успішний вхід на сайт: з цих записів рахується статистика входів."""

    __tablename__ = "login_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    # Статистика лишається й після видалення акаунта
    user_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    method: Mapped[LoginMethodEnum]
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
