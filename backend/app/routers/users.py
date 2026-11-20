from typing import Annotated

from fastapi import APIRouter, Query

from app.auth import CurrentUserId
from app.db import DbSessionDep
from app.schemas.join_requests import MyProjectJoinRequestRead
from app.schemas.organizations import OrganizationMembership
from app.schemas.projects import SHOW_DETAILS
from app.schemas.users import MAX_INT32, UserProfileRead, UserUpdate
from app.services.organizations import get_user_memberships
from app.services.project_join_requests import list_my_project_requests
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


@router.get("/me/project-requests")
async def read_my_project_requests(
    db_session: DbSessionDep,
    user_id: CurrentUserId,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0, le=MAX_INT32)] = 0,
) -> list[MyProjectJoinRequestRead]:
    join_requests, visible = await list_my_project_requests(
        db_session, user_id, limit=limit, offset=offset
    )
    # Контекст доходить до вкладеного project: точний час — лише для доступних проєктів
    return [
        MyProjectJoinRequestRead.model_validate(
            request, context={SHOW_DETAILS: request.project_id in visible}
        )
        for request in join_requests
    ]
