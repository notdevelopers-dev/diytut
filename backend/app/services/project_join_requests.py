"""Заявки волонтерів на участь у проєктах (R-23) і перевірки для їх розгляду (R-24).

Рішення організації щодо заявки ухвалює спільний для всіх заявок
app.services.join_requests.review_join_request, а перевірки проєкту бере звідси.
"""

import math
from collections.abc import Iterable
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Literal

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import distinct_on, insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app import errors
from app.db import violated_constraint
from app.models import (
    Attendance,
    JoinRequest,
    JoinRequestStatusEnum,
    JoinRequestTargetEnum,
    NotificationTypeEnum,
    Organization,
    OrganizationIgnoredUser,
    OrganizationMember,
    OrgStatusEnum,
    Project,
    ProjectStatusEnum,
    User,
)
from app.models.experience import ExperienceLevelEnum, level_for_hours, meets_level
from app.models.project import EVENT_TIMEZONE
from app.notifications import create_notification, project_join_requests_link
from app.schemas.join_requests import JoinRequestCreate
from app.services.organizations import EDITOR_ROLES, get_user_membership
from app.services.project_visibility import projects_with_details

ACTIVE_PROJECT_REQUEST_INDEX = "uq_join_requests_active_user_project"
# Вимога проєкту, якої волонтер не виконує (R-12)
UnmetRequirement = Literal["adult_only", "experience_level"]
ACTIVE_STATUSES = (JoinRequestStatusEnum.pending, JoinRequestStatusEnum.accepted)
ADULT_AGE = 18
# Пауза перед повторною заявкою на проєкт після відмови: 10 с, далі вп'ятеро довше після
# кожної наступної відмови на той самий проєкт (50 с, ~4 хв, ~21 хв, ~1,7 год, ~8,7 год,
# ~1,8 доби), але не більше тижня — його досягає восьма відмова
REAPPLY_BASE_DELAY = timedelta(seconds=10)
REAPPLY_GROWTH = 5
REAPPLY_MAX_DELAY = timedelta(weeks=1)


def project_requests():
    """Заявки на участь у проєктах, а не на вступ до організації: основа запитів до них."""
    return select(JoinRequest).where(JoinRequest.target == JoinRequestTargetEnum.project)


def _age_on(birth_date: date, day: date) -> int:
    had_birthday = (day.month, day.day) >= (birth_date.month, birth_date.day)
    return day.year - birth_date.year - (0 if had_birthday else 1)


def unmet_requirement(
    birth_date: date,
    confirmed_hours: Decimal,
    *,
    starts_at: datetime,
    is_adult_only: bool,
    experience_level: ExperienceLevelEnum,
) -> UnmetRequirement | None:
    """Яку вимогу проєкту (R-12) волонтер не виконує: вік на день початку події чи рівень.

    Вимоги передаються окремо, а не проєктом: редагування перевіряє їх до того, як
    змінити проєкт. Перевіряють подання заявки, її прийняття й редагування проєкту:
    вимоги чи дату могли змінити вже після подання.
    """
    event_day = starts_at.astimezone(EVENT_TIMEZONE).date()
    if is_adult_only and _age_on(birth_date, event_day) < ADULT_AGE:
        return "adult_only"
    if not meets_level(level_for_hours(confirmed_hours), experience_level):
        return "experience_level"
    return None


async def check_applicant_requirements(
    db_session: AsyncSession, project: Project, user_id: int
) -> UnmetRequirement | None:
    """unmet_requirement для волонтера й поточних вимог проєкту."""
    birth_date = await db_session.scalar(select(User.birth_date).where(User.id == user_id))
    hours = (await get_confirmed_hours(db_session, [user_id]))[user_id]
    return unmet_requirement(
        birth_date,
        hours,
        starts_at=project.starts_at,
        is_adult_only=project.is_adult_only,
        experience_level=project.experience_level,
    )


async def get_confirmed_hours(
    db_session: AsyncSession, user_ids: Iterable[int]
) -> dict[int, Decimal]:
    """Сума підтверджених годин кожного користувача (R-26); без участі — 0."""
    ids = set(user_ids)
    if not ids:
        return {}
    rows = await db_session.execute(
        select(Attendance.user_id, func.sum(Attendance.hours))
        .where(Attendance.user_id.in_(ids))
        .group_by(Attendance.user_id)
    )
    hours = {user_id: Decimal(0) for user_id in ids}
    hours.update({user_id: total for user_id, total in rows})
    return hours


