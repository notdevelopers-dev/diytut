from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.auth import CurrentUserId
from app.db import DbSessionDep
from app.models import OrganizationMember
from app.schemas.organizations import (
    OrganizationCreate,
    OrganizationDetailRead,
    OrganizationListItem,
    OrganizationProfile,
    OrganizationRead,
    OrganizationUpdate,
)
from app.schemas.projects import ProjectListItem
from app.schemas.users import MAX_INT32
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


@router.get("/{organization_id}")
async def get_organization(
    organization_id: int, db_session: DbSessionDep
) -> OrganizationDetailRead:
    organization = await service.get_approved_organization(db_session, organization_id)
    projects = await service.list_published_projects(db_session, organization_id)
    return OrganizationDetailRead(
        **OrganizationRead.model_validate(organization).model_dump(),
        projects=[ProjectListItem.model_validate(project) for project in projects],
    )
