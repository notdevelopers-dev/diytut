from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app import errors
from app.auth import CurrentUserId
from app.db import DbSessionDep
from app.models import (
    Organization,
    OrganizationMember,
    OrgStatusEnum,
    Project,
    ProjectStatusEnum,
)
from app.schemas.organizations import (
    OrganizationCreate,
    OrganizationDetailRead,
    OrganizationListItem,
    OrganizationMemberItem,
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
    query = select(Organization).where(Organization.status == OrgStatusEnum.approved)
    if city_id is not None:
        query = query.where(Organization.city_id == city_id)

    query = (
        query.order_by(Organization.created_at.desc(), Organization.id.desc())
        .limit(limit)
        .offset(offset)
    )
    organizations = await db_session.scalars(query)
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


@router.get("/{id}")
async def get_organization(
    id: int,
    db_session: DbSessionDep,
) -> OrganizationDetailRead:
    query = (
        select(Organization)
        .options(selectinload(Organization.members).joinedload(OrganizationMember.user))
        .where(
            Organization.id == id,
            Organization.status == OrgStatusEnum.approved,
        )
    )
    organization = await db_session.scalar(query)
    if organization is None:
        raise errors.organization_not_found()

    active_projects_query = (
        select(Project)
        .where(
            Project.organization_id == id,
            Project.status == ProjectStatusEnum.published,
        )
        .order_by(Project.created_at.desc(), Project.id.desc())
    )
    active_projects = await db_session.scalars(active_projects_query)

    base = OrganizationRead.model_validate(organization)
    return OrganizationDetailRead(
        **base.model_dump(),
        members=[OrganizationMemberItem.model_validate(m) for m in organization.members],
        projects=[ProjectListItem.model_validate(p) for p in active_projects],
    )
