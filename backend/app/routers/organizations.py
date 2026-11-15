from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, status

from app.auth import CurrentUserId
from app.db import DbSessionDep
from app.models import OrganizationMember
from app.schemas.join_requests import (
    JoinRequestCreate,
    JoinRequestRead,
    OrganizationJoinRequestRead,
)
from app.schemas.organizations import (
    OrganizationCreate,
    OrganizationDetailRead,
    OrganizationListItem,
    OrganizationProfile,
    OrganizationRead,
    OrganizationUpdate,
)
from app.schemas.projects import ProjectListItem
from app.schemas.users import MAX_BIGINT, MAX_INT32
from app.services import join_requests as join_requests_service
from app.services import organizations as service

router = APIRouter()

OrganizationId = Annotated[int, Path(gt=0, le=MAX_BIGINT)]


# Яку з організацій користувача стосується запит до /me; без параметра — організація
# за замовчуванням
OwnOrganizationId = Annotated[int | None, Query(gt=0, le=MAX_BIGINT)]


async def get_current_membership(
    db_session: DbSessionDep, user_id: CurrentUserId, organization_id: OwnOrganizationId = None
) -> OrganizationMember:
    return await service.require_membership(db_session, user_id, organization_id)


async def get_editor_membership(
    db_session: DbSessionDep, user_id: CurrentUserId, organization_id: OwnOrganizationId = None
) -> OrganizationMember:
    return await service.require_editor_membership(db_session, user_id, organization_id)


# Читати профіль може будь-який учасник, змінювати — лише owner чи admin
CurrentMembership = Annotated[OrganizationMember, Depends(get_current_membership)]
EditorMembership = Annotated[OrganizationMember, Depends(get_editor_membership)]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_organization(
    data: OrganizationCreate, db_session: DbSessionDep, user_id: CurrentUserId
) -> OrganizationRead:
    organization = await service.create_organization(db_session, user_id, data)
    return OrganizationRead.model_validate(organization)


@router.get("")
async def list_organizations(
    db_session: DbSessionDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0, le=MAX_INT32)] = 0,
    city_id: Annotated[int | None, Query(gt=0, le=MAX_INT32)] = None,
) -> list[OrganizationListItem]:
    organizations = await service.list_approved_organizations(
        db_session, limit=limit, offset=offset, city_id=city_id
    )
    return [OrganizationListItem.model_validate(org) for org in organizations]


@router.get("/me")
async def read_my_organization(membership: CurrentMembership) -> OrganizationProfile:
    return OrganizationProfile.from_membership(membership)


@router.patch("/me")
async def update_my_organization(
    data: OrganizationUpdate, db_session: DbSessionDep, membership: EditorMembership
) -> OrganizationProfile:
    await service.update_organization(db_session, membership, data)
    return OrganizationProfile.from_membership(membership)


@router.get("/me/join-requests")
async def list_my_organization_join_requests(
    db_session: DbSessionDep,
    user_id: CurrentUserId,
    organization_id: OwnOrganizationId = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0, le=MAX_INT32)] = 0,
) -> list[OrganizationJoinRequestRead]:
    membership = await join_requests_service.require_request_reviewer(
        db_session, user_id, organization_id
    )
    join_requests = await join_requests_service.list_pending_requests(
        db_session, membership.organization_id, limit=limit, offset=offset
    )
    return [OrganizationJoinRequestRead.model_validate(request) for request in join_requests]


@router.get("/{organization_id}")
async def get_organization(
    organization_id: OrganizationId, db_session: DbSessionDep
) -> OrganizationDetailRead:
    organization = await service.get_approved_organization(db_session, organization_id)
    projects = await service.list_published_projects(db_session, organization_id)
    return OrganizationDetailRead(
        **OrganizationRead.model_validate(organization).model_dump(),
        projects=[ProjectListItem.model_validate(project) for project in projects],
    )


@router.post("/{organization_id}/join-requests", status_code=status.HTTP_201_CREATED)
async def create_join_request(
    organization_id: OrganizationId,
    data: JoinRequestCreate,
    db_session: DbSessionDep,
    user_id: CurrentUserId,
) -> JoinRequestRead:
    join_request = await join_requests_service.create_join_request(
        db_session, user_id, organization_id, data
    )
    return JoinRequestRead.model_validate(join_request)


@router.get("/{organization_id}/my-request-status")
async def read_my_join_request_status(
    organization_id: OrganizationId,
    db_session: DbSessionDep,
    user_id: CurrentUserId,
) -> JoinRequestRead:
    join_request = await join_requests_service.get_my_request(db_session, user_id, organization_id)
    return JoinRequestRead.model_validate(join_request)
