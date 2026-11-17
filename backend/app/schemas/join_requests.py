from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    StringConstraints,
    computed_field,
    model_validator,
)

from app.models import (
    JoinRequest,
    JoinRequestStatusEnum,
    JoinRequestTargetEnum,
    ProjectStatusEnum,
)
from app.models.experience import ExperienceLevelEnum, level_for_hours
from app.schemas.users import _empty_to_none

JoinRequestMessage = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]


class JoinRequestCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Необов'язковий супровідний лист; порожній рядок зберігаємо як NULL
    message: Annotated[JoinRequestMessage | None, BeforeValidator(_empty_to_none)] = None


class JoinRequestReview(BaseModel):
    """Рішення організації щодо заявки; повернути заявку на розгляд не можна."""

    model_config = ConfigDict(extra="forbid")

    status: Literal[JoinRequestStatusEnum.accepted, JoinRequestStatusEnum.rejected]
    # Разом із відхиленням заявки на проєкт: волонтер більше не зможе подавати заявки
    # на проєкти цієї організації, доки вона не зніме ігнор
    ignore: bool = False

    @model_validator(mode="after")
    def ignore_only_with_rejection(self) -> JoinRequestReview:
        if self.ignore and self.status != JoinRequestStatusEnum.rejected:
            raise ValueError("A volunteer can be ignored only together with a rejection")
        return self


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
    target: JoinRequestTargetEnum
    organization_id: int
    # Заповнений лише для заявки на проєкт
    project_id: int | None
    message: str | None
    status: JoinRequestStatusEnum
    reviewed_at: datetime | None
    created_at: datetime


class OrganizationJoinRequestRead(JoinRequestRead):
    """Заявка в кабінеті організації разом із даними волонтера."""

    user: JoinRequestApplicant


class JoinRequestReviewRead(JoinRequestRead):
    """Результат розгляду для організації: хто з її адміністраторів ухвалив рішення."""

    reviewed_by: int | None


class ProjectJoinRequestApplicant(JoinRequestApplicant):
    """Волонтер у заявці на проєкт: організація бачить його рівень і години (R-27)."""

    confirmed_hours: Decimal

    @computed_field
    @property
    def experience_level(self) -> ExperienceLevelEnum:
        return level_for_hours(self.confirmed_hours)


class ProjectJoinRequestRead(JoinRequestRead):
    """Заявка на проєкт у кабінеті організації разом із даними й рівнем волонтера."""

    user: ProjectJoinRequestApplicant

    @classmethod
    def from_request(
        cls, join_request: JoinRequest, confirmed_hours: Decimal
    ) -> ProjectJoinRequestRead:
        applicant = JoinRequestApplicant.model_validate(join_request.user)
        return cls(
            **JoinRequestRead.model_validate(join_request).model_dump(),
            user=ProjectJoinRequestApplicant(
                **applicant.model_dump(), confirmed_hours=confirmed_hours
            ),
        )


class JoinRequestProject(BaseModel):
    """Коротко про проєкт у списку власних заявок волонтера."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    organization_id: int
    title: str
    status: ProjectStatusEnum
    starts_at: datetime
    ends_at: datetime
    is_online: bool
    city_id: int | None


class MyProjectJoinRequestRead(JoinRequestRead):
    project: JoinRequestProject


class IgnoredUserRead(BaseModel):
    """Волонтер у списку ігнору організації."""

    model_config = ConfigDict(from_attributes=True)

    user: JoinRequestApplicant
    ignored_by: int | None
    created_at: datetime
