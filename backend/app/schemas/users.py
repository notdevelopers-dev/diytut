import re
from datetime import date
from typing import Annotated, Any

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
)

from app.models.base import GenderEnum, RoleEnum

MIN_AGE = 18
MAX_AGE = 120
# Найбільше значення integer у PostgreSQL; більший id БД відхилила б з помилкою 500
MAX_INT32 = 2**31 - 1
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
CityId = Annotated[int, Field(gt=0, le=MAX_INT32)]


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
    city_id: CityId
    bio: Annotated[Bio | None, BeforeValidator(_empty_to_none)] = None


# Поля, які в оновленні можна пропустити, але не можна передати як null
_NOT_NULL_ON_USER_UPDATE = (
    "first_name",
    "last_name",
    "nickname",
    "phone",
    "birth_date",
    "gender",
    "city_id",
)


def _hide_null_in_schema(schema: dict[str, Any]) -> None:
    """Прибирає null зі схеми OpenAPI для полів, де null відхиляється.

    Тип X | None потрібен, щоб поле можна було пропустити; SkipJsonSchema[None] тут не
    підходить, бо змінює формат помилок валідації.
    """
    for field in _NOT_NULL_ON_USER_UPDATE:
        variants = schema["properties"][field].pop("anyOf")
        schema["properties"][field].update(*(v for v in variants if v != {"type": "null"}))


class UserUpdate(BaseModel):
    """Часткове оновлення: змінюються лише передані поля."""

    model_config = ConfigDict(extra="forbid", json_schema_extra=_hide_null_in_schema)

    # None тут означає лише «поле не передали»: явний null відхиляє валідатор нижче
    first_name: PersonName | None = None
    last_name: PersonName | None = None
    patronymic: Annotated[PersonName | None, BeforeValidator(_empty_to_none)] = None
    nickname: Annotated[Nickname | None, BeforeValidator(_empty_to_none)] = None
    phone: Phone | None = None
    birth_date: BirthDate | None = None
    gender: GenderEnum | None = None
    city_id: CityId | None = None
    bio: Annotated[Bio | None, BeforeValidator(_empty_to_none)] = None

    @field_validator(*_NOT_NULL_ON_USER_UPDATE)
    @classmethod
    def _not_null(cls, value: object) -> object:
        # Не викликається для пропущених полів, лише для явно переданого null
        if value is None:
            raise ValueError("Field cannot be null")
        return value


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


class UserProfileRead(UserRead):
    """Профіль користувача разом з інформацією про місто."""

    city: CityRead | None = None
