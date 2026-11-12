from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app import errors
from app.db import violated_constraint
from app.models import (
    JoinRequest,
    JoinRequestStatusEnum,
    JoinRequestTargetEnum,
    Notification,
    NotificationTypeEnum,
    Organization,
    OrganizationMember,
    OrgMemberRoleEnum,
    OrgStatusEnum,
    Project,
    ProjectStatusEnum,
    User,
)
from app.schemas.organizations import (
    JoinRequestCreate,
    OrganizationCreate,
    OrganizationUpdate,
)
from app.services.cities import ensure_city_exists

# Ролі, яким дозволено змінювати профіль організації
EDITOR_ROLES = frozenset({OrgMemberRoleEnum.owner, OrgMemberRoleEnum.admin})


async def get_user_organization_id(db_session: AsyncSession, user_id: int) -> int | None:
    return await db_session.scalar(
        select(OrganizationMember.organization_id).where(OrganizationMember.user_id == user_id)
    )


async def get_user_membership(
    db_session: AsyncSession, user_id: int, *, lock: bool = False
) -> OrganizationMember | None:
    """Членство користувача в організації разом із самою організацією.

    З lock=True обидва рядки блокуються до кінця транзакції: роль і статус організації,
    перевірені перед зміною, не зміняться, доки зміну не збережено.
    """
    query = (
        select(OrganizationMember)
        .options(joinedload(OrganizationMember.organization, innerjoin=True))
        .where(OrganizationMember.user_id == user_id)
    )
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    return await db_session.scalar(query)


async def get_user_memberships(db_session: AsyncSession, user_id: int) -> list[OrganizationMember]:
    """Усі членства користувача в організаціях для перемикання акаунтів."""
    query = (
        select(OrganizationMember)
        .options(joinedload(OrganizationMember.organization, innerjoin=True))
        .where(OrganizationMember.user_id == user_id)
    )
    result = await db_session.scalars(query)
    return list(result.all())


async def is_edrpou_taken(db_session: AsyncSession, edrpou: str) -> bool:
    found = await db_session.scalar(select(Organization.id).where(Organization.edrpou == edrpou))
    return found is not None


async def require_membership(db_session: AsyncSession, user_id: int) -> OrganizationMember:
    membership = await get_user_membership(db_session, user_id)
    if membership is None:
        raise errors.no_organization()
    return membership


async def require_editor_membership(db_session: AsyncSession, user_id: int) -> OrganizationMember:
    """Членство, з яким можна змінювати профіль організації; заблоковане до кінця запиту."""
    membership = await get_user_membership(db_session, user_id, lock=True)
    if membership is None:
        raise errors.no_organization()
    if membership.role not in EDITOR_ROLES:
        raise errors.not_organization_editor()
    if membership.organization.status == OrgStatusEnum.blocked:
        raise errors.organization_blocked()
    return membership


async def ensure_can_create_organization(db_session: AsyncSession, user_id: int) -> None:
    # Токен сесії живе тиждень і переживає видалення акаунта: без цієї перевірки
    # такий запит упав би з 500 на зовнішньому ключі created_by
    if await db_session.get(User, user_id) is None:
        raise errors.not_authenticated()
    if await get_user_organization_id(db_session, user_id) is not None:
        raise errors.already_has_organization()


async def create_organization(
    db_session: AsyncSession, user_id: int, data: OrganizationCreate
) -> Organization:
    await ensure_can_create_organization(db_session, user_id)
    await ensure_city_exists(db_session, data.city_id)
    if data.edrpou is not None and await is_edrpou_taken(db_session, data.edrpou):
        raise errors.edrpou_taken()

    # Організація й запис про її творця створюються в одній транзакції
    organization = Organization(**data.model_dump(), created_by=user_id)
    organization.members.append(OrganizationMember(user_id=user_id, role=OrgMemberRoleEnum.owner))
    db_session.add(organization)
    try:
        await db_session.commit()
    except IntegrityError as error:
        # Паралельний запит встиг створити організацію або зайняти код ЄДРПОУ
        await db_session.rollback()
        constraint = violated_constraint(error)
        if constraint == "uq_organizations_edrpou":
            raise errors.edrpou_taken() from error
        if constraint in ("uq_organization_members_user_id", "pk_organization_members"):
            raise errors.already_has_organization() from error
        raise

    # created_at та status заповнює БД
    await db_session.refresh(organization)
    return organization


async def update_organization(
    db_session: AsyncSession, membership: OrganizationMember, data: OrganizationUpdate
) -> None:
    changes = data.model_dump(exclude_unset=True)
    if "city_id" in changes:
        await ensure_city_exists(db_session, changes["city_id"])

    for field, value in changes.items():
        setattr(membership.organization, field, value)
    await db_session.commit()


async def get_organization_view(
    db_session: AsyncSession, organization_id: int, user_id: int | None = None
) -> dict:
    query = (
        select(Organization)
        .options(joinedload(Organization.city))
        .where(Organization.id == organization_id)
    )
    organization = await db_session.scalar(query)
    if organization is None:
        raise errors.organization_not_found()

    projects_count = (
        await db_session.scalar(
            select(func.count(Project.id)).where(
                Project.organization_id == organization_id,
                Project.status == ProjectStatusEnum.published,
                Project.ends_at > func.now(),
            )
        )
        or 0
    )

    user_request_status = None
    is_user_member = False
    if user_id is not None:
        member = await db_session.scalar(
            select(OrganizationMember.organization_id).where(
                OrganizationMember.user_id == user_id,
                OrganizationMember.organization_id == organization_id,
            )
        )
        is_user_member = member is not None

        latest_request = await db_session.scalar(
            select(JoinRequest.status)
            .where(
                JoinRequest.user_id == user_id,
                JoinRequest.organization_id == organization_id,
                JoinRequest.target == JoinRequestTargetEnum.organization,
            )
            .order_by(JoinRequest.created_at.desc())
            .limit(1)
        )
        user_request_status = latest_request

    return {
        "id": organization.id,
        "name": organization.name,
        "email": organization.email,
        "phone": organization.phone,
        "city_id": organization.city_id,
        "city_name": organization.city.name if organization.city else None,
        "description": organization.description,
        "edrpou": organization.edrpou,
        "status": organization.status,
        "is_verified": organization.status == OrgStatusEnum.approved,
        "created_at": organization.created_at,
        "projects_count": projects_count,
        "user_request_status": user_request_status,
        "is_user_member": is_user_member,
    }


async def get_organization_projects(
    db_session: AsyncSession, organization_id: int
) -> list[Project]:
    org = await db_session.get(Organization, organization_id)
    if org is None:
        raise errors.organization_not_found()

    query = (
        select(Project)
        .where(
            Project.organization_id == organization_id,
            Project.status == ProjectStatusEnum.published,
            Project.ends_at > func.now(),
        )
        .order_by(Project.created_at.desc(), Project.id.desc())
    )
    return list(await db_session.scalars(query))


async def create_join_request(
    db_session: AsyncSession,
    user_id: int,
    organization_id: int,
    data: JoinRequestCreate,
) -> JoinRequest:
    org = await db_session.get(Organization, organization_id)
    if org is None:
        raise errors.organization_not_found()

    # Перевірка: чи користувач уже є членом цієї організації
    member = await db_session.scalar(
        select(OrganizationMember.organization_id).where(
            OrganizationMember.user_id == user_id,
            OrganizationMember.organization_id == organization_id,
        )
    )
    if member is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "User already belongs to this organization"
        )

    # Перевірка: чи вже є активна (pending) заявка
    pending_request = await db_session.scalar(
        select(JoinRequest.id).where(
            JoinRequest.user_id == user_id,
            JoinRequest.organization_id == organization_id,
            JoinRequest.target == JoinRequestTargetEnum.organization,
            JoinRequest.status == JoinRequestStatusEnum.pending,
        )
    )
    if pending_request is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Join request already pending"
        )

    join_request = JoinRequest(
        user_id=user_id,
        organization_id=organization_id,
        target=JoinRequestTargetEnum.organization,
        message=data.message,
        status=JoinRequestStatusEnum.pending,
    )
    db_session.add(join_request)

    # Сповіщення власнику організації
    if org.created_by:
        notification = Notification(
            user_id=org.created_by,
            type=NotificationTypeEnum.join_request_received,
            title="Нова заявка на вступ",
            message=f"Користувач надіслав заявку на приєднання до організації {org.name}.",
            link=f"/organizations/{org.id}",
        )
        db_session.add(notification)

    try:
        await db_session.commit()
    except IntegrityError as error:
        await db_session.rollback()
        constraint = violated_constraint(error)
        if constraint == "uq_join_requests_pending_user_organization":
            raise HTTPException(
                status.HTTP_409_CONFLICT, "Join request already pending"
            ) from error
        raise

    await db_session.refresh(join_request)
    return join_request


async def get_my_join_request(
    db_session: AsyncSession, user_id: int, organization_id: int
) -> JoinRequest | None:
    return await db_session.scalar(
        select(JoinRequest)
        .where(
            JoinRequest.user_id == user_id,
            JoinRequest.organization_id == organization_id,
            JoinRequest.target == JoinRequestTargetEnum.organization,
        )
        .order_by(JoinRequest.created_at.desc())
        .limit(1)
    )
