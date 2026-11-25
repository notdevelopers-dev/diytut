"""Підтвердження участі й нарахування годин після події (R-25, R-26).

Права, порядок блокувань і 404 для чужих проєктів — ті самі, що в редагування проєкту
(app.services.projects.lock_managed_project). Годин і рівня досвіду в `users` немає:
баланс — це сума `attendances.hours`, а рівень обчислюється з неї (R-27), тож «оновлення
рівня» в тій самій транзакції — це сповіщення level_up, якщо нарахування підняло рівень.
"""

from collections.abc import Iterable
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import and_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app import errors
from app.db import violated_constraint
from app.models import (
    Attendance,
    JoinRequest,
    JoinRequestStatusEnum,
    NotificationTypeEnum,
    Project,
    ProjectStatusEnum,
    User,
)
from app.models.experience import ExperienceLevelEnum, level_for_hours, meets_level
from app.notifications import create_notification, project_page_link
from app.schemas.attendances import AttendanceBatchCreate, AttendanceUpdate
from app.services.organizations import EDITOR_ROLES, get_user_membership
from app.services.project_join_requests import get_confirmed_hours, project_requests
from app.services.projects import lock_managed_project

# Години зберігаються з двома знаками після коми (numeric(5, 2))
HOURS_PRECISION = Decimal("0.01")

# Ім'я задане явно в моделі: конвенція дала б оманливе uq_attendances_project_id
UNIQUE_ATTENDANCE_CONSTRAINT = "uq_attendances_project_id_user_id"

# Назви рівнів, як на фронтенді (R-27)
LEVEL_LABELS: dict[ExperienceLevelEnum, str] = {
    ExperienceLevelEnum.novice: "Новачок",
    ExperienceLevelEnum.interested: "Зацікавлений",
    ExperienceLevelEnum.amateur: "Аматор",
    ExperienceLevelEnum.experienced: "Досвідчений",
    ExperienceLevelEnum.pro: "Профі",
}


def _require_finished(project: Project) -> None:
    """Участь підтверджують лише після події.

    Завершений проєкт (організатор міг завершити його й раніше за `ends_at`) і опублікований
    з минулим `ends_at` підходять. Чернетка й подія, що ще триває, — ні; скасований
    проєкт участі не має.
    """
    if project.status == ProjectStatusEnum.cancelled:
        raise errors.project_cancelled_no_attendance()
    if project.status == ProjectStatusEnum.completed:
        return
    if project.status == ProjectStatusEnum.draft or project.ends_at > datetime.now(UTC):
        raise errors.project_not_finished()


def _format_hours(hours: Decimal) -> str:
    # 2.00 → «2», 2.50 → «2.5»
    return format(hours.normalize(), "f")


def _notify_hours(
    db_session: AsyncSession, project: Project, user_id: int, hours: Decimal, *, corrected: bool
) -> None:
    """Сповіщення hours_credited, зокрема про 0 годин (волонтер має знати, що його позначено
    як відсутнього)."""
    if corrected:
        title = "Години змінено"
        message = (
            f"Організація змінила нараховані вам години за проєкт «{project.title}»: "
            f"{_format_hours(hours)} год."
        )
    elif hours == 0:
        title = "Участь підтверджено"
        message = (
            f"Організація позначила, що вас не було на проєкті «{project.title}»: "
            "години не нараховано."
        )
    else:
        title = "Години нараховано"
        message = (
            f"Організація підтвердила вашу участь у проєкті «{project.title}»: "
            f"{_format_hours(hours)} год."
        )
    create_notification(
        db_session,
        user_id,
        NotificationTypeEnum.hours_credited,
        title,
        message,
        link=project_page_link(project.id),
    )


def _notify_level_up(
    db_session: AsyncSession, user_id: int, hours_before: Decimal, hours_after: Decimal
) -> None:
    """Сповіщення level_up, якщо сума годин перейшла на вищий рівень (R-27).

    Зменшення годин рівень, звісно, може й знизити, але про це не сповіщаємо.
    """
    before, after = level_for_hours(hours_before), level_for_hours(hours_after)
    if after != before and meets_level(after, before):
        create_notification(
            db_session,
            user_id,
            NotificationTypeEnum.level_up,
            "Новий рівень досвіду",
            f"Вітаємо! Ваш рівень досвіду тепер «{LEVEL_LABELS[after]}».",
        )


async def _lock_volunteers(db_session: AsyncSession, user_ids: Iterable[int]) -> None:
    """Блокує рядки волонтерів до кінця транзакції.

    Сума годин «до» читається без цього з однієї й тієї самої застарілої картини: два
    організатори, що одночасно нараховують години одному волонтеру за різні проєкти, не
    бачать записів одне одного, тож level_up губиться або дублюється. Під блокуванням
    другий запит чекає на перший і рахує суму вже з його годинами.

    FOR NO KEY UPDATE не конфліктує з перевірками зовнішніх ключів на users, які роблять
    вставки в attendances і notifications, але виконує нарахування по черзі. Рядки
    блокуються за зростанням id, щоб два пакети з перетином не заблокували одне одного.
    Спершу членство й проєкт (lock_managed_project), потім волонтери.
    """
    await db_session.execute(
        select(User.id)
        .where(User.id.in_(set(user_ids)))
        .order_by(User.id)
        .with_for_update(key_share=True)
        .execution_options(populate_existing=True)
    )


