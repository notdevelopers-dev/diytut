"""Обкладинка проєкту (R-13): одне фото на проєкт, змінюють власник і адміни організації."""

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import errors, storage
from app.models import (
    NotificationTypeEnum,
    OrganizationMember,
    OrgStatusEnum,
    Project,
    ProjectStatusEnum,
)
from app.notifications import create_notification, project_page_link
from app.services.organizations import EDITOR_ROLES, get_user_membership
from app.services.project_join_requests import lock_project

# Тека для обкладинок у MEDIA_ROOT
COVERS_FOLDER = "projects"
# Обкладинка завершеного чи скасованого проєкту вже нікого не залучить
_PHOTO_STATUSES = frozenset({ProjectStatusEnum.draft, ProjectStatusEnum.published})


async def set_project_photo(
    db_session: AsyncSession, user_id: int, project_id: int, upload: UploadFile
) -> Project:
    """Додає або замінює обкладинку; файл попередньої видаляється."""
    # Права перевіряються ще до обробки зображення: інакше будь-хто з акаунтом міг би
    # навантажувати процесор і пам'ять сервера, надсилаючи фото для чужих і неіснуючих
    # проєктів. Без блокувань, і транзакція одразу завершується: обробка триває до
    # секунди, а з чергою й довше, і весь цей час не варто тримати ні рядки, ні з'єднання з БД
    await _check_photo_project(db_session, user_id, project_id, lock=False, uploading=True)
    await db_session.commit()
    data = await _prepare_image(upload)
    # За час обробки роль чи статус могли змінитися, тож тепер — з блокуванням і заново
    project = await _check_photo_project(db_session, user_id, project_id, lock=True, uploading=True)

    old_key = project.cover_key
    new_key = await storage.save_image(data, COVERS_FOLDER)
    project.cover_key = new_key
    try:
        await db_session.commit()
    except Exception:
        # Файл, на який не посилається жоден проєкт, нікому не потрібен
        await storage.delete(new_key)
        raise
    # Старий файл видаляється лише після збереження: збій лишить зайвий файл, а не биту
    # обкладинку
    if old_key is not None:
        await storage.delete(old_key)
    # updated_at обчислює БД
    await db_session.refresh(project)
    return project


async def delete_project_photo(db_session: AsyncSession, user_id: int, project_id: int) -> Project:
    """Прибирає обкладинку. Проєкт без обкладинки — не помилка: результат той самий."""
    project = await _check_photo_project(db_session, user_id, project_id, lock=True)
    old_key = project.cover_key
    if old_key is None:
        # Змін немає; commit лише знімає блокування
        await db_session.commit()
        return project

    project.cover_key = None
    await db_session.commit()
    await storage.delete(old_key)
    await db_session.refresh(project)
    return project


async def _prepare_image(upload: UploadFile) -> bytes:
    """Обробка зображення з відмовами сховища, перетвореними на помилки API."""
    try:
        return await storage.prepare_image(upload.file)
    except storage.FileTooLarge:
        raise errors.file_too_large(storage.MAX_UPLOAD_BYTES) from None
    except storage.ImageTooLarge:
        raise errors.image_too_large(storage.MAX_IMAGE_PIXELS) from None
    except storage.ImageTooSmall:
        raise errors.image_too_small(storage.MIN_IMAGE_WIDTH, storage.MIN_IMAGE_HEIGHT) from None
    except storage.UnsupportedImage:
        raise errors.unsupported_image() from None
    except storage.StorageFull:
        raise errors.storage_full() from None


async def remove_photo_as_admin(db_session: AsyncSession, project_id: int, reason: str) -> Project:
    """Адміністратор платформи прибирає обкладинку, наприклад за скаргою.

    Діє для будь-якого статусу проєкту й організації. Власник і адміни організації
    отримують сповіщення з причиною. Проєкт без обкладинки — не помилка, і тоді
    сповіщення немає: прибирати нічого.
    """
    # Блокування: заміна фото організацією в цей момент виконається до або після, а не разом
    project = await lock_project(db_session, project_id)
    if project is None:
        raise errors.project_not_found()
    old_key = project.cover_key
    if old_key is None:
        await db_session.commit()
        return project

    project.cover_key = None
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
            NotificationTypeEnum.project_photo_removed,
            "Фото проєкту видалено",
            f"Адміністратор платформи видалив обкладинку проєкту «{project.title}». "
            f"Причина: {reason}",
            link=project_page_link(project.id),
        )
    # Зміна й сповіщення про неї зберігаються разом
    await db_session.commit()
    await storage.delete(old_key)
    await db_session.refresh(project)
    return project


async def _check_photo_project(
    db_session: AsyncSession,
    user_id: int,
    project_id: int,
    *,
    lock: bool,
    uploading: bool = False,
) -> Project:
    """Проєкт, обкладинку якого користувач може змінити.

    З lock=True членство, організація й проєкт блокуються до кінця транзакції: роль, статус
    організації й статус проєкту не зміняться між перевіркою й записом, а дві заміни фото
    не виконаються одночасно й не видалять файл одна одної.
    """
    project = await db_session.get(Project, project_id)
    if project is None:
        raise errors.project_not_found()
    # Спершу членство, потім проєкт — у тому ж порядку, що й публікація та розгляд заявок,
    # тож паралельні запити не заблокують одне одного
    membership = await get_user_membership(db_session, user_id, project.organization_id, lock=lock)
    # Для користувача поза організацією керування проєктом не існує
    if membership is None:
        raise errors.project_not_found()
    if lock:
        project = await lock_project(db_session, project_id)
        if project is None:
            raise errors.project_not_found()

    if membership.role not in EDITOR_ROLES:
        raise errors.not_project_editor()
    if membership.organization.status == OrgStatusEnum.blocked:
        raise errors.organization_blocked()
    # Нові фото — лише від схваленої організації: перевірку ЄДРПОУ проходять до того, як
    # займати місце на диску. Видаляти можна й без цього: місця це не займає, а фото є
    # лише в організацій, які вже були схвалені
    if uploading and membership.organization.status != OrgStatusEnum.approved:
        raise errors.photo_requires_approval()
    if project.status not in _PHOTO_STATUSES:
        raise errors.project_not_editable()
    return project
