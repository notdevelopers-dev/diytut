from datetime import UTC, datetime, timedelta
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

    title: ProjectTitle
    description: ProjectDescription
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    is_online: bool = False
    city_id: int | None = Field(default=None, gt=0, le=MAX_INT32)
    address: str | None = None
    capacity: int = Field(default=10, gt=0)
    volunteer_hours: Decimal = Field(default=Decimal("1.0"), gt=0)
    is_adult_only: bool = False
    experience_level: ExperienceLevelEnum = ExperienceLevelEnum.novice
    tags: list[str] = Field(default_factory=list)
    status: ProjectStatusEnum = ProjectStatusEnum.published

    @model_validator(mode="after")
    def validate_times_and_location(self) -> ProjectCreate:
        if self.starts_at is None:
            self.starts_at = datetime.now(UTC) + timedelta(days=1)
        elif self.starts_at.tzinfo is None:
            self.starts_at = self.starts_at.replace(tzinfo=UTC)

        if self.ends_at is None:
            self.ends_at = self.starts_at + timedelta(hours=2)
        elif self.ends_at.tzinfo is None:
            self.ends_at = self.ends_at.replace(tzinfo=UTC)

        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")

        if not self.is_online and (self.city_id is None or self.address is None):
            self.is_online = True

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
