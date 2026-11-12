from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.auth import CurrentUserId, OptionalUserId
from app.db import DbSessionDep
from app.models import OrganizationMember
from app.schemas.organizations import (
    JoinRequestCreate,
    JoinRequestRead,
    JoinRequestStatusResponse,
    OrganizationCreate,
    OrganizationProfile,
    OrganizationPublicView,
    OrganizationRead,
    OrganizationUpdate,
)
from app.schemas.projects import ProjectListItem
from app.services import organizations as service

router = APIRouter()


async def get_current_membership(
    db_session: DbSessionDep, user_id: CurrentUserId
) -> OrganizationMember:
    return await service.require_membership(db_session, user_id)


async def get_editor_membership(
    db_session: DbSessionDep, user_id: CurrentUserId
) -> OrganizationMember:
    return await service.require_editor_membership(db_session, user_id)


# Читати профіль може будь-який учасник, змінювати — лише owner чи admin
CurrentMembership = Annotated[OrganizationMember, Depends(get_current_membership)]
EditorMembership = Annotated[OrganizationMember, Depends(get_editor_membership)]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_organization(
    data: OrganizationCreate, db_session: DbSessionDep, user_id: CurrentUserId
) -> OrganizationRead:
    organization = await service.create_organization(db_session, user_id, data)
    return OrganizationRead.model_validate(organization)


@router.get("/me")
async def read_my_organization(membership: CurrentMembership) -> OrganizationProfile:
    return OrganizationProfile.from_membership(membership)


@router.patch("/me")
async def update_my_organization(
    data: OrganizationUpdate, db_session: DbSessionDep, membership: EditorMembership
) -> OrganizationProfile:
    await service.update_organization(db_session, membership, data)
    return OrganizationProfile.from_membership(membership)


@router.get("/{organization_id}")
async def read_organization(
    organization_id: int,
    db_session: DbSessionDep,
    user_id: OptionalUserId,
) -> OrganizationPublicView:
    data = await service.get_organization_view(db_session, organization_id, user_id)
    return OrganizationPublicView(**data)


@router.get("/{organization_id}/projects")
async def read_organization_projects(
    organization_id: int,
    db_session: DbSessionDep,
) -> list[ProjectListItem]:
    projects = await service.get_organization_projects(db_session, organization_id)
    return [ProjectListItem.model_validate(p) for p in projects]


@router.post(
    "/{organization_id}/join-requests",
    status_code=status.HTTP_201_CREATED,
)
async def submit_join_request(
    organization_id: int,
    data: JoinRequestCreate,
    db_session: DbSessionDep,
    user_id: CurrentUserId,
) -> JoinRequestRead:
    join_request = await service.create_join_request(
        db_session, user_id, organization_id, data
    )
    return JoinRequestRead.model_validate(join_request)


@router.get("/{organization_id}/join-requests/me")
async def get_my_join_request(
    organization_id: int,
    db_session: DbSessionDep,
    user_id: CurrentUserId,
) -> JoinRequestStatusResponse:
    join_request = await service.get_my_join_request(
        db_session, user_id, organization_id
    )
    if join_request is None:
        return JoinRequestStatusResponse(status=None)
    return JoinRequestStatusResponse(
        status=join_request.status,
        id=join_request.id,
        created_at=join_request.created_at,
    )
