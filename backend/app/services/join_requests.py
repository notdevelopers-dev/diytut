from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app import errors
from app.db import violated_constraint
from app.models import (
    JoinRequest,
    JoinRequestStatusEnum,
    JoinRequestTargetEnum,
    NotificationTypeEnum,
    Organization,
    OrganizationMember,
    OrgMemberRoleEnum,
    User,
)
from app.notifications import ORGANIZATION_JOIN_REQUESTS_LINK, create_notification
from app.schemas.join_requests import JoinRequestCreate
from app.services.organizations import (
    EDITOR_ROLES,
    get_approved_organization,
    get_user_membership,
    require_membership,
)

PENDING_ORGANIZATION_REQUEST_INDEX = "uq_join_requests_pending_user_organization"


def _organization_requests():
    return select(JoinRequest).where(JoinRequest.target == JoinRequestTargetEnum.organization)


async def _has_pending_request(
    db_session: AsyncSession, user_id: int, organization_id: int
) -> bool:
    found = await db_session.scalar(
        _organization_requests()
        .with_only_columns(JoinRequest.id)
        .where(
            JoinRequest.user_id == user_id,
            JoinRequest.organization_id == organization_id,
            JoinRequest.status == JoinRequestStatusEnum.pending,
        )
    )
    return found is not None


async def _notify_owners(db_session: AsyncSession, organization: Organization) -> None:
    owner_ids = await db_session.scalars(
        select(OrganizationMember.user_id).where(
            OrganizationMember.organization_id == organization.id,
            OrganizationMember.role == OrgMemberRoleEnum.owner,
        )
    )
    for owner_id in owner_ids:
        create_notification(
            db_session,
            owner_id,
            NotificationTypeEnum.join_request_received,
            "Нова заявка на вступ",
            f"До організації «{organization.name}» надійшла нова заявка на вступ.",
            link=ORGANIZATION_JOIN_REQUESTS_LINK,
        )


async def create_join_request(
    db_session: AsyncSession, user_id: int, organization_id: int, data: JoinRequestCreate
) -> JoinRequest:
    # Токен сесії переживає видалення акаунта: без перевірки впали б з 500 на ключі user_id
    if await db_session.get(User, user_id) is None:
        raise errors.not_authenticated()
    # Несхвалена організація (чернетка, відхилена, заблокована) для волонтера не існує (R-07)
    organization = await get_approved_organization(db_session, organization_id)

    membership = await get_user_membership(db_session, user_id)
    if membership is not None:
        if membership.organization_id == organization.id:
            raise errors.already_organization_member()
        # Користувач може належати лише до однієї організації (organization_members.user_id
        # унікальний), тож таку заявку неможливо було б прийняти
        raise errors.already_has_organization()

    if await _has_pending_request(db_session, user_id, organization.id):
        raise errors.join_request_already_pending()

    join_request = JoinRequest(
        user_id=user_id,
        organization_id=organization.id,
        target=JoinRequestTargetEnum.organization,
        message=data.message,
    )
    db_session.add(join_request)
    await _notify_owners(db_session, organization)
    # Заявка й сповіщення про неї зберігаються разом
    try:
        await db_session.commit()
    except IntegrityError as error:
        # Паралельний запит встиг створити таку саму заявку
        await db_session.rollback()
        if violated_constraint(error) == PENDING_ORGANIZATION_REQUEST_INDEX:
            raise errors.join_request_already_pending() from error
        raise

    # status і created_at заповнює БД
    await db_session.refresh(join_request)
    return join_request


async def get_my_request(
    db_session: AsyncSession, user_id: int, organization_id: int
) -> JoinRequest:
    """Остання заявка користувача на вступ до організації, хоч би яким був її статус."""
    join_request = await db_session.scalar(
        _organization_requests()
        .where(JoinRequest.user_id == user_id, JoinRequest.organization_id == organization_id)
        .order_by(JoinRequest.created_at.desc(), JoinRequest.id.desc())
        .limit(1)
    )
    if join_request is None:
        raise errors.join_request_not_found()
    return join_request


async def require_request_reviewer(db_session: AsyncSession, user_id: int) -> OrganizationMember:
    """Членство, з яким можна переглядати заявки на вступ до організації."""
    membership = await require_membership(db_session, user_id)
    if membership.role not in EDITOR_ROLES:
        raise errors.not_join_request_reviewer()
    return membership


async def list_pending_requests(
    db_session: AsyncSession, organization_id: int, *, limit: int, offset: int
) -> list[JoinRequest]:
    """Заявки на розгляді для кабінету організації: давніші спершу, щоб ніхто не чекав вічно."""
    query = (
        _organization_requests()
        .options(joinedload(JoinRequest.user, innerjoin=True))
        .where(
            JoinRequest.organization_id == organization_id,
            JoinRequest.status == JoinRequestStatusEnum.pending,
        )
        .order_by(JoinRequest.created_at, JoinRequest.id)
        .limit(limit)
        .offset(offset)
    )
    return list(await db_session.scalars(query))
