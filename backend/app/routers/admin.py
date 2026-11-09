from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query

from app.auth import CurrentUserId
from app.db import DbSessionDep
from app.models import OrgStatusEnum
from app.schemas.admin import (
    DailyLogins,
    LoginStats,
    OrganizationRequest,
    OrganizationRequestPage,
    OrganizationReview,
)
from app.schemas.users import MAX_INT32
from app.services import admin as service
from app.services import logins as logins_service


async def get_current_admin_id(db_session: DbSessionDep, user_id: CurrentUserId) -> int:
    return await service.require_platform_admin(db_session, user_id)


CurrentAdminId = Annotated[int, Depends(get_current_admin_id)]
OrganizationId = Annotated[int, Path(gt=0, le=2**63 - 1)]

# Кожен ендпоінт адмін-панелі доступний лише адміністраторам платформи
router = APIRouter(dependencies=[Depends(get_current_admin_id)])


@router.get("/organizations")
async def list_organization_requests(
    db_session: DbSessionDep,
    status: OrgStatusEnum | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0, le=MAX_INT32)] = 0,
) -> OrganizationRequestPage:
    organizations, total = await service.list_organization_requests(
        db_session, status, limit, offset
    )
    return OrganizationRequestPage(
        items=[OrganizationRequest.model_validate(o) for o in organizations], total=total
    )


@router.get("/organizations/{organization_id}")
async def read_organization_request(
    db_session: DbSessionDep, organization_id: OrganizationId
) -> OrganizationRequest:
    organization = await service.get_organization_request(db_session, organization_id)
    return OrganizationRequest.model_validate(organization)


@router.post("/organizations/{organization_id}/review")
async def review_organization_request(
    review: OrganizationReview,
    db_session: DbSessionDep,
    admin_id: CurrentAdminId,
    organization_id: OrganizationId,
) -> OrganizationRequest:
    organization = await service.review_organization(db_session, admin_id, organization_id, review)
    return OrganizationRequest.model_validate(organization)


@router.get("/stats/logins")
async def login_stats(
    db_session: DbSessionDep, date_from: date | None = None, date_to: date | None = None
) -> LoginStats:
    date_from, date_to = await logins_service.resolve_period(db_session, date_from, date_to)
    total, unique_users, by_day = await logins_service.get_login_stats(
        db_session, date_from, date_to
    )
    days = []
    for shift in range((date_to - date_from).days + 1):
        day = date_from + timedelta(days=shift)
        logins, users = by_day.get(day, (0, 0))
        days.append(DailyLogins(date=day, logins=logins, unique_users=users))
    return LoginStats(
        date_from=date_from,
        date_to=date_to,
        timezone=logins_service.STATS_TIMEZONE,
        total_logins=total,
        unique_users=unique_users,
        days=days,
    )
