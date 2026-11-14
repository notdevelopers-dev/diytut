from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.models.experience import ExperienceLevelEnum
from app.models.project import ProjectStatusEnum
from app.schemas.users import MAX_INT32

ProjectTitle = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=2, max_length=200)
]
ProjectDescription = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=10000)
]


class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Від імені якої з організацій користувача створюється проєкт; без поля —
    # організація за замовчуванням
    organization_id: int | None = Field(default=None, gt=0, le=MAX_INT32)
    title: ProjectTitle
    description: ProjectDescription
    # Обов'язкові без значень за замовчуванням (R-12, R-22): від них залежать
    # дата події, кількість місць і нарахування годин
    starts_at: datetime
    ends_at: datetime
    is_online: bool = False
    city_id: int | None = Field(default=None, gt=0, le=MAX_INT32)
    address: str | None = None
    capacity: int = Field(gt=0)
    volunteer_hours: Decimal = Field(gt=0)
    is_adult_only: bool = False
    experience_level: ExperienceLevelEnum = ExperienceLevelEnum.novice
    tags: list[str] = Field(default_factory=list)
    status: ProjectStatusEnum = ProjectStatusEnum.published

    @model_validator(mode="after")
    def validate_times_and_location(self) -> ProjectCreate:
        # Час без поясу вважаємо UTC (NF-08)
        if self.starts_at.tzinfo is None:
            self.starts_at = self.starts_at.replace(tzinfo=UTC)
        if self.ends_at.tzinfo is None:
            self.ends_at = self.ends_at.replace(tzinfo=UTC)

        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")

        # Офлайн-подія без міста й адреси — помилка, а не мовчазне перетворення на онлайн
        if not self.is_online and (self.city_id is None or self.address is None):
            raise ValueError("Offline project requires city_id and address")

        return self


class ProjectListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    organization_id: int
    title: str
    description: str
    city_id: int | None = None
    status: ProjectStatusEnum
    created_at: datetime
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    is_online: bool = False
    address: str | None = None
    capacity: int | None = None
    volunteer_hours: Decimal | None = None
    is_adult_only: bool = False
    experience_level: ExperienceLevelEnum = ExperienceLevelEnum.novice
    tags: list[str] = []


class ProjectRead(ProjectListItem):
    updated_at: datetime
