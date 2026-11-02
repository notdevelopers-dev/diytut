from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.base import Organization, OrganizationMember


async def get_user_organization_id(session: AsyncSession, user_id: int) -> int | None:
    return await session.scalar(
        select(OrganizationMember.organization_id).where(OrganizationMember.user_id == user_id)
    )


async def get_user_membership(session: AsyncSession, user_id: int) -> OrganizationMember | None:
    """Членство користувача в організації разом із самою організацією."""
    return await session.scalar(
        select(OrganizationMember)
        .options(joinedload(OrganizationMember.organization))
        .where(OrganizationMember.user_id == user_id)
    )


async def is_edrpou_taken(session: AsyncSession, edrpou: str) -> bool:
    found = await session.scalar(select(Organization.id).where(Organization.edrpou == edrpou))
    return found is not None