async def count_accepted(db_session: AsyncSession, project_id: int) -> int:
    """Скільки місць проєкту вже зайнято схваленими заявками."""
    return await db_session.scalar(
        project_requests()
        .with_only_columns(func.count())
        .where(
            JoinRequest.project_id == project_id,
            JoinRequest.status == JoinRequestStatusEnum.accepted,
        )
    )


def is_open(project: Project) -> bool:
    """Чи приймає проєкт заявки: опублікований і ще не почався."""
    return project.status == ProjectStatusEnum.published and project.starts_at > datetime.now(UTC)


async def lock_project(db_session: AsyncSession, project_id: int) -> Project:
    """Блокує проєкт до кінця транзакції: паралельні рішення щодо його заявок виконуються
    по черзі й рахують зайняті місця вже з урахуванням одне одного (R-24)."""
    return await db_session.scalar(
        select(Project)
        .where(Project.id == project_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


async def _get_public_project(db_session: AsyncSession, project_id: int) -> Project:
    # Проєкт несхваленої чи заблокованої організації для волонтера не існує, як і чернетка
    project = await db_session.scalar(
        select(Project)
        .join(Project.organization)
        .where(
            Project.id == project_id,
            Project.status == ProjectStatusEnum.published,
            Organization.status == OrgStatusEnum.approved,
        )
    )
    if project is None:
        raise errors.project_not_found()
    return project


async def _latest_request(
    db_session: AsyncSession, user_id: int, project_id: int
) -> JoinRequest | None:
    return await db_session.scalar(
        project_requests()
        .where(JoinRequest.user_id == user_id, JoinRequest.project_id == project_id)
        .order_by(JoinRequest.created_at.desc(), JoinRequest.id.desc())
        .limit(1)
    )


def reapply_delay(rejections: int) -> timedelta:
    """Скільки чекати після останньої відмови, якщо відмов на цей проєкт уже rejections."""
    delay = REAPPLY_BASE_DELAY
    # Множимо, доки не впремося в межу: цикл короткий за будь-яких констант
    for _ in range(rejections - 1):
        delay *= REAPPLY_GROWTH
        if delay >= REAPPLY_MAX_DELAY:
            return REAPPLY_MAX_DELAY
    return delay


async def _reapply_times(
    db_session: AsyncSession, user_id: int, project_ids: Iterable[int]
) -> dict[int, datetime]:
    """Коли закінчиться пауза після відмов: для кожного проєкту, де вони були."""
    rows = await db_session.execute(
        project_requests()
        .with_only_columns(JoinRequest.project_id, func.count(), func.max(JoinRequest.reviewed_at))
        .where(
            JoinRequest.user_id == user_id,
            JoinRequest.project_id.in_(set(project_ids)),
            JoinRequest.status == JoinRequestStatusEnum.rejected,
            JoinRequest.reviewed_at.is_not(None),
        )
        .group_by(JoinRequest.project_id)
    )
    return {
        project_id: last_rejected_at + reapply_delay(rejections)
        for project_id, rejections, last_rejected_at in rows
    }


async def _check_reapply_delay(db_session: AsyncSession, user_id: int, project_id: int) -> None:
    reapply_at = (await _reapply_times(db_session, user_id, [project_id])).get(project_id)
    if reapply_at is None:
        return
    remaining = reapply_at - datetime.now(UTC)
    if remaining > timedelta(0):
        raise errors.reapply_too_soon(math.ceil(remaining.total_seconds()))


async def is_ignored(db_session: AsyncSession, organization_id: int, user_id: int) -> bool:
    return await db_session.get(OrganizationIgnoredUser, (organization_id, user_id)) is not None


async def ignore_applicant(
    db_session: AsyncSession, join_request: JoinRequest, ignored_by: int
) -> None:
    """Додає волонтера до ігнору організації; повторний ігнор нічого не змінює."""
    await db_session.execute(
        insert(OrganizationIgnoredUser)
        .values(
            organization_id=join_request.organization_id,
            user_id=join_request.user_id,
            ignored_by=ignored_by,
        )
        .on_conflict_do_nothing()
    )


async def list_ignored_users(
    db_session: AsyncSession, organization_id: int, *, limit: int, offset: int
) -> list[OrganizationIgnoredUser]:
    """Ігнор організації, свіжіші спершу."""
    query = (
        select(OrganizationIgnoredUser)
        .options(joinedload(OrganizationIgnoredUser.user, innerjoin=True))
        .where(OrganizationIgnoredUser.organization_id == organization_id)
        .order_by(OrganizationIgnoredUser.created_at.desc(), OrganizationIgnoredUser.user_id.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(await db_session.scalars(query))


async def unignore_user(db_session: AsyncSession, organization_id: int, user_id: int) -> None:
    result = await db_session.execute(
        delete(OrganizationIgnoredUser).where(
            OrganizationIgnoredUser.organization_id == organization_id,
            OrganizationIgnoredUser.user_id == user_id,
        )
    )
    if result.rowcount == 0:
        raise errors.ignored_user_not_found()
    await db_session.commit()


async def _notify_organizers(
    db_session: AsyncSession,
    project: Project,
    type_: NotificationTypeEnum,
    title: str,
    message: str,
) -> None:
    # Власник і адміни: саме вони розглядають заявки на проєкти
    organizer_ids = await db_session.scalars(
        select(OrganizationMember.user_id).where(
            OrganizationMember.organization_id == project.organization_id,
            OrganizationMember.role.in_(EDITOR_ROLES),
        )
    )
    for organizer_id in organizer_ids:
        create_notification(
            db_session,
            organizer_id,
            type_,
            title,
            message,
            link=project_join_requests_link(project.organization_id, project.id),
        )


async def create_project_join_request(
    db_session: AsyncSession, user_id: int, project_id: int, data: JoinRequestCreate
) -> JoinRequest:
    # Токен сесії переживає видалення акаунта: без перевірки впали б з 500 на ключі user_id
    user = await db_session.get(User, user_id)
    if user is None:
        raise errors.not_authenticated()
    project = await _get_public_project(db_session, project_id)
    if not is_open(project):
        raise errors.project_already_started()

    # Членство в організації не потрібне (R-23), але організатор не подає заявку сам собі
    membership = await get_user_membership(db_session, user_id, project.organization_id)
    if membership is not None and membership.role in EDITOR_ROLES:
        raise errors.organizer_cannot_apply()

    if await is_ignored(db_session, project.organization_id, user_id):
        raise errors.applicant_ignored()

    latest = await _latest_request(db_session, user_id, project.id)
    if latest is not None and latest.status in ACTIVE_STATUSES:
        raise errors.project_join_request_already_active()
    # Після відмови повторна заявка можлива лише після паузи, що зростає з кожною
    # відмовою: так волонтер не засипле організацію однаковими заявками
    await _check_reapply_delay(db_session, user_id, project.id)

    # Вимоги проєкту (R-12): вік на день початку події й мінімальний рівень досвіду
    unmet = await check_applicant_requirements(db_session, project, user_id)
    if unmet == "adult_only":
        raise errors.project_adult_only()
    if unmet == "experience_level":
        raise errors.experience_level_too_low()

    # Попередня перевірка: остаточно місця рахуються під час розгляду під блокуванням
    if await count_accepted(db_session, project.id) >= project.capacity:
        raise errors.project_full()

    join_request = JoinRequest(
        user_id=user_id,
        organization_id=project.organization_id,
        project_id=project.id,
        target=JoinRequestTargetEnum.project,
        message=data.message,
    )
    db_session.add(join_request)
    await _notify_organizers(
        db_session,
        project,
        NotificationTypeEnum.join_request_received,
        "Нова заявка на проєкт",
        f"На проєкт «{project.title}» надійшла нова заявка.",
    )
    # Заявка й сповіщення про неї зберігаються разом
    try:
        await db_session.commit()
    except IntegrityError as error:
        # Паралельний запит встиг створити таку саму заявку
        await db_session.rollback()
        if violated_constraint(error) == ACTIVE_PROJECT_REQUEST_INDEX:
            raise errors.project_join_request_already_active() from error
        raise

    # status і created_at заповнює БД
    await db_session.refresh(join_request)
    return join_request


async def get_my_request_statuses(
    db_session: AsyncSession, user_id: int, project_ids: Iterable[int]
) -> list[tuple[JoinRequest, datetime | None]]:
    """Остання заявка користувача на кожен із проєктів, де вона є, і коли після відмови
    можна подати нову (None — повторна заявка неможлива або не потрібна).

    Одним запитом для всіх карток сторінки, а не запитом на кожну.
    """
    ids = set(project_ids)
    latest = list(
        await db_session.scalars(
            project_requests()
            .options(joinedload(JoinRequest.project, innerjoin=True))
            .where(JoinRequest.user_id == user_id, JoinRequest.project_id.in_(ids))
            .ext(distinct_on(JoinRequest.project_id))
            .order_by(JoinRequest.project_id, JoinRequest.created_at.desc(), JoinRequest.id.desc())
        )
    )
    # Повторна заявка можлива лише після відмови, на відкритий проєкт і поза ігнором.
    # Ігнор так виглядає звичайною відмовою, лише без часу повторної заявки
    rejected = [
        request
        for request in latest
        if request.status == JoinRequestStatusEnum.rejected and is_open(request.project)
    ]
    reapply_at: dict[int, datetime] = {}
    if rejected:
        ignored_organizations = set(
            await db_session.scalars(
                select(OrganizationIgnoredUser.organization_id).where(
                    OrganizationIgnoredUser.user_id == user_id,
                    OrganizationIgnoredUser.organization_id.in_(
                        {request.organization_id for request in rejected}
                    ),
                )
            )
        )
        times = await _reapply_times(db_session, user_id, (r.project_id for r in rejected))
        reapply_at = {
            request.project_id: times[request.project_id]
            for request in rejected
            if request.organization_id not in ignored_organizations and request.project_id in times
        }
    return [(request, reapply_at.get(request.project_id)) for request in latest]


async def get_my_request_status(
    db_session: AsyncSession, user_id: int, project_id: int
) -> tuple[JoinRequest, datetime | None]:
    """Остання заявка користувача на проєкт, хоч би яким був її статус."""
    statuses = await get_my_request_statuses(db_session, user_id, [project_id])
    if not statuses:
        raise errors.join_request_not_found()
    return statuses[0]


async def cancel_my_project_request(
    db_session: AsyncSession, user_id: int, project_id: int
) -> JoinRequest:
    """Скасування заявки волонтером до початку події; схвалена заявка звільняє місце (R-23)."""
    # Блокування: скасування не перетнеться з рішенням організації щодо цієї ж заявки
    join_request = await db_session.scalar(
        project_requests()
        .options(joinedload(JoinRequest.project, innerjoin=True))
        .where(
            JoinRequest.user_id == user_id,
            JoinRequest.project_id == project_id,
            JoinRequest.status.in_(ACTIVE_STATUSES),
        )
        .with_for_update(of=JoinRequest)
        .execution_options(populate_existing=True)
    )
    if join_request is None:
        raise errors.join_request_not_found()
    project = join_request.project
    if project.starts_at <= datetime.now(UTC):
        raise errors.project_already_started()

    join_request.status = JoinRequestStatusEnum.cancelled
    await _notify_organizers(
        db_session,
        project,
        NotificationTypeEnum.join_request_cancelled,
        "Заявку скасовано",
        f"Волонтер скасував заявку на проєкт «{project.title}».",
    )
    await db_session.commit()

    # updated_at обчислює БД
    await db_session.refresh(join_request)
    return join_request


async def list_my_project_requests(
    db_session: AsyncSession, user_id: int, *, limit: int, offset: int
) -> tuple[list[JoinRequest], set[int]]:
    """Заявки волонтера на проєкти, свіжіші спершу, та id проєктів, точний час яких він
    бачить (R-22): зі схваленою заявкою чи як учасник організації."""
    query = (
        project_requests()
        .options(joinedload(JoinRequest.project, innerjoin=True))
        .where(JoinRequest.user_id == user_id)
        .order_by(JoinRequest.created_at.desc(), JoinRequest.id.desc())
        .limit(limit)
        .offset(offset)
    )
    join_requests = list(await db_session.scalars(query))
    visible = await projects_with_details(
        db_session, user_id, [request.project for request in join_requests]
    )
    return join_requests, visible


async def list_project_requests(
    db_session: AsyncSession,
    user_id: int,
    project_id: int,
    *,
    status: JoinRequestStatusEnum,
    limit: int,
    offset: int,
) -> tuple[list[JoinRequest], dict[int, Decimal]]:
    """Заявки на проєкт для його організації разом із підтвердженими годинами волонтерів.

    Давніші спершу, щоб ніхто не чекав вічно.
    """
    project = await db_session.get(Project, project_id)
    # Чужий проєкт для користувача не існує: так не видно, які id зайняті
    if project is None:
        raise errors.project_not_found()
    membership = await get_user_membership(db_session, user_id, project.organization_id)
    if membership is None:
        raise errors.project_not_found()
    if membership.role not in EDITOR_ROLES:
        raise errors.not_join_request_reviewer()

    query = (
        project_requests()
        .options(joinedload(JoinRequest.user, innerjoin=True))
        .where(JoinRequest.project_id == project.id, JoinRequest.status == status)
        .order_by(JoinRequest.created_at, JoinRequest.id)
        .limit(limit)
        .offset(offset)
    )
    join_requests = list(await db_session.scalars(query))
    hours = await get_confirmed_hours(db_session, (r.user_id for r in join_requests))
    return join_requests, hours
