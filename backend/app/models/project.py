import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    Text,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base
from app.models.experience import ExperienceLevelEnum


class ProjectStatusEnum(enum.StrEnum):
    draft = enum.auto()
    published = enum.auto()
    completed = enum.auto()
    cancelled = enum.auto()


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint("capacity > 0", name="capacity_positive"),
        CheckConstraint("volunteer_hours > 0", name="volunteer_hours_positive"),
        CheckConstraint("ends_at > starts_at", name="ends_after_start"),
        # Офлайн-подія без міста й адреси не потрапить у фільтр за містом і не знайдеться на місці
        CheckConstraint(
            "is_online OR (city_id IS NOT NULL AND address IS NOT NULL)",
            name="offline_has_location",
        ),
        # Фільтр каталогу за тегами (R-14): GIN індексує окремі елементи масиву
        Index("ix_projects_tags", "tags", postgresql_using="gin"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("organizations.id"), index=True
    )
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text)

    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Обов'язковий: від завершення події залежать підтвердження годин і відгуки
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    is_online: Mapped[bool] = mapped_column(default=False)
    # Може відрізнятися від міста організації
    city_id: Mapped[int | None] = mapped_column(ForeignKey("cities.id"))
    address: Mapped[str | None] = mapped_column(Text)

    capacity: Mapped[int] = mapped_column(Integer)
    # Години, що за замовчуванням нараховуються учаснику; можуть бути дробовими
    volunteer_hours: Mapped[Decimal] = mapped_column(Numeric(5, 2))

    is_adult_only: Mapped[bool] = mapped_column(default=False)
    # Мінімальний рівень волонтера для подання заявки
    experience_level: Mapped[ExperienceLevelEnum] = mapped_column(
        default=ExperienceLevelEnum.novice
    )
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    status: Mapped[ProjectStatusEnum] = mapped_column(default=ProjectStatusEnum.draft)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    organization = relationship("Organization", back_populates="projects")
    city = relationship("City")
