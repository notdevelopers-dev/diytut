import enum
from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base


class GenderEnum(enum.StrEnum):
    male = enum.auto()
    female = enum.auto()
    prefer_not_to_say = enum.auto()


class RoleEnum(enum.StrEnum):
    user = enum.auto()
    admin = enum.auto()


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    google_sub: Mapped[str | None] = mapped_column(Text, unique=True)
    email: Mapped[str] = mapped_column(Text, unique=True)
    first_name: Mapped[str | None] = mapped_column(Text)  # Може бути NULL до завершення онбордингу
    last_name: Mapped[str] = mapped_column(Text)
    patronymic: Mapped[str | None] = mapped_column(Text)
    nickname: Mapped[str | None] = mapped_column(Text, unique=True)
    phone: Mapped[str] = mapped_column(Text)
    birth_date: Mapped[date] = mapped_column(Date)
    gender: Mapped[GenderEnum] = mapped_column(default=GenderEnum.prefer_not_to_say)
    city_id: Mapped[int | None] = mapped_column(ForeignKey("cities.id"))
    bio: Mapped[str | None] = mapped_column(Text)
    platform_role: Mapped[RoleEnum] = mapped_column(default=RoleEnum.user)

    profile_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    city = relationship("City")
    organizations = relationship("OrganizationMember", back_populates="user")
