import re
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.models.experience import ExperienceLevelEnum
from app.models.project import MAX_PROJECT_CATEGORIES, ProjectCategoryEnum, ProjectStatusEnum
from app.schemas.users import MAX_BIGINT, MAX_INT32

ProjectTitle = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=2, max_length=200)
]
ProjectDescription = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=10000)
]


# Назви сфер для інтерфейсу; порядок — як у списку чипсів каталогу
CATEGORY_NAMES: dict[ProjectCategoryEnum, str] = {
    ProjectCategoryEnum.ecology: "Екологія",
    ProjectCategoryEnum.education: "Освіта",
    ProjectCategoryEnum.children: "Діти та молодь",
    ProjectCategoryEnum.idp: "Допомога ВПО",
    ProjectCategoryEnum.military: "Підтримка військових",
    ProjectCategoryEnum.veterans: "Ветерани",
    ProjectCategoryEnum.medicine: "Медицина та здоровʼя",
    ProjectCategoryEnum.mental_health: "Психологічна підтримка",
    ProjectCategoryEnum.disability: "Інклюзія та люди з інвалідністю",
    ProjectCategoryEnum.animals: "Тварини",
    ProjectCategoryEnum.elderly: "Літні люди",
    ProjectCategoryEnum.social: "Соціальна допомога",
    ProjectCategoryEnum.humanitarian: "Гуманітарна допомога",
    ProjectCategoryEnum.fundraising: "Благодійні збори та донорство",
    ProjectCategoryEnum.legal: "Юридична допомога",
    ProjectCategoryEnum.culture: "Культура",
    ProjectCategoryEnum.sports: "Спорт",
    ProjectCategoryEnum.tech: "IT та цифрова грамотність",
    ProjectCategoryEnum.media: "Медіа та переклад",
    ProjectCategoryEnum.rebuild: "Відбудова та благоустрій",
    ProjectCategoryEnum.other: "Інше",
}

MAX_TAGS = 5
MAX_TAG_LENGTH = 30
# Слова з літер будь-якої абетки й цифр, розділені одним «_», «-» або апострофом (усі його
# варіанти зводимо до «ʼ»). «ʼ» (U+02BC) Unicode вважає літерою, тож виключаємо його явно
_TAG_PATTERN = re.compile(r"[^\W_ʼ]+(?:[_\-ʼ][^\W_ʼ]+)*")
_APOSTROPHES = str.maketrans({"'": "ʼ", "’": "ʼ", "`": "ʼ"})


def normalize_tag(raw: str) -> str:
    """Зводить хештег до канонічного вигляду: «#Толока » → «толока».

    Регістр, «#» на початку, пробіли (замінюються на «_») і варіанти апострофа не
    повинні робити з одного хештегу кілька різних.
    """
    tag = raw.strip().lstrip("#").strip().lower().translate(_APOSTROPHES)
    return re.sub(r"\s+", "_", tag)


def _validate_tag(raw: str) -> str:
    tag = normalize_tag(raw)
    if not tag:
        raise ValueError("Tag must not be empty")
    if len(tag) > MAX_TAG_LENGTH:
        raise ValueError(f"Tag must be at most {MAX_TAG_LENGTH} characters")
    if not _TAG_PATTERN.fullmatch(tag):
        raise ValueError("Tag may contain only letters, digits, '_', '-' and apostrophes")
    return tag


ProjectTag = Annotated[str, AfterValidator(_validate_tag)]


class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Від імені якої з організацій користувача створюється проєкт; без поля —
    # організація за замовчуванням
    organization_id: int | None = Field(default=None, gt=0, le=MAX_BIGINT)
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
    # Сфера зі сталого набору: основний фільтр каталогу (R-14)
    categories: list[ProjectCategoryEnum] = Field(min_length=1)
    # Вільні хештеги організації; дублікати після нормалізації відкидаються
    tags: list[ProjectTag] = Field(default_factory=list)

    @field_validator("categories")
    @classmethod
    def validate_categories(cls, value: list[ProjectCategoryEnum]) -> list[ProjectCategoryEnum]:
        unique = list(dict.fromkeys(value))
        if len(unique) > MAX_PROJECT_CATEGORIES:
            raise ValueError(f"At most {MAX_PROJECT_CATEGORIES} categories are allowed")
        return unique

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, value: list[str]) -> list[str]:
        unique = list(dict.fromkeys(value))
        if len(unique) > MAX_TAGS:
            raise ValueError(f"At most {MAX_TAGS} tags are allowed")
        return unique

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
    categories: list[ProjectCategoryEnum] = []
    tags: list[str] = []


class ProjectRead(ProjectListItem):
    updated_at: datetime


class CategoryRead(BaseModel):
    key: ProjectCategoryEnum
    name: str
