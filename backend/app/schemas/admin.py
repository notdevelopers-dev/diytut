from datetime import date, datetime
from ipaddress import IPv4Address, IPv6Address
from typing import Annotated, Literal, Self

from pydantic import BaseModel, BeforeValidator, ConfigDict, StringConstraints, model_validator

from app.models import LoginMethodEnum, OrgStatusEnum, RoleEnum
from app.schemas.organizations import OrganizationRead
from app.schemas.users import CityRead, _empty_to_none

ReviewComment = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


class UserBrief(BaseModel):
    """Хто подав заявку: щоб адміністратор міг зв'язатися з ним."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    first_name: str | None
    last_name: str
    nickname: str | None
    phone: str


class OrganizationRequest(OrganizationRead):
    """Заявка на створення організації в тому вигляді, у якому її бачить адміністратор."""

    city: CityRead
    creator: UserBrief
    reviewed_by: int | None
    reviewed_at: datetime | None
    review_comment: str | None
    updated_at: datetime


class OrganizationRequestPage(BaseModel):
    items: list[OrganizationRequest]
    # Скільки всього заявок під фільтром, для пагінації
    total: int


class OrganizationReview(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: Literal[OrgStatusEnum.approved, OrgStatusEnum.rejected]
    # Обов'язковий при відхиленні: організація має знати, що виправити
    comment: Annotated[ReviewComment | None, BeforeValidator(_empty_to_none)] = None

    @model_validator(mode="after")
    def _comment_required_on_reject(self) -> Self:
        if self.decision == OrgStatusEnum.rejected and self.comment is None:
            raise ValueError("Comment is required when rejecting a request")
        return self


class PhotoRemoval(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Обов'язкова: організація має знати, чому фото прибрали й що не так
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class DailyLogins(BaseModel):
    date: date
    logins: int
    unique_users: int


class LoginStats(BaseModel):
    date_from: date
    date_to: date
    timezone: str
    total_logins: int
    unique_users: int
    # Кожен день періоду, зокрема дні без входів
    days: list[DailyLogins]


class LoginUser(BaseModel):
    """Хто увійшов: щоб адміністратор бачив, чий це вхід і яка в нього роль на платформі."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    first_name: str | None
    last_name: str
    platform_role: RoleEnum


class LoginEventRead(BaseModel):
    """Один успішний вхід. Невдалі спроби не записуються, тож статусу немає."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    method: LoginMethodEnum
    # Порожній у записах до появи цього поля
    ip: IPv4Address | IPv6Address | None
    # None, якщо акаунт уже видалено
    user: LoginUser | None


class LoginEventPage(BaseModel):
    items: list[LoginEventRead]
    total: int
