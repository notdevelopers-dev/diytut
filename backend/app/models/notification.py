import enum
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Text, false
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base


class NotificationTypeEnum(enum.StrEnum):
    """Події, про які сповіщаємо: рішення, зміни статусів і нарахування (критерій MVP №9).

    Це enum у БД: новий тип потребує міграції.
    """

    # Власнику організації: волонтер подав заявку на проєкт (R-23)
    join_request_received = enum.auto()
    # Власнику організації: волонтер скасував заявку до початку події (R-23)
    join_request_cancelled = enum.auto()
    # Волонтеру: організація розглянула його заявку (R-24)
    join_request_accepted = enum.auto()
    join_request_rejected = enum.auto()
    # Учасникам зі схваленою заявкою: проєкт скасовано
    project_cancelled = enum.auto()
    # Волонтеру: організатор підтвердив участь і нарахував години, зокрема 0 (R-25, R-26)
    hours_credited = enum.auto()
    # Волонтеру: сума підтверджених годин перейшла на новий рівень досвіду (R-27)
    level_up = enum.auto()
    # Волонтеру й власнику організації: після нарахування годин можна залишити відгук (R-28)
    review_available = enum.auto()
    # Творцю організації: адміністратор платформи розглянув її за ЄДРПОУ (R-10);
    # причина відхилення — у message
    organization_approved = enum.auto()
    organization_rejected = enum.auto()


class Notification(Base):
    """Сповіщення в застосунку для одного користувача."""

    __tablename__ = "notifications"
    __table_args__ = (
        # Лічильник непрочитаних і список сповіщень користувача; окремий індекс на user_id
        # не потрібен, бо його покриває перший стовпець цього. Ім'я задане явно: конвенція
        # бере лише перший стовпець і дала б оманливе ix_notifications_user_id
        Index("ix_notifications_user_id_is_read", "user_id", "is_read"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    # Сповіщення без адресата нікому не потрібні
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    type: Mapped[NotificationTypeEnum]
    title: Mapped[str] = mapped_column(Text)
    message: Mapped[str] = mapped_column(Text)
    is_read: Mapped[bool] = mapped_column(default=False, server_default=false())
    # Відносний шлях на фронтенді, куди веде клік по сповіщенню
    link: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
