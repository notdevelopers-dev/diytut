from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any, NamedTuple

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import errors
from app.models import (
    JoinRequest,
    JoinRequestStatusEnum,
    NotificationTypeEnum,
    OrganizationMember,
    OrgStatusEnum,
    Project,
    ProjectCategoryEnum,
    ProjectStatusEnum,
    User,
)
from app.notifications import create_notification, project_page_link
from app.schemas.projects import (
    ProjectCreate,
    ProjectDraft,
    ProjectUpdate,
    check_publication,
    normalize_tag,
)
from app.services.cities import ensure_city_exists
from app.services.organizations import EDITOR_ROLES, get_user_membership
from app.services.project_join_requests import (
    count_accepted,
    get_confirmed_hours,
    lock_project,
    project_requests,
    unmet_requirement,
)


class NotifiedChange(NamedTuple):
    """Зміна опублікованого проєкту, про яку сповіщаємо волонтерів (рішення 18.11)."""

    # Поля проєкту, зміна будь-якого з яких і є цією зміною
    fields: frozenset[str]
    # Як зміна називається в тексті сповіщення
    label: str
    # Статуси заявок, власники яких отримують сповіщення
    recipients: frozenset[JoinRequestStatusEnum]


# Дата чи час — усіх, хто збирається прийти, зокрема тих, чия заявка ще на розгляді; місце
# й кількість годин — лише схвалених. Назва, опис, сфери, хештеги та інші поля сповіщень
# не дають
NOTIFIED_CHANGES = (
    NotifiedChange(
        fields=frozenset({"starts_at", "ends_at"}),
        label="дата або час",
        recipients=frozenset({JoinRequestStatusEnum.accepted, JoinRequestStatusEnum.pending}),
    ),
    NotifiedChange(
        fields=frozenset({"is_online", "city_id", "address"}),
        label="місце",
        recipients=frozenset({JoinRequestStatusEnum.accepted}),
    ),
    NotifiedChange(
        fields=frozenset({"volunteer_hours"}),
        label="кількість волонтерських годин",
        recipients=frozenset({JoinRequestStatusEnum.accepted}),
    ),
)
# Місто й адреса офлайн-події. Місто онлайн-події потрібне лише фільтру каталогу, а адреса —
# нікому: їх зміна для волонтерів не є зміною місця, поки подія лишається онлайн
OFFLINE_LOCATION_FIELDS = frozenset({"city_id", "address"})
# Поля, від яких залежить, чи підходить волонтер проєкту (R-12): вік рахується на день
# початку події, тож ранніша дата теж може зробити учасника неповнолітнім
REQUIREMENT_FIELDS = frozenset({"is_adult_only", "experience_level", "starts_at"})
# Завершений чи скасований проєкт уже не змінюється: від нього залежать нараховані години
# й відгуки
NOT_EDITABLE_STATUSES = frozenset({ProjectStatusEnum.completed, ProjectStatusEnum.cancelled})


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


def _validation_failed(error: ValidationError) -> HTTPException:
    return errors.project_incomplete(
        error.errors(include_url=False, include_context=False, include_input=False)
    )


def _check_publication(fields: dict[str, Any]) -> None:
    """Повна перевірка полів перед публікацією; 422 з усіма помилками одразу."""
    try:
        check_publication(fields)
    except ValidationError as error:
        raise _validation_failed(error) from None


def _check_draft(fields: dict[str, Any]) -> None:
    """Перевірка полів чернетки: заповнені поля коректні й не суперечать одне одному; 422."""
    try:
        ProjectDraft.model_validate(fields)
    except ValidationError as error:
        raise _validation_failed(error) from None


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


async def read_project(
    db_session: AsyncSession, project_id: int, user_id: int | None
) -> tuple[Project, int]:
    """Проєкт для сторінки й форми редагування разом із кількістю схвалених заявок."""
    project = await get_visible_project(db_session, project_id, user_id)
    return project, await count_accepted(db_session, project.id)


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


async def create_project(
    db_session: AsyncSession, user_id: int, data: ProjectCreate
) -> tuple[Project, int]:
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
    # Новий проєкт: заявок на нього ще немає
    return project, 0


async def lock_managed_project(
    db_session: AsyncSession,
    user_id: int,
    project_id: int,
    not_manager: Callable[[], HTTPException],
) -> tuple[OrganizationMember, Project]:
    """Проєкт, яким користувач може керувати: owner чи admin незаблокованої організації.

    Членство, організація й проєкт заблоковані до кінця транзакції: роль, статус організації
    й сам проєкт не зміняться між перевірками й записом. Спершу членство, потім проєкт — у
    тому ж порядку блокує й розгляд заявок, тож паралельні запити не заблокують одне одного.
    Проєкт чужої організації, зокрема чернетку, не видно: 404, щоб не видно було й того,
    які id зайняті. Учаснику без прав — not_manager().
    """
    project = await db_session.get(Project, project_id)
    if project is None:
        raise errors.project_not_found()
    membership = await get_user_membership(db_session, user_id, project.organization_id, lock=True)
    if membership is None:
        raise errors.project_not_found()
    project = await lock_project(db_session, project_id)
    if project is None:
        raise errors.project_not_found()

    if membership.role not in EDITOR_ROLES:
        raise not_manager()
    if membership.organization.status == OrgStatusEnum.blocked:
        raise errors.organization_blocked()
    return membership, project


