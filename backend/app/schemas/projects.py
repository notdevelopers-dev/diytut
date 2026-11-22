import re
from collections.abc import Callable, Mapping
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, Any, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    ModelWrapValidatorHandler,
    StringConstraints,
    ValidationError,
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


# Найбільші значення, які вміщують стовпці projects (integer і numeric(5, 2)): більші БД
# відхилила б, і запит упав би з 500 замість 422
MAX_CAPACITY = MAX_INT32
MAX_VOLUNTEER_HOURS = Decimal("999.99")


def _as_utc(value: datetime | None) -> datetime | None:
    # Час без поясу вважаємо UTC (NF-08)
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _check_times(starts_at: datetime | None, ends_at: datetime | None) -> None:
    if starts_at is not None and ends_at is not None and ends_at <= starts_at:
        raise ValueError("ends_at must be after starts_at")


def _check_location(is_online: bool, city_id: int | None, address: str | None) -> None:
    # Офлайн-подія без міста й адреси — помилка, а не мовчазне перетворення на онлайн
    if not is_online and (city_id is None or address is None):
        raise ValueError("Offline project requires city_id and address")


class ProjectDraft(BaseModel):
    """Поля проєкту, з якими його можна зберегти як чернетку (R-12, рішення 18.11).

    Обов'язкова лише назва, решту можна дописати пізніше. Передані значення
    перевіряються одразу; повну перевірку робить check_publication під час публікації.
    Назви полів збігаються зі стовпцями projects.
    """

    model_config = ConfigDict(extra="forbid")

    title: ProjectTitle
    description: ProjectDescription | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    is_online: bool = False
    city_id: int | None = Field(default=None, gt=0, le=MAX_INT32)
    address: str | None = None
    capacity: int | None = Field(default=None, gt=0, le=MAX_CAPACITY)
    volunteer_hours: Decimal | None = Field(default=None, gt=0, le=MAX_VOLUNTEER_HOURS)
    is_adult_only: bool = False
    experience_level: ExperienceLevelEnum = ExperienceLevelEnum.novice
    # Сфера зі сталого набору: основний фільтр каталогу (R-14)
    categories: list[ProjectCategoryEnum] = Field(default_factory=list)
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
    def validate_times(self) -> ProjectDraft:
        self.starts_at = _as_utc(self.starts_at)
        self.ends_at = _as_utc(self.ends_at)
        _check_times(self.starts_at, self.ends_at)
        return self


class ProjectPublication(ProjectDraft):
    """Повний набір полів, без якого проєкт не публікується.

    Обов'язкові без значень за замовчуванням (R-12, R-22): від них залежать дата події,
    кількість місць і нарахування годин. Перевіряти через check_publication: вона
    повертає всі помилки одразу.
    """

    description: ProjectDescription
    starts_at: datetime
    ends_at: datetime
    capacity: int = Field(gt=0, le=MAX_CAPACITY)
    volunteer_hours: Decimal = Field(gt=0, le=MAX_VOLUNTEER_HOURS)
    categories: list[ProjectCategoryEnum] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_location(self) -> ProjectPublication:
        _check_location(self.is_online, self.city_id, self.address)
        return self


class _Arrangement(BaseModel):
    """Дата й місце події: поля, які перевіряються разом.

    Без обмежень на значення: сюди потрапляють лише поля, що вже пройшли перевірку.
    """

    starts_at: datetime | None = None
    ends_at: datetime | None = None
    is_online: bool = False
    city_id: int | None = None
    address: str | None = None


# Перевірки, що зачіпають кілька полів, і поля, від яких кожна залежить
_CROSS_FIELD_CHECKS: tuple[tuple[frozenset[str], Callable[[_Arrangement], None]], ...] = (
    (
        frozenset({"starts_at", "ends_at"}),
        lambda arrangement: _check_times(
            _as_utc(arrangement.starts_at), _as_utc(arrangement.ends_at)
        ),
    ),
    (
        frozenset({"is_online", "city_id", "address"}),
        lambda arrangement: _check_location(
            arrangement.is_online, arrangement.city_id, arrangement.address
        ),
    ),
)


