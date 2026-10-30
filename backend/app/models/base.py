import enum
from datetime import date, datetime

from sqlalchemy import MetaData, BigInteger, Integer, Text, Date, ForeignKey, DateTime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.sql import func


NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

# 1. Ініціалізація Base з MetaData
class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


# 2. Перелічення (Enums)
class GenderEnum(str, enum.Enum):
    male = "male"
    female = "female"
    prefer_not_to_say = "prefer_not_to_say"

class RoleEnum(str, enum.Enum):
    user = "user"
    admin = "admin"

class OrgStatusEnum(str, enum.Enum):
    pending = "pending"
    verified = "verified"
    rejected = "rejected"
    blocked = "blocked"


# 3. Моделі
class City(Base):
    __tablename__ = "cities"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    region: Mapped[str] = mapped_column(Text)


class User(Base):
    __tablename__ = "users"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    google_sub: Mapped[str | None] = mapped_column(Text, unique=True)
    email: Mapped[str] = mapped_column(Text, unique=True)
    first_name: Mapped[str | None] = mapped_column(Text)
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
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Відношення
    city = relationship("City")


class Organization(Base):
    __tablename__ = "organizations"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(Text)
    city_id: Mapped[int | None] = mapped_column(ForeignKey("cities.id"))
    description: Mapped[str | None] = mapped_column(Text)
    edrpou: Mapped[str] = mapped_column(Text, unique=True)
    status: Mapped[OrgStatusEnum] = mapped_column(default=OrgStatusEnum.pending)
    
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_comment: Mapped[str | None] = mapped_column(Text)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Відношення
    city = relationship("City")
    creator = relationship("User", foreign_keys=[created_by])
    reviewer = relationship("User", foreign_keys=[reviewed_by])