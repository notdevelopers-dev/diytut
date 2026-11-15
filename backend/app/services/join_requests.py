from datetime import UTC, datetime

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
    OrgStatusEnum,
    User,
)
from app.notifications import (
    create_notification,
    organization_join_requests_link,
    organization_page_link,
)
from app.schemas.join_requests import JoinRequestCreate, JoinRequestReview
from app.services.organizations import (
    EDITOR_ROLES,
    get_approved_organization,
    get_user_membership,
    require_membership,
)

PENDING_ORGANIZATION_REQUEST_INDEX = "uq_join_requests_pending_user_organization"
# Обмеження, яке порушує вставка учасника, що вже належить до цієї організації
MEMBERSHIP_PRIMARY_KEY = "pk_organization_members"


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
            link=organization_join_requests_link(organization.id),
        )


async def create_join_request(
    db_session: AsyncSession, user_id: int, organization_id: int, data: JoinRequestCreate
) -> JoinRequest:
    # Токен сесії переживає видалення акаунта: без перевірки впали б з 500 на ключі user_id
    if await db_session.get(User, user_id) is None:
        raise errors.not_authenticated()
    # Несхвалена організація (чернетка, відхилена, заблокована) для волонтера не існує (R-07)
    organization = await get_approved_organization(db_session, organization_id)

    # Членство в інших організаціях не заважає: користувач може належати до кількох
    if await get_user_membership(db_session, user_id, organization.id) is not None:
        raise errors.already_organization_member()

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


async def require_request_reviewer(
    db_session: AsyncSession, user_id: int, organization_id: int | None = None
) -> OrganizationMember:
    """Членство, з яким можна переглядати заявки на вступ до організації.

    Без organization_id — в організації користувача за замовчуванням.
    """
    membership = await require_membership(db_session, user_id, organization_id)
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


async def _lock_join_request(db_session: AsyncSession, join_request_id: int) -> JoinRequest | None:
    # Блокування: дві паралельні відповіді на одну заявку виконуються по черзі, і друга
    # побачить, що заявку вже розглянуто
    return await db_session.scalar(
        select(JoinRequest)
        .options(joinedload(JoinRequest.organization, innerjoin=True))
        .where(JoinRequest.id == join_request_id)
        .with_for_update(of=JoinRequest)
        .execution_options(populate_existing=True)
    )


def _notify_applicant(db_session: AsyncSession, join_request: JoinRequest) -> None:
    name = join_request.organization.name
    if join_request.status == JoinRequestStatusEnum.accepted:
        type_ = NotificationTypeEnum.join_request_accepted
        title = "Заявку прийнято"
        message = f"Організація «{name}» прийняла вашу заявку на вступ."
    else:
        type_ = NotificationTypeEnum.join_request_rejected
        title = "Заявку відхилено"
        message = f"Організація «{name}» відхилила вашу заявку на вступ."
    create_notification(
        db_session,
        join_request.user_id,
        type_,
        title,
        message,
        link=organization_page_link(join_request.organization_id),
    )


async def review_join_request(
    db_session: AsyncSession, user_id: int, join_request_id: int, data: JoinRequestReview
) -> JoinRequest:
    join_request = await _lock_join_request(db_session, join_request_id)
    if join_request is None:
        raise errors.join_request_not_found()
    # Членство саме в організації заявки, а не в організації за замовчуванням: у
    # користувача їх може бути кілька. Блокування: роль і статус організації не
    # зміняться до кінця транзакції
    membership = await get_user_membership(
        db_session, user_id, join_request.organization_id, lock=True
    )
    # Чужі заявки для користувача не існують: так не видно, які id зайняті
    if membership is None:
        raise errors.join_request_not_found()
    if membership.role not in EDITOR_ROLES:
        raise errors.not_join_request_reviewer()
    if membership.organization.status == OrgStatusEnum.blocked:
        raise errors.organization_blocked()
    # Заявки на проєкти розглядаються з перевіркою кількості місць (R-24), тут лише вступ
    if join_request.target != JoinRequestTargetEnum.organization:
        raise errors.project_join_request_not_supported()
    if join_request.status != JoinRequestStatusEnum.pending:
        raise errors.join_request_already_reviewed()

    if data.status == JoinRequestStatusEnum.accepted:
        # Членство в інших організаціях не заважає; у цій волонтер міг з'явитися за час
        # розгляду заявки
        membership_here = await get_user_membership(
            db_session, join_request.user_id, join_request.organization_id
        )
        if membership_here is not None:
            raise errors.applicant_already_member()
        db_session.add(
            OrganizationMember(
                organization_id=join_request.organization_id,
                user_id=join_request.user_id,
                role=OrgMemberRoleEnum.member,
            )
        )

    join_request.status = data.status
    join_request.reviewed_by = user_id
    join_request.reviewed_at = datetime.now(UTC)
    _notify_applicant(db_session, join_request)

    # Статус заявки, новий учасник і сповіщення зберігаються в одній транзакції
    try:
        await db_session.commit()
    except IntegrityError as error:
        # Паралельний запит встиг додати волонтера до цієї організації
        await db_session.rollback()
        if violated_constraint(error) == MEMBERSHIP_PRIMARY_KEY:
            raise errors.applicant_already_member() from error
        raise

    # updated_at обчислює БД
    await db_session.refresh(join_request)
    return join_request
