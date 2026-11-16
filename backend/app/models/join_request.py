import enum
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base


class JoinRequestStatusEnum(enum.StrEnum):
    pending = enum.auto()
    accepted = enum.auto()
    rejected = enum.auto()


class JoinRequestTargetEnum(enum.StrEnum):
    organization = enum.auto()
    project = enum.auto()


class JoinRequest(Base):
    """Заявка користувача на вступ до організації або участь у її проєкті."""

    __tablename__ = "join_requests"
    __table_args__ = (
        # project_id заповнений рівно тоді, коли заявка подана на проєкт
        CheckConstraint(
            "(target = 'project') = (project_id IS NOT NULL)",
            name="project_matches_target",
        ),
        # Лише одна заявка в очікуванні від користувача до організації; після розгляду
        # можна подати нову, тож обмеження часткове
        Index(
            "uq_join_requests_pending_user_organization",
            "user_id",
            "organization_id",
            unique=True,
            postgresql_where=text("status = 'pending' AND target = 'organization'"),
        ),
        # Так само для проєкту: заявки на різні проєкти однієї організації не конфліктують
        Index(
            "uq_join_requests_pending_user_project",
            "user_id",
            "project_id",
            unique=True,
            postgresql_where=text("status = 'pending' AND target = 'project'"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), index=True)
    target: Mapped[JoinRequestTargetEnum] = mapped_column(
        default=JoinRequestTargetEnum.organization
    )
    # Для заявки на проєкт — організація цього проєкту, щоб усі заявки організації
    # вибиралися одним запитом
    organization_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("organizations.id"), index=True
    )
    project_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("projects.id"), index=True
    )
    message: Mapped[str | None] = mapped_column(Text)
    status: Mapped[JoinRequestStatusEnum] = mapped_column(default=JoinRequestStatusEnum.pending)

    reviewed_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    user = relationship("User", foreign_keys=[user_id])
    reviewer = relationship("User", foreign_keys=[reviewed_by])
    organization = relationship("Organization")
    project = relationship("Project")
