from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.models.experience import ExperienceLevelEnum
from app.models.project import ProjectStatusEnum


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
