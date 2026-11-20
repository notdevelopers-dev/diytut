from typing import Any

from pydantic import ValidationError
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import errors
from app.models import OrgStatusEnum, Project, ProjectCategoryEnum, ProjectStatusEnum
from app.schemas.projects import ProjectCreate, ProjectDraft, ProjectPublication, normalize_tag
from app.services.cities import ensure_city_exists
from app.services.organizations import EDITOR_ROLES, get_user_membership
from app.services.project_join_requests import lock_project


def _escape_like(value: str) -> str:
    """Екранує %, _ і \\, щоб пошуковий запит не працював як шаблон LIKE."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def list_active_projects(
    db_session: AsyncSession,
    *,
    limit: int,
    offset: int,
    search: str | None = None,
    city_id: int | None = None,
    categories: list[ProjectCategoryEnum] | None = None,
    tags: list[str] | None = None,
) -> list[Project]:
    """Каталог: опубліковані проєкти, які ще не завершилися.

    Кілька сфер чи хештегів — «будь-який із них»; сфери, хештеги й місто разом — «усі умови».
    """
    query = select(Project).where(
        Project.status == ProjectStatusEnum.published,
        Project.ends_at > func.now(),
    )
    if search and search.strip():
        pattern = f"%{_escape_like(search.strip())}%"
        query = query.where(or_(Project.title.ilike(pattern), Project.description.ilike(pattern)))
    if city_id is not None:
        query = query.where(Project.city_id == city_id)
    # Оператор && (перетин масивів) використовує GIN-індекси на categories і tags
    if categories:
        query = query.where(Project.categories.overlap(sorted(set(categories))))
    # Хештег у фільтрі нормалізуємо так само, як під час збереження: «#Толока» знайде «толока».
    # Порожні значення (?tags=) ігноруємо, щоб не відфільтрувати все
    wanted_tags = sorted({tag for raw in tags or [] if (tag := normalize_tag(raw))})
    if wanted_tags:
        query = query.where(Project.tags.overlap(wanted_tags))

    # Нові першими за часом публікації: чернетка, опублікована пізніше, теж потрапить нагору
    query = (
        query.order_by(Project.published_at.desc(), Project.id.desc()).limit(limit).offset(offset)
    )
    return list(await db_session.scalars(query))


def _check_publication(fields: dict[str, Any]) -> dict[str, Any]:
    """Повна перевірка полів перед публікацією; повертає їх нормалізованими.

    Та сама для створення одразу опублікованого проєкту й для публікації чернетки.
    """
    # Порожнє поле — це поле, якого бракує: помилка «Field required», а не про тип значення
    provided = {field: value for field, value in fields.items() if value is not None}
    try:
        publication = ProjectPublication.model_validate(provided)
    except ValidationError as error:
        raise errors.project_incomplete(
            error.errors(include_url=False, include_context=False, include_input=False)
        ) from None
    return publication.model_dump()


async def get_visible_project(
    db_session: AsyncSession, project_id: int, user_id: int | None
) -> Project:
    """Опублікований проєкт бачать усі, а чернетку, завершений і скасований — лише учасники
    його організації (з будь-якою роллю). Для решти такого проєкту не існує: 404, а не 403.
    """
    project = await db_session.get(Project, project_id)
    if project is None:
        raise errors.project_not_found()
    if project.status != ProjectStatusEnum.published and (
        user_id is None
        or await get_user_membership(db_session, user_id, project.organization_id) is None
    ):
        raise errors.project_not_found()
    return project


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
    publish = data.status == ProjectStatusEnum.published
    fields = data.project_fields()
    if publish:
        fields = _check_publication(fields)

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
