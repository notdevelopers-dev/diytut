import enum
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, desc
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base


class LoginMethodEnum(enum.StrEnum):
    google = enum.auto()
    # Вхід одразу після заповнення форми реєстрації
    registration = enum.auto()
    dev = enum.auto()


class LoginEvent(Base):
    """Один успішний вхід на сайт: з цих записів рахується статистика входів.

    Невдалі спроби входу не записуються взагалі, тож поля «статус» тут немає.
    """

    __tablename__ = "login_events"
    __table_args__ = (
        # Список останніх входів (свіжіші першими без додаткового сортування за id)
        Index("ix_login_events_created_at_id", desc("created_at"), desc("id")),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    # Статистика лишається й після видалення акаунта
    user_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    method: Mapped[LoginMethodEnum]
    # IP клієнта, як його бачить API за nginx (CF-Connecting-IP); у старих записах порожній
    ip: Mapped[str | None] = mapped_column(INET)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    user = relationship("User")
