from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import Organization, OrganizationMember


async def get_user_organization_id(session: AsyncSession, user_id: int) -> int | None:
    return await session.scalar(
        select(OrganizationMember.organization_id).where(OrganizationMember.user_id == user_id)
    )


async def is_edrpou_taken(session: AsyncSession, edrpou: str) -> bool:
    found = await session.scalar(select(Organization.id).where(Organization.edrpou == edrpou))
    return found is not None
