from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app import errors
from app.models import NotificationTypeEnum, Organization, OrgStatusEnum, RoleEnum, User
from app.notifications import (
    create_notification,
    organization_dashboard_link,
    organization_edit_link,
)
from app.schemas.admin import OrganizationReview
from app.services.projects import _escape_like


async def require_platform_admin(db_session: AsyncSession, user_id: int) -> int:
    # Роль читається з БД на кожен запит: зняті права діють одразу, а не після виходу
    role = await db_session.scalar(select(User.platform_role).where(User.id == user_id))
    if role is None:
        raise errors.not_authenticated()
    if role != RoleEnum.admin:
        raise errors.not_platform_admin()
    return user_id


def _with_details(query):
    return query.options(
        joinedload(Organization.city, innerjoin=True),
        joinedload(Organization.creator, innerjoin=True),
    )


async def list_organization_requests(
    db_session: AsyncSession,
    status: OrgStatusEnum | None,
    search: str | None,
    limit: int,
    offset: int,
) -> tuple[list[Organization], int]:
    filters = [Organization.status == status] if status is not None else []
    if search and search.strip():
        # Частина назви без урахування регістру або частина ЄДРПОУ
        pattern = f"%{_escape_like(search.strip())}%"
        filters.append(or_(Organization.name.ilike(pattern), Organization.edrpou.like(pattern)))
    total = await db_session.scalar(select(func.count()).select_from(Organization).where(*filters))
    # Найстаріші заявки першими: черга розглядається в порядку надходження
    query = (
        _with_details(select(Organization))
        .where(*filters)
        .order_by(Organization.created_at, Organization.id)
        .limit(limit)
        .offset(offset)
    )
    organizations = await db_session.scalars(query)
    return list(organizations), total


async def get_organization_request(db_session: AsyncSession, organization_id: int) -> Organization:
    organization = await db_session.scalar(
        _with_details(select(Organization)).where(Organization.id == organization_id)
    )
    if organization is None:
        raise errors.organization_not_found()
    return organization


def _notify_creator(db_session: AsyncSession, organization: Organization) -> None:
    if organization.status == OrgStatusEnum.approved:
        type_ = NotificationTypeEnum.organization_approved
        title = "Організацію схвалено"
        link = organization_dashboard_link(organization.id)
        message = f"Організацію «{organization.name}» перевірено: тепер можна публікувати проєкти."
    else:
        type_ = NotificationTypeEnum.organization_rejected
        title = "Організацію відхилено"
        # Організація має виправити дані, тож одразу на редагування
        link = organization_edit_link(organization.id)
        # Причина відхилення обов'язкова (OrganizationReview)
        message = (
            f"Організацію «{organization.name}» відхилено. Причина: {organization.review_comment}"
        )
    create_notification(db_session, organization.created_by, type_, title, message, link=link)


async def review_organization(
    db_session: AsyncSession, admin_id: int, organization_id: int, review: OrganizationReview
) -> Organization:
    # Рядок блокується, тож два адміністратори не розглянуть ту саму заявку одночасно
    organization = await db_session.scalar(
        select(Organization)
        .where(Organization.id == organization_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if organization is None:
        raise errors.organization_not_found()
    if organization.status != OrgStatusEnum.pending:
        raise errors.organization_already_reviewed()

    organization.status = review.decision
    organization.reviewed_by = admin_id
    organization.reviewed_at = datetime.now(UTC)
    organization.review_comment = review.comment
    _notify_creator(db_session, organization)
    # Рішення й сповіщення про нього зберігаються разом
    await db_session.commit()
    return await get_organization_request(db_session, organization_id)
