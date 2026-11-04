from datetime import datetime
from typing import Annotated

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    StringConstraints,
)

from app.models.base import OrganizationMember, OrgMemberRoleEnum, OrgStatusEnum
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
