"""Хто бачить точні час і місце події (R-22).

Окремий модуль, бо потрібен і проєктам, і заявкам на них, а ті вже імпортують одне одного.
"""

from collections.abc import Iterable

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    JoinRequest,
    JoinRequestStatusEnum,
    JoinRequestTargetEnum,
    OrganizationMember,
    Project,
)


async def projects_with_details(
    db_session: AsyncSession, user_id: int | None, projects: Iterable[Project]
) -> set[int]:
    """id проєктів, точні час і місце яких бачить користувач.

    Бачать учасники організації проєкту з будь-якою роллю й волонтери зі схваленою заявкою
    на нього. Гостю й без проєктів запиту немає, інакше один запит на весь список.
    """
    project_ids = {project.id for project in projects}
    if user_id is None or not project_ids:
        return set()
    member_of = select(OrganizationMember.organization_id).where(
        OrganizationMember.user_id == user_id
    )
    accepted_for = select(JoinRequest.project_id).where(
        JoinRequest.user_id == user_id,
        JoinRequest.target == JoinRequestTargetEnum.project,
        JoinRequest.status == JoinRequestStatusEnum.accepted,
    )
    rows = await db_session.scalars(
        select(Project.id).where(
            Project.id.in_(project_ids),
            or_(Project.organization_id.in_(member_of), Project.id.in_(accepted_for)),
        )
    )
    return set(rows)
