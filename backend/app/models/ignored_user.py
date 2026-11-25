from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, desc
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base


class OrganizationIgnoredUser(Base):
    """Волонтер, від якого організація більше не приймає заявок на свої проєкти.

    З'являється, коли організація відхиляє заявку з позначкою «ігнорувати»; організація
    може зняти ігнор.
    """

    __tablename__ = "organization_ignored_users"
    __table_args__ = (
        # Список ігнору організації, свіжіші першими
        Index(
            "ix_organization_ignored_users_org_created_user",
            "organization_id",
            desc("created_at"),
            desc("user_id"),
        ),
    )

    organization_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("organizations.id"), primary_key=True
    )
    # Ігнор без користувача нікому не потрібен. Перевірку під час подання заявки
    # обслуговує первинний ключ: запит знає і організацію, і користувача
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    # Ігнор лишається й після видалення акаунта того, хто його встановив
    ignored_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", foreign_keys=[user_id])
