from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base


class Attendance(Base):
    """Підтверджена організатором участь волонтера в проєкті з нарахованими годинами (R-25).

    Запис з'являється лише під час підтвердження після події: до того участь описує
    схвалена заявка. З цих записів складаються історія участі й баланс годин (R-26).
    """

    __tablename__ = "attendances"
    __table_args__ = (
        # 0 — волонтер не прийшов; запис усе одно потрібен, щоб рішення не ухвалили вдруге
        CheckConstraint("hours >= 0", name="hours_not_negative"),
        # Захист від подвійного нарахування годин за одну подію (NF-09). Проєкт перший:
        # індекс заодно обслуговує список учасників проєкту. Знеособлені записи з NULL
        # у user_id одне одному не заважають. Ім'я задане явно: конвенція бере лише
        # перший стовпець і дала б оманливе uq_attendances_project_id
        UniqueConstraint("project_id", "user_id", name="uq_attendances_project_id_user_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id"))
    # Після видалення акаунта запис знеособлюється: години проєкту й платформи лишаються.
    # Індекс — для історії участі в профілі волонтера
    user_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    # Можуть відрізнятися від планових годин проєкту: організатор коригує їх при підтвердженні
    hours: Mapped[Decimal] = mapped_column(Numeric(5, 2))

    # Нараховані години не зникають разом з акаунтом того, хто їх підтвердив
    confirmed_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    confirmed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # Години можна виправити після підтвердження: без цього зміна не лишала б сліду
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    project = relationship("Project")
    user = relationship("User", foreign_keys=[user_id])
    confirmer = relationship("User", foreign_keys=[confirmed_by])
