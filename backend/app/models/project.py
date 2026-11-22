import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    Text,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base
from app.models.experience import ExperienceLevelEnum


class ProjectStatusEnum(enum.StrEnum):
    draft = enum.auto()
    published = enum.auto()
    completed = enum.auto()
    cancelled = enum.auto()


class ProjectCategoryEnum(enum.StrEnum):
    """Сфера проєкту: сталий набір для фільтра каталогу (R-14).

    Зберігається як text[] з CHECK-обмеженням: новий елемент потребує міграції,
    що оновлює ck_projects_categories_known. Назви українською — у app/schemas/projects.py.
    """

    ecology = enum.auto()
    education = enum.auto()
    children = enum.auto()
    idp = enum.auto()
    military = enum.auto()
    # Адаптація й підтримка ветеранів, окремо від допомоги війську (military)
    veterans = enum.auto()
    medicine = enum.auto()
    mental_health = enum.auto()
    disability = enum.auto()
    animals = enum.auto()
    elderly = enum.auto()
    # Малозабезпечені сімʼї, безхатьки, сироти
    social = enum.auto()
    humanitarian = enum.auto()
    # Збори коштів, речей і донорство крові поза платформою: збір коштів на самій
    # платформі поза scope MVP
    fundraising = enum.auto()
    legal = enum.auto()
    culture = enum.auto()
    sports = enum.auto()
    tech = enum.auto()
    media = enum.auto()
    rebuild = enum.auto()
    other = enum.auto()


MAX_PROJECT_CATEGORIES = 2

_KNOWN_CATEGORIES_SQL = ", ".join(f"'{category}'" for category in ProjectCategoryEnum)


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint("capacity > 0", name="capacity_positive"),
        CheckConstraint("volunteer_hours > 0", name="volunteer_hours_positive"),
        CheckConstraint("ends_at > starts_at", name="ends_after_start"),
        # Чернетку можна зберегти з однією назвою (рішення 18.11), а решту дописати пізніше.
        # Опублікований, завершений чи скасований проєкт має всі поля, від яких залежать
        # дата події, кількість місць, нарахування годин і порядок у каталозі
        CheckConstraint(
            "status = 'draft' OR (description IS NOT NULL AND starts_at IS NOT NULL"
            " AND ends_at IS NOT NULL AND capacity IS NOT NULL AND volunteer_hours IS NOT NULL"
            " AND published_at IS NOT NULL)",
            name="complete_unless_draft",
        ),
        # Офлайн-подія без міста й адреси не потрапить у фільтр за містом і не знайдеться на місці;
        # у чернетці місце можна вказати пізніше
        CheckConstraint(
            "status = 'draft' OR is_online OR (city_id IS NOT NULL AND address IS NOT NULL)",
            name="offline_has_location",
        ),
        # Від 1 до 2 сфер: інакше проєкт не знайдеться у фільтрі або «засмічуватиме» всі сфери.
        # Чернетка може бути й без сфери
        CheckConstraint(
            f"cardinality(categories) <= {MAX_PROJECT_CATEGORIES}"
            " AND (status = 'draft' OR cardinality(categories) >= 1)",
            name="categories_count",
        ),
        CheckConstraint(
            f"categories <@ ARRAY[{_KNOWN_CATEGORIES_SQL}]::text[]",
            name="categories_known",
        ),
        # Фільтри каталогу за сферами й хештегами (R-14): GIN індексує окремі елементи масиву
        Index("ix_projects_categories", "categories", postgresql_using="gin"),
        Index("ix_projects_tags", "tags", postgresql_using="gin"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    organization_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("organizations.id"), index=True
    )
    title: Mapped[str] = mapped_column(Text)
    # Поля, які в чернетці можуть бути порожніми, а з публікацією стають обов'язковими
    # (ck_projects_complete_unless_draft)
    description: Mapped[str | None] = mapped_column(Text)

    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Обов'язковий для публікації: від завершення події залежать підтвердження годин і відгуки
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    is_online: Mapped[bool] = mapped_column(default=False)
    # Може відрізнятися від міста організації
    city_id: Mapped[int | None] = mapped_column(ForeignKey("cities.id"))
    address: Mapped[str | None] = mapped_column(Text)

    capacity: Mapped[int | None] = mapped_column(Integer)
    # Години, що за замовчуванням нараховуються учаснику; можуть бути дробовими
    volunteer_hours: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))

    is_adult_only: Mapped[bool] = mapped_column(default=False)
    # Мінімальний рівень волонтера для подання заявки
    experience_level: Mapped[ExperienceLevelEnum] = mapped_column(
        default=ExperienceLevelEnum.novice
    )
    # API вимагає сферу явно; значення за замовчуванням — для службових вставок і старих даних
    categories: Mapped[list[str]] = mapped_column(
        ARRAY(Text), default=lambda: [ProjectCategoryEnum.other.value]
    )
    # Хештеги організації: вільний текст, нормалізований схемою (нижній регістр, без «#»)
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    # Обкладинка (R-13): шлях до файлу відносно MEDIA_ROOT, наприклад projects/<uuid>.webp.
    # Адресу будує схема з MEDIA_URL, тож зміна префікса не потребує міграції даних
    cover_key: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ProjectStatusEnum] = mapped_column(default=ProjectStatusEnum.draft)
    # Коли проєкт опубліковано: за цим часом, а не за created_at, каталог ставить нові
    # проєкти першими, тож чернетка, опублікована пізніше, не загубиться серед старих
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    organization = relationship("Organization", back_populates="projects")
    city = relationship("City")
