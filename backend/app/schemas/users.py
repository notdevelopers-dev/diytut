import re
from datetime import date
from typing import Annotated

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
)

from app.models.base import GenderEnum, RoleEnum

MIN_AGE = 18
MAX_AGE = 120
PHONE_DIGITS = re.compile(r"^(?:\+?38)?0(\d{9})$")


def _empty_to_none(value: object) -> object:
    if isinstance(value, str) and not value.strip():
        return None
    return value


def _normalize_phone(value: object) -> object:
    """Приводить +380 XX XXX XX XX, 380XXXXXXXXX чи 0XXXXXXXXX до вигляду +380XXXXXXXXX."""
    if not isinstance(value, str):
        return value
    compact = re.sub(r"[\s()-]", "", value)
    match = PHONE_DIGITS.match(compact)
    if match is None:
        raise ValueError("Phone must be a Ukrainian number in the +380XXXXXXXXX format")
    return f"+380{match.group(1)}"


def _years_between(born: date, today: date) -> int:
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def _check_age(value: date) -> date:
    age = _years_between(value, date.today())
    if age < MIN_AGE:
        raise ValueError(f"User must be at least {MIN_AGE} years old")
    if age > MAX_AGE:
        raise ValueError("Birth date is not realistic")
    return value


# Літери будь-якої абетки; апостроф, дефіс і пробіл лише між літерами
PersonName = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=100, pattern=r"^\p{L}+(?:[ '’ʼ-]\p{L}+)*$"
    ),
]
# Нікнейм зберігається в нижньому регістрі, тож Taras і taras — один нікнейм
Nickname = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        to_lower=True,
        min_length=3,
        max_length=30,
        pattern=r"^[A-Za-z0-9_.]+$",
    ),
]
Phone = Annotated[str, BeforeValidator(_normalize_phone)]
BirthDate = Annotated[date, AfterValidator(_check_age)]
Bio = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


class RegistrationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    first_name: PersonName
    last_name: PersonName
    patronymic: Annotated[PersonName | None, BeforeValidator(_empty_to_none)] = None
    # Якщо не вказано, генерується автоматично
    nickname: Annotated[Nickname | None, BeforeValidator(_empty_to_none)] = None
    phone: Phone
    birth_date: BirthDate
    gender: GenderEnum = GenderEnum.prefer_not_to_say
    city_id: int = Field(gt=0)
    bio: Annotated[Bio | None, BeforeValidator(_empty_to_none)] = None


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    first_name: str
    last_name: str
    patronymic: str | None
    nickname: str
    phone: str
    birth_date: date
    gender: GenderEnum
    city_id: int
    bio: str | None
    platform_role: RoleEnum


class CityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    region: str