async def confirm_attendances(
    db_session: AsyncSession, user_id: int, project_id: int, data: AttendanceBatchCreate
) -> list[Attendance]:
    """Підтверджує участь і нараховує години одним пакетом: усе або нічого.

    Години без значення — це `volunteer_hours` проєкту, 0 — не прийшов. Повторне
    підтвердження того самого волонтера — 409: виправляє години PATCH, а не новий запис.
    """
    _, project = await lock_managed_project(
        db_session, user_id, project_id, errors.not_attendance_manager
    )
    _require_finished(project)

    volunteer_ids = [entry.user_id for entry in data.entries]
    # Лише схвалені учасники; решту перелічуємо всіх одразу, щоб виправити за одну спробу
    accepted = set(
        await db_session.scalars(
            project_requests()
            .with_only_columns(JoinRequest.user_id)
            .where(
                JoinRequest.project_id == project.id,
                JoinRequest.status == JoinRequestStatusEnum.accepted,
                JoinRequest.user_id.in_(volunteer_ids),
            )
        )
    )
    not_accepted = sorted(set(volunteer_ids) - accepted)
    if not_accepted:
        raise errors.not_accepted_participants(not_accepted)

    # Проєкт заблоковано, тож паралельне підтвердження цих волонтерів чекає; унікальне
    # обмеження в БД лишається останнім захистом
    already = sorted(
        await db_session.scalars(
            select(Attendance.user_id).where(
                Attendance.project_id == project.id, Attendance.user_id.in_(volunteer_ids)
            )
        )
    )
    if already:
        raise errors.attendance_already_confirmed(already)

    await _lock_volunteers(db_session, volunteer_ids)
    totals = await get_confirmed_hours(db_session, volunteer_ids)
    attendances: list[Attendance] = []
    for entry in data.entries:
        hours = project.volunteer_hours if entry.hours is None else entry.hours
        # Як у numeric(5, 2): відповідь не відрізняється від того, що збережено в БД
        hours = hours.quantize(HOURS_PRECISION)
        attendances.append(
            Attendance(
                project_id=project.id,
                user_id=entry.user_id,
                hours=hours,
                confirmed_by=user_id,
            )
        )
        _notify_hours(db_session, project, entry.user_id, hours, corrected=False)
        _notify_level_up(
            db_session, entry.user_id, totals[entry.user_id], totals[entry.user_id] + hours
        )
    db_session.add_all(attendances)

    # Записи, сповіщення про них і level_up зберігаються в одній транзакції
    try:
        await db_session.commit()
    except IntegrityError as error:
        await db_session.rollback()
        if violated_constraint(error) == UNIQUE_ATTENDANCE_CONSTRAINT:
            raise errors.attendance_already_confirmed(sorted(volunteer_ids)) from error
        raise
    return attendances


async def update_attendance(
    db_session: AsyncSession,
    user_id: int,
    project_id: int,
    volunteer_id: int,
    data: AttendanceUpdate,
) -> Attendance:
    """Виправляє години наявного запису; confirmed_at лишається часом першого підтвердження."""
    _, project = await lock_managed_project(
        db_session, user_id, project_id, errors.not_attendance_manager
    )
    _require_finished(project)

    attendance = await db_session.scalar(
        select(Attendance)
        .where(Attendance.project_id == project.id, Attendance.user_id == volunteer_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if attendance is None:
        raise errors.attendance_not_found()
    # Те саме значення, надіслане повторно, зміною не вважається: без сповіщення
    if attendance.hours == data.hours:
        return attendance

    await _lock_volunteers(db_session, [volunteer_id])
    total = (await get_confirmed_hours(db_session, [volunteer_id]))[volunteer_id]
    new_total = total - attendance.hours + data.hours
    attendance.hours = data.hours
    _notify_hours(db_session, project, volunteer_id, data.hours, corrected=True)
    _notify_level_up(db_session, volunteer_id, total, new_total)

    await db_session.commit()
    # updated_at обчислює БД
    await db_session.refresh(attendance)
    return attendance


async def list_project_attendances(
    db_session: AsyncSession, user_id: int, project_id: int, *, limit: int, offset: int
) -> list[tuple[JoinRequest, Attendance | None]]:
    """Схвалені учасники проєкту й підтвердження їхньої участі (None — ще не підтверджено).

    Для організатора, який збирається підтвердити участь; давніші заявки спершу.
    """
    project = await db_session.get(Project, project_id)
    # Чужий проєкт для користувача не існує: так не видно, які id зайняті
    if project is None:
        raise errors.project_not_found()
    membership = await get_user_membership(db_session, user_id, project.organization_id)
    if membership is None:
        raise errors.project_not_found()
    if membership.role not in EDITOR_ROLES:
        raise errors.not_attendance_manager()

    rows = await db_session.execute(
        project_requests()
        .add_columns(Attendance)
        .select_from(JoinRequest)
        .outerjoin(
            Attendance,
            and_(
                Attendance.project_id == JoinRequest.project_id,
                Attendance.user_id == JoinRequest.user_id,
            ),
        )
        .options(joinedload(JoinRequest.user, innerjoin=True))
        .where(
            JoinRequest.project_id == project.id,
            JoinRequest.status == JoinRequestStatusEnum.accepted,
        )
        .order_by(JoinRequest.created_at, JoinRequest.id)
        .limit(limit)
        .offset(offset)
    )
    return [(join_request, attendance) for join_request, attendance in rows]
