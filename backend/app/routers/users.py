from fastapi import APIRouter

from app.auth import CurrentUserId
from app.db import DbSessionDep
from app.schemas.organizations import OrganizationMembership
from app.schemas.users import UserProfileRead, UserUpdate
from app.services.organizations import get_user_memberships
from app.services.users import get_profile, update_profile

router = APIRouter()


@router.get("/me")
async def read_my_profile(db_session: DbSessionDep, user_id: CurrentUserId) -> UserProfileRead:
    return UserProfileRead.model_validate(await get_profile(db_session, user_id))


@router.patch("/me")
async def update_my_profile(
    data: UserUpdate, db_session: DbSessionDep, user_id: CurrentUserId
) -> UserProfileRead:
    return UserProfileRead.model_validate(await update_profile(db_session, user_id, data))


@router.get("/me/organizations")
async def read_my_organizations(
    db_session: DbSessionDep, user_id: CurrentUserId
) -> list[OrganizationMembership]:
    memberships = await get_user_memberships(db_session, user_id)
    return [OrganizationMembership.from_membership(m) for m in memberships]
