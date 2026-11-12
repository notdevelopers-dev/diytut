from datetime import datetime
from typing import Annotated, Any

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.models import (
    JoinRequestStatusEnum,
    OrganizationMember,
    OrgMemberRoleEnum,
    OrgStatusEnum,
)
from app.schemas.users import CityId, Phone, _empty_to_none

EDRPOU_LENGTH = 8


def _edrpou_check_digit(digits: str) -> int:
    """Контрольна цифра коду ЄДРПОУ за алгоритмом Мінстату."""
    number = int(digits)
    weights = [7, 1, 2, 3, 4, 5, 6] if 30000000 <= number <= 60000000 else [1, 2, 3, 4, 5, 6, 7]
    for shift in (0, 2):
        remainder = sum(int(d) * (w + shift) for d, w in zip(digits[:7], weights, strict=True)) % 11
        if remainder < 10:
            return remainder
    return 0


def _check_edrpou(value: str) -> str:
    if len(value) != EDRPOU_LENGTH or not value.isdigit():
        raise ValueError(f"EDRPOU code must consist of {EDRPOU_LENGTH} digits")
    if _edrpou_check_digit(value) != int(value[-1]):
        raise ValueError("EDRPOU code has an invalid check digit")
    return value


OrganizationName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=2, max_length=200)
]
# Перевірка формату без зовнішніх залежностей; адресу зберігаємо в нижньому регістрі
OrganizationEmail = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        to_lower=True,
        max_length=254,
        pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
    ),
]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
Edrpou = Annotated[str, StringConstraints(strip_whitespace=True), AfterValidator(_check_edrpou)]


class OrganizationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: OrganizationName
    email: OrganizationEmail
    phone: Phone
    city_id: CityId
    description: Annotated[Description | None, BeforeValidator(_empty_to_none)] = None
    edrpou: Annotated[Edrpou | None, BeforeValidator(_empty_to_none)] = None


# Поля, які в оновленні можна пропустити, але не можна передати як null
_NOT_NULL_ON_UPDATE = ("email", "phone", "city_id")


def _hide_null_in_schema(schema: dict[str, Any]) -> None:
    """Прибирає null зі схеми OpenAPI для полів, де null відхиляється.

    Тип X | None потрібен, щоб поле можна було пропустити; SkipJsonSchema[None] тут не
    підходить, бо змінює формат помилок валідації.
    """
    for field in _NOT_NULL_ON_UPDATE:
        variants = schema["properties"][field].pop("anyOf")
        schema["properties"][field].update(*(v for v in variants if v != {"type": "null"}))


class OrganizationUpdate(BaseModel):
    """Часткове оновлення: змінюються лише передані поля.

    Назву й код ЄДРПОУ перевіряє адміністратор, тож змінювати їх не можна.
    """

    model_config = ConfigDict(extra="forbid", json_schema_extra=_hide_null_in_schema)

    # None тут означає лише «поле не передали»: явний null відхиляє валідатор нижче
    email: OrganizationEmail | None = None
    phone: Phone | None = None
    city_id: CityId | None = None
    # null або порожній рядок прибирає опис
    description: Annotated[Description | None, BeforeValidator(_empty_to_none)] = None

    @field_validator(*_NOT_NULL_ON_UPDATE)
    @classmethod
    def _not_null(cls, value: object) -> object:
        # Не викликається для пропущених полів, лише для явно переданого null
        if value is None:
            raise ValueError("Field cannot be null")
        return value


class OrganizationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    phone: str
    city_id: int
    description: str | None
    edrpou: str | None
    status: OrgStatusEnum
    created_at: datetime


class OrganizationProfile(OrganizationRead):
    """Профіль організації для її учасника разом із його роллю в ній."""

    role: OrgMemberRoleEnum

    @classmethod
    def from_membership(cls, membership: OrganizationMember) -> OrganizationProfile:
        organization = OrganizationRead.model_validate(membership.organization)
        return cls(**organization.model_dump(), role=membership.role)


class OrganizationMembership(BaseModel):
    """Коротко про організацію користувача: чи показувати фронтенду режим організації."""

    id: int
    name: str
    status: OrgStatusEnum
    role: OrgMemberRoleEnum

    @classmethod
    def from_membership(cls, membership: OrganizationMember) -> OrganizationMembership:
        organization = membership.organization
        return cls(
            id=organization.id,
            name=organization.name,
            status=organization.status,
            role=membership.role,
        )


class OrganizationPublicView(OrganizationRead):
    """Публічний перегляд організації для сторінки організації."""

    city_name: str | None = None
    is_verified: bool = False
    projects_count: int = 0
    user_request_status: JoinRequestStatusEnum | None = None
    is_user_member: bool = False


class JoinRequestCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    message: str | None = None
    motivation: str | None = None

    @model_validator(mode="after")
    def unify_message(self) -> JoinRequestCreate:
        if not self.message and self.motivation:
            self.message = self.motivation
        return self


class JoinRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    organization_id: int
    user_id: int
    message: str | None = None
    status: JoinRequestStatusEnum
    created_at: datetime


class JoinRequestStatusResponse(BaseModel):
    status: JoinRequestStatusEnum | None = None
    id: int | None = None
    created_at: datetime | None = None
