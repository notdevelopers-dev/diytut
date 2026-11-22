from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.models import OrgStatusEnum, ProjectStatusEnum


class PlatformStatsRead(BaseModel):
    """Публічні лічильники для головної сторінки."""

    model_config = ConfigDict(extra="forbid")

    # Усі зареєстровані користувачі
    volunteers_count: int
    # Лише схвалені організації
    organizations_count: int
    # Опубліковані проєкти, зокрема ті, чия подія вже минула
    projects_count: int
    # Опубліковані проєкти, що ще не завершилися: ті самі, що в каталозі
    active_projects_count: int
    # Сума всіх підтверджених годин; у JSON — рядок, як інші години
    total_hours: Decimal


class OrganizationStats(BaseModel):
    total: int
    # Кожен статус, зокрема з нулем
    by_status: dict[OrgStatusEnum, int]


class ProjectStats(BaseModel):
    total: int
    # Опубліковані проєкти, що ще не завершилися: ті самі, що в каталозі
    active: int
    # Кожен статус, зокрема з нулем
    by_status: dict[ProjectStatusEnum, int]


class AdminStatsRead(BaseModel):
    """Загальні показники платформи для адмін-панелі."""

    users_count: int
    organizations: OrganizationStats
    projects: ProjectStats
    total_hours: Decimal
