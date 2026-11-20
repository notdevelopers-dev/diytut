from datetime import datetime
from typing import Any

from pydantic import ValidationError
from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import errors
from app.models import OrgStatusEnum, Project, ProjectCategoryEnum, ProjectStatusEnum
from app.models.experience import ExperienceLevelEnum
from app.schemas.projects import ProjectCreate, ProjectDraft, check_publication, normalize_tag
from app.services.cities import ensure_city_exists
from app.services.organizations import EDITOR_ROLES, get_user_membership
from app.services.project_join_requests import lock_project
from app.services.project_visibility import projects_with_details


def _escape_like(value: str) -> str:
    """Екранує %, _ і \\, щоб пошуковий запит не працював як шаблон LIKE."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _catalog_filters() -> list[ColumnElement[bool]]:
    """Що потрапляє в каталог: опубліковані проєкти, які ще не завершилися."""
    return [Project.status == ProjectStatusEnum.published, Project.ends_at > func.now()]


async def list_active_projects(
    db_session: AsyncSession,
    user_id: int | None,
    *,
    limit: int,
    offset: int,
    search: str | None = None,
    city_id: int | None = None,
    categories: list[ProjectCategoryEnum] | None = None,
    tags: list[str] | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    is_adult_only: bool | None = None,
    experience_level: ExperienceLevelEnum | None = None,
) -> tuple[list[Project], int, set[int]]:
    """Каталог (R-14): сторінка проєктів, їх загальна кількість під фільтром і id проєктів,
    точні час і місце яких бачить користувач (R-22).

    Кілька сфер чи хештегів — «будь-який із них»; різні фільтри разом — «усі умови».
    """
    if date_from is not None and date_to is not None and date_from > date_to:
        raise errors.invalid_period("date_from must not be later than date_to")

    filters = _catalog_filters()
    if search and search.strip():
        pattern = f"%{_escape_like(search.strip())}%"
        filters.append(or_(Project.title.ilike(pattern), Project.description.ilike(pattern)))
    if city_id is not None:
        filters.append(Project.city_id == city_id)
    # Оператор && (перетин масивів) використовує GIN-індекси на categories і tags
    if categories:
        filters.append(Project.categories.overlap(sorted(set(categories))))
    # Хештег у фільтрі нормалізуємо так само, як під час збереження: «#Толока» знайде «толока».
    # Порожні значення (?tags=) ігноруємо, щоб не відфільтрувати все
    wanted_tags = sorted({tag for raw in tags or [] if (tag := normalize_tag(raw))})
    if wanted_tags:
        filters.append(Project.tags.overlap(wanted_tags))
    # Події, що відбуваються в цей проміжок хоча б частково: багатоденний проєкт, який
    # почався раніше й ще триває, теж підходить
    if date_from is not None:
        filters.append(Project.ends_at > date_from)
    if date_to is not None:
        filters.append(Project.starts_at <= date_to)
    if is_adult_only is not None:
        filters.append(Project.is_adult_only.is_(is_adult_only))
    # Проєкти, на які волонтер цього рівня може подати заявку: вимога не вища за рівень
    if experience_level is not None:
        levels = list(ExperienceLevelEnum)
        filters.append(Project.experience_level.in_(levels[: levels.index(experience_level) + 1]))

    total = await db_session.scalar(select(func.count()).select_from(Project).where(*filters))
    # Нові першими за часом публікації: чернетка, опублікована пізніше, теж потрапить нагору
    projects = list(
        await db_session.scalars(
            select(Project)
            .where(*filters)
            .order_by(Project.published_at.desc(), Project.id.desc())
            .limit(limit)
            .offset(offset)
        )
    )
    return projects, total or 0, await projects_with_details(db_session, user_id, projects)


async def suggest_tags(
    db_session: AsyncSession, prefix: str, *, limit: int
) -> list[tuple[str, int]]:
    """Хештеги проєктів каталогу, що починаються з prefix, популярні першими.

    Беремо лише проєкти, які видно в каталозі: так кожна підказка знаходить проєкти, а
    хештеги чернеток лишаються в організації. Порожній prefix — найпопулярніші загалом.
    """
    project_tags = (
        select(func.unnest(Project.tags).label("tag")).where(*_catalog_filters()).subquery()
    )
    tag = project_tags.c.tag
    projects_count = func.count().label("projects_count")
    query = select(tag, projects_count).group_by(tag).order_by(projects_count.desc(), tag)
    # Хештеги зберігаються нормалізованими, тож і префікс нормалізуємо так само
    if wanted := normalize_tag(prefix):
        query = query.where(tag.startswith(wanted, autoescape=True))
    rows = await db_session.execute(query.limit(limit))
    return [(row.tag, row.projects_count) for row in rows]


def _check_publication(fields: dict[str, Any]) -> None:
    """Повна перевірка полів перед публікацією; 422 з усіма помилками одразу."""
    try:
        check_publication(fields)
    except ValidationError as error:
        raise errors.project_incomplete(
            error.errors(include_url=False, include_context=False, include_input=False)
        ) from None


async def get_visible_project(
    db_session: AsyncSession, project_id: int, user_id: int | None
) -> tuple[Project, bool]:
    """Проєкт і те, чи бачить користувач його точні час і місце (R-22).

    Опублікований проєкт бачать усі, а чернетку, завершений і скасований — лише учасники
    його організації (з будь-якою роллю). Для решти такого проєкту не існує: 404, а не 403.
    """
    project = await db_session.get(Project, project_id)
    if project is None:
        raise errors.project_not_found()
    if project.status != ProjectStatusEnum.published:
        if (
            user_id is None
            or await get_user_membership(db_session, user_id, project.organization_id) is None
        ):
            raise errors.project_not_found()
        return project, True
    return project, project.id in await projects_with_details(db_session, user_id, [project])


async def list_organization_projects(
    db_session: AsyncSession,
    organization_id: int,
    *,
    status: ProjectStatusEnum | None,
    limit: int,
    offset: int,
) -> tuple[list[Project], int]:
    """Усі проєкти організації для її кабінету, зокрема чернетки; нові спершу."""
    filters = [Project.organization_id == organization_id]
    if status is not None:
        filters.append(Project.status == status)
    total = await db_session.scalar(select(func.count()).select_from(Project).where(*filters))
    projects = await db_session.scalars(
        select(Project)
        .where(*filters)
        .order_by(Project.created_at.desc(), Project.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(projects), total


async def create_project(db_session: AsyncSession, user_id: int, data: ProjectCreate) -> Project:
    # Повноту полів одразу опублікованого проєкту вже перевірив ProjectCreate
    publish = data.status == ProjectStatusEnum.published
    fields = data.project_fields()

    # Блокування: роль і статус організації не зміняться, доки проєкт не збережено
    membership = await get_user_membership(db_session, user_id, data.organization_id, lock=True)
    if membership is None:
        if data.organization_id is not None:
            raise errors.project_requires_membership()
        raise errors.project_requires_organization()
    if membership.role not in EDITOR_ROLES:
        raise errors.not_project_manager()
    if membership.organization.status == OrgStatusEnum.blocked:
        raise errors.organization_blocked()
    # Публікувати можуть лише схвалені організації (R-12, розділ 4.3 scope). Чернетку
    # можна готувати й поки організація чекає на схвалення: її не бачить ніхто поза нею
    if publish and membership.organization.status != OrgStatusEnum.approved:
        raise errors.organization_not_approved()

    if fields["city_id"] is not None:
        await ensure_city_exists(db_session, fields["city_id"])

    fields["categories"] = [category.value for category in fields["categories"]]
    project = Project(
        **fields,
        organization_id=membership.organization_id,
        status=data.status,
        published_at=func.now() if publish else None,
    )
    db_session.add(project)
    await db_session.commit()
    # created_at і published_at заповнює БД
    await db_session.refresh(project)
    return project


async def publish_project(db_session: AsyncSession, user_id: int, project_id: int) -> Project:
    project = await db_session.get(Project, project_id)
    if project is None:
        raise errors.project_not_found()
    # Спершу членство, потім проєкт — у тому ж порядку блокує й розгляд заявок, тож
    # паралельні запити не заблокують одне одного
    membership = await get_user_membership(db_session, user_id, project.organization_id, lock=True)
    # Чернетку чужої організації не видно: так не видно й того, які id зайняті
    if membership is None:
        raise errors.project_not_found()
    project = await lock_project(db_session, project_id)
    if project is None:
        raise errors.project_not_found()

    if membership.role not in EDITOR_ROLES:
        raise errors.not_project_publisher()
    if membership.organization.status == OrgStatusEnum.blocked:
        raise errors.organization_blocked()
    if membership.organization.status != OrgStatusEnum.approved:
        raise errors.organization_not_approved()
    if project.status != ProjectStatusEnum.draft:
        raise errors.project_not_draft()

    # Чернетку зберігали з будь-якими полями: тепер усі обов'язкові мають бути заповнені
    _check_publication({field: getattr(project, field) for field in ProjectDraft.model_fields})

    project.status = ProjectStatusEnum.published
    project.published_at = func.now()
    await db_session.commit()
    # published_at і updated_at обчислює БД
    await db_session.refresh(project)
    return project
