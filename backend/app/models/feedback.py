import enum
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    SmallInteger,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base


class FeedbackTargetEnum(enum.StrEnum):
    """Про кого відгук; від цього залежить, хто його залишає (R-28)."""

    # Волонтер про проєкт, у якому брав участь
    project = enum.auto()
    # Організація про волонтера
    volunteer = enum.auto()


class Feedback(Base):
    """Відгук після підтвердженої участі: волонтера про проєкт або організації про волонтера."""

    __tablename__ = "feedbacks"
    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 5", name="rating_in_range"),
        # Кожна сторона залишає один відгук за одну участь. Ім'я задане явно: конвенція
        # бере лише перший стовпець і дала б оманливе uq_feedbacks_attendance_id
        UniqueConstraint("attendance_id", "target", name="uq_feedbacks_attendance_id_target"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    # Прив'язка до участі, а не до пари користувачів: відгук неможливий, доки організатор
    # не підтвердив участь, а проєкт і волонтер однозначно відомі з неї. Чи були години
    # ненульовими, БД не перевіряє: це правило сервісу
    attendance_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("attendances.id"))
    target: Mapped[FeedbackTargetEnum]
    # Для відгуку про волонтера — представник організації, який його написав.
    # Після видалення акаунта автора відгук лишається без нього
    author_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    rating: Mapped[int] = mapped_column(SmallInteger)
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    attendance = relationship("Attendance")
    author = relationship("User")
