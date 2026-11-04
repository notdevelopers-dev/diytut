from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.base import Organization, OrganizationMember


async def get_user_organization_id(session: AsyncSession, user_id: int) -> int | None:
    return await session.scalar(
        select(OrganizationMember.organization_id).where(OrganizationMember.user_id == user_id)
    )


async def get_user_membership(
    session: AsyncSession, user_id: int, *, lock: bool = False
) -> OrganizationMember | None:
    """Членство користувача в організації разом із самою організацією.

    З lock=True обидва рядки блокуються до кінця транзакції: роль і статус організації,
    перевірені перед зміною, не зміняться, доки зміну не збережено.
    """
    query = (
        select(OrganizationMember)
        .options(joinedload(OrganizationMember.organization, innerjoin=True))
        .where(OrganizationMember.user_id == user_id)
    )
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    return await session.scalar(query)


async def get_user_memberships(session: AsyncSession, user_id: int) -> list[OrganizationMember]:
    """Усі членства користувача в організаціях для перемикання акаунтів."""
    query = (
        select(OrganizationMember)
        .options(joinedload(OrganizationMember.organization, innerjoin=True))
        .where(OrganizationMember.user_id == user_id)
    )
    result = await session.scalars(query)
    return list(result.all())


async def is_edrpou_taken(session: AsyncSession, edrpou: str) -> bool:
    found = await session.scalar(select(Organization.id).where(Organization.edrpou == edrpou))
    return found is not None