async def publish_project(
    db_session: AsyncSession, user_id: int, project_id: int
) -> tuple[Project, int]:
    membership, project = await lock_managed_project(
        db_session, user_id, project_id, errors.not_project_publisher
    )
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
    # Заявки подають лише на опублікований проєкт, тож у щойно опублікованої чернетки їх немає
    return project, 0


async def _notify_about_changes(
    db_session: AsyncSession, project: Project, organization_name: str, changed: set[str]
) -> None:
    """Сповіщення project_updated волонтерам, яких стосуються зміни (рішення 18.11).

    Кожен отримує одне сповіщення з переліком саме тих змін, що його стосуються. Нових
    значень у тексті немає: точні час і місце показує сторінка проєкту тим, кому їх можна
    бачити (R-22).
    """
    notified = set(changed)
    # Місто й адреса онлайн-події волонтерів не стосуються: місце змінилося, лише якщо подія
    # стала офлайн чи онлайн або змінилися місто чи адреса офлайн-події
    if project.is_online and "is_online" not in changed:
        notified -= OFFLINE_LOCATION_FIELDS
    relevant = [change for change in NOTIFIED_CHANGES if change.fields & notified]
    if not relevant:
        return
    requests = await db_session.execute(
        project_requests()
        .with_only_columns(JoinRequest.user_id, JoinRequest.status)
        .where(
            JoinRequest.project_id == project.id,
            JoinRequest.status.in_(set().union(*(change.recipients for change in relevant))),
        )
    )
    for user_id, status in requests:
        labels = [change.label for change in relevant if status in change.recipients]
        create_notification(
            db_session,
            user_id,
            NotificationTypeEnum.project_updated,
            "Зміни в проєкті",
            f"Організація «{organization_name}» оновила проєкт «{project.title}». "
            f"Змінено: {', '.join(labels)}. Подробиці — на сторінці проєкту.",
            link=project_page_link(project.id),
        )


async def _count_participants_missing_requirements(
    db_session: AsyncSession, project_id: int, fields: dict[str, Any]
) -> int:
    """Скільки схвалених учасників не відповідали б вимогам проєкту з полями fields."""
    participants = (
        await db_session.execute(
            project_requests()
            .with_only_columns(JoinRequest.user_id, User.birth_date)
            .join(User, User.id == JoinRequest.user_id)
            .where(
                JoinRequest.project_id == project_id,
                JoinRequest.status == JoinRequestStatusEnum.accepted,
            )
        )
    ).all()
    hours = await get_confirmed_hours(db_session, [user_id for user_id, _ in participants])
    return sum(
        1
        for user_id, birth_date in participants
        if unmet_requirement(
            birth_date,
            hours[user_id],
            starts_at=fields["starts_at"],
            is_adult_only=fields["is_adult_only"],
            experience_level=fields["experience_level"],
        )
        is not None
    )


async def update_project(
    db_session: AsyncSession, user_id: int, project_id: int, data: ProjectUpdate
) -> tuple[Project, int]:
    # Блокування рядка проєкту: паралельне прийняття заявки чекає, доки зміну збережено, і
    # рахує місця вже з новою capacity, а ця зміна — з усіма вже прийнятими заявками
    membership, project = await lock_managed_project(
        db_session, user_id, project_id, errors.not_project_editor
    )
    if project.status in NOT_EDITABLE_STATUSES:
        raise errors.project_not_editable()
    published = project.status == ProjectStatusEnum.published
    # Учасники вже на події: змінювати її пізно. Чернетку з минулою датою виправити можна
    if published and project.starts_at <= datetime.now(UTC):
        raise errors.project_already_started()

    changes = data.project_changes()
    # Зв'язки між полями й повноту перевіряємо на тому, що вийде після зміни: передане поле
    # може суперечити збереженому, наприклад новий кінець — старому початку
    result = {field: getattr(project, field) for field in ProjectDraft.model_fields} | changes
    if published:
        # Повна перевірка не дасть і перенести початок у минуле: такий проєкт уже «почався»,
        # і ні виправити дату, ні скасувати заявку вже не вийшло б
        _check_publication(result)
    else:
        _check_draft(result)

    if changes.get("city_id") is not None:
        await ensure_city_exists(db_session, changes["city_id"])
    # Під блокуванням проєкту: паралельне прийняття заявки цього числа не змінить
    accepted = await count_accepted(db_session, project.id)
    if changes.get("capacity") is not None and changes["capacity"] < accepted:
        raise errors.capacity_below_accepted(accepted)

    if "categories" in changes:
        changes["categories"] = [category.value for category in changes["categories"]]
    # Те саме значення, надіслане повторно (форма шле всі поля), зміною не вважається
    changed = {field for field, value in changes.items() if getattr(project, field) != value}
    # Схвалений учасник, якому нові вимоги чи ранніша дата вже не підходять (вік, рівень),
    # не має лишитися на події, а вилучити його організатор не може: зміну відхиляємо.
    # Заявки на розгляді не заважають: прийняти тих, хто не підходить, не дасть перевірка
    # вимог у розгляді заявки (_check_project_decision в app/services/join_requests.py)
    if published and changed & REQUIREMENT_FIELDS:
        missing = await _count_participants_missing_requirements(db_session, project.id, result)
        if missing:
            raise errors.participants_miss_requirements(missing)
    for field in changed:
        setattr(project, field, changes[field])
    # У чернетки немає заявок, а її публікація зміною для волонтерів не є
    if published:
        await _notify_about_changes(db_session, project, membership.organization.name, changed)

    # Зміни й сповіщення про них зберігаються в одній транзакції
    await db_session.commit()
    # updated_at обчислює БД
    await db_session.refresh(project)
    return project, accepted