def check_publication(data: Mapping[str, Any]) -> None:
    """Повна перевірка полів перед публікацією: ValidationError з усіма помилками одразу.

    Порожнє поле вважається відсутнім, тож про нього каже «Field required», а не помилка
    типу. Зв'язки між полями (порядок дат, місце офлайн-події) pydantic перевіряє лише тоді,
    коли всі поля окремо коректні, тому тут вони перевіряються поруч з іншими помилками:
    інакше організатор дізнавався б про них лише з наступної спроби.
    """
    provided = {field: value for field, value in data.items() if value is not None}
    try:
        ProjectPublication.model_validate(provided)
    except ValidationError as error:
        # Помилки валідаторів моделі відкидаємо: нижче ті самі перевірки виконуються всі
        errors: list[Any] = [detail for detail in error.errors() if detail["loc"]]
    else:
        return

    failed = {detail["loc"][0] for detail in errors}
    arrangement = _Arrangement.model_validate(
        {
            field: value
            for field, value in provided.items()
            if field in _Arrangement.model_fields and field not in failed
        }
    )
    for fields, check in _CROSS_FIELD_CHECKS:
        # Якщо одне з полів некоректне, про нього вже є помилка, а перевірка була б хибною
        if not fields & failed:
            try:
                check(arrangement)
            except ValueError as problem:
                errors.append(
                    {"type": "value_error", "loc": (), "input": data, "ctx": {"error": problem}}
                )
    raise ValidationError.from_exception_data(ProjectPublication.__name__, errors)


# Поля запиту на створення, що не є полями проєкту
_REQUEST_ONLY_FIELDS = frozenset({"organization_id", "status"})


class ProjectCreate(ProjectDraft):
    # Від імені якої з організацій користувача створюється проєкт; без поля —
    # організація за замовчуванням
    organization_id: int | None = Field(default=None, gt=0, le=MAX_BIGINT)
    # draft — зберегти чернетку, published — одразу опублікувати з повною перевіркою полів
    status: Literal[ProjectStatusEnum.draft, ProjectStatusEnum.published] = (
        ProjectStatusEnum.published
    )

    @model_validator(mode="wrap")
    @classmethod
    def validate_publication(
        cls, data: Any, handler: ModelWrapValidatorHandler[ProjectCreate]
    ) -> ProjectCreate:
        """Одразу опублікований проєкт перевіряється повністю, і всі помилки — одним списком.

        Помилки значень і помилки відсутніх полів інакше приходили б по черзі.
        """
        publishing = isinstance(data, dict) and (
            data.get("status", ProjectStatusEnum.published) == ProjectStatusEnum.published
        )
        if not publishing:
            return handler(data)

        errors: list[Any] = []
        try:
            check_publication(
                {field: value for field, value in data.items() if field not in _REQUEST_ONLY_FIELDS}
            )
        except ValidationError as error:
            errors = error.errors()
        try:
            project = handler(data)
        except ValidationError as error:
            # Решта помилок, зокрема перевірка дат, уже є серед помилок публікації
            reported = {tuple(detail["loc"]) for detail in errors}
            errors += [
                detail
                for detail in error.errors()
                if detail["loc"] and tuple(detail["loc"]) not in reported
            ]
        if errors:
            raise ValidationError.from_exception_data(cls.__name__, errors)
        return project

    def project_fields(self) -> dict[str, Any]:
        """Значення стовпців проєкту без службових полів запиту."""
        return self.model_dump(exclude=_REQUEST_ONLY_FIELDS)


class ProjectListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    organization_id: int
    title: str
    # У чернетці може бути порожнім, як і поля нижче зі значенням None
    description: str | None = None
    city_id: int | None = None
    status: ProjectStatusEnum
    created_at: datetime
    published_at: datetime | None = None
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


class ProjectPage(BaseModel):
    items: list[ProjectListItem]
    # Скільки всього проєктів під фільтром, для пагінації
    total: int


class CategoryRead(BaseModel):
    key: ProjectCategoryEnum
    name: str
