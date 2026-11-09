from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.auth import CurrentUserId
from app.db import DbSessionDep
from app.models import OrganizationMember
from app.schemas.organizations import (
    OrganizationCreate,
    OrganizationProfile,
    OrganizationRead,
    OrganizationUpdate,
)
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
