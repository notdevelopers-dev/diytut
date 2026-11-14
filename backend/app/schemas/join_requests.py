from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, ConfigDict, StringConstraints

from app.models import JoinRequestStatusEnum
from app.schemas.users import _empty_to_none

JoinRequestMessage = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]


class JoinRequestCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Необов'язковий супровідний лист; порожній рядок зберігаємо як NULL
    message: Annotated[JoinRequestMessage | None, BeforeValidator(_empty_to_none)] = None


class JoinRequestApplicant(BaseModel):
    """Хто подав заявку: мінімум даних, потрібний організації для рішення."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    first_name: str | None
    last_name: str
    nickname: str | None
    city_id: int | None


class JoinRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    organization_id: int
    message: str | None
    status: JoinRequestStatusEnum
    reviewed_at: datetime | None
    created_at: datetime


class OrganizationJoinRequestRead(JoinRequestRead):
    """Заявка в кабінеті організації разом із даними волонтера."""

    user: JoinRequestApplicant
