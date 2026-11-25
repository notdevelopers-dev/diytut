import enum
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Text, desc, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base


class OrgStatusEnum(enum.StrEnum):
    pending = enum.auto()
    approved = enum.auto()
    rejected = enum.auto()
    blocked = enum.auto()


class OrgMemberRoleEnum(enum.StrEnum):
    owner = enum.auto()
    admin = enum.auto()
    member = enum.auto()


class Organization(Base):
    __tablename__ = "organizations"
    __table_args__ = (
        # Публічний каталог (approved, нові спершу) й адмінка за статусом (зворотне сканування)
        Index("ix_organizations_status_created_at_id", "status", desc("created_at"), desc("id")),
        # Публічний каталог із фільтром за містом
        Index(
            "ix_organizations_approved_city_created_at_id",
            "city_id",
            desc("created_at"),
            desc("id"),
            postgresql_where=text("status = 'approved'"),
        ),
        # Адмінка без фільтра статусу (найстаріші першими)
        Index("ix_organizations_created_at_id", "created_at", "id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    email: Mapped[str] = mapped_column(Text)
    phone: Mapped[str] = mapped_column(Text)
    city_id: Mapped[int] = mapped_column(ForeignKey("cities.id"))
    description: Mapped[str | None] = mapped_column(Text)
    # Необов'язковий; кілька NULL не порушують унікальність
    edrpou: Mapped[str | None] = mapped_column(Text, unique=True)
    status: Mapped[OrgStatusEnum] = mapped_column(default=OrgStatusEnum.pending)

    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_comment: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    city = relationship("City")
    creator = relationship("User", foreign_keys=[created_by])
    reviewer = relationship("User", foreign_keys=[reviewed_by])
    members = relationship("OrganizationMember", back_populates="organization")
    projects = relationship("Project", back_populates="organization")


class OrganizationMember(Base):
    __tablename__ = "organization_members"

    organization_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("organizations.id"), primary_key=True
    )
    # Користувач може належати до кількох організацій. Індекс — для пошуку членств
    # користувача: первинний ключ починається з organization_id і тут не допомагає
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id"), primary_key=True, index=True
    )

    role: Mapped[OrgMemberRoleEnum] = mapped_column(default=OrgMemberRoleEnum.member)

    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    organization = relationship("Organization", back_populates="members")
    user = relationship("User", back_populates="organizations")
