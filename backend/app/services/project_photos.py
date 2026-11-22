"""Обкладинка проєкту (R-13): одне фото на проєкт, змінюють власник і адміни організації."""

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app import errors, storage
from app.models import OrgStatusEnum, Project, ProjectStatusEnum
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
    # Зображення обробляється до блокувань: це може тривати до секунди, і весь цей час
    # рядки організації та проєкту були б заблоковані для інших дій
    data = await storage.prepare_image(upload)
    project = await _lock_photo_project(db_session, user_id, project_id)

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
    project = await _lock_photo_project(db_session, user_id, project_id)
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


async def _lock_photo_project(db_session: AsyncSession, user_id: int, project_id: int) -> Project:
    """Проєкт, обкладинку якого користувач може змінити.

    Членство, організація й проєкт блокуються до кінця транзакції: роль, статус організації
    й статус проєкту не зміняться між перевіркою й записом, а дві заміни фото не
    виконаються одночасно й не видалять файл одна одної.
    """
    project = await db_session.get(Project, project_id)
    if project is None:
        raise errors.project_not_found()
    # Спершу членство, потім проєкт — у тому ж порядку, що й публікація та розгляд заявок,
    # тож паралельні запити не заблокують одне одного
    membership = await get_user_membership(db_session, user_id, project.organization_id, lock=True)
    # Для користувача поза організацією керування проєктом не існує
    if membership is None:
        raise errors.project_not_found()
    project = await lock_project(db_session, project_id)
    if project is None:
        raise errors.project_not_found()

    if membership.role not in EDITOR_ROLES:
        raise errors.not_project_editor()
    if membership.organization.status == OrgStatusEnum.blocked:
        raise errors.organization_blocked()
    if project.status not in _PHOTO_STATUSES:
        raise errors.project_not_editable()
    return project
