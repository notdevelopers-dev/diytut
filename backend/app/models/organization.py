import enum
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Text
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
    # TODO: дозволити користувачу кілька організацій
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id"), primary_key=True, unique=True
    )

    role: Mapped[OrgMemberRoleEnum] = mapped_column(default=OrgMemberRoleEnum.member)

    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    organization = relationship("Organization", back_populates="members")
    user = relationship("User", back_populates="organizations")
