from datetime import date, datetime
from typing import Annotated, Literal, Self

from pydantic import BaseModel, BeforeValidator, ConfigDict, StringConstraints, model_validator

from app.models import OrgStatusEnum
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
