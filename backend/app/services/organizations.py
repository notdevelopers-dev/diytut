from sqlalchemy import Select, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app import errors
from app.db import violated_constraint
from app.models import (
    Organization,
    OrganizationMember,
    OrgMemberRoleEnum,
    OrgStatusEnum,
    Project,
    ProjectStatusEnum,
    User,
)
from app.schemas.organizations import OrganizationCreate, OrganizationUpdate
from app.services.cities import ensure_city_exists

# Ролі, яким дозволено змінювати профіль організації
EDITOR_ROLES = frozenset({OrgMemberRoleEnum.owner, OrgMemberRoleEnum.admin})


def _memberships_query(user_id: int) -> Select[tuple[OrganizationMember]]:
    """Членства користувача разом з організаціями, від найдавнішого.

    Порядок визначає організацію за замовчуванням, тож він однаковий усюди; joined_at
    збігається в записів однієї транзакції, тому другим ключем іде id організації.
    """
    return (
        select(OrganizationMember)
        .options(joinedload(OrganizationMember.organization, innerjoin=True))
        .where(OrganizationMember.user_id == user_id)
        .order_by(OrganizationMember.joined_at, OrganizationMember.organization_id)
    )


async def get_user_membership(
    db_session: AsyncSession,
    user_id: int,
    organization_id: int | None = None,
    *,
    lock: bool = False,
) -> OrganizationMember | None:
    """Членство користувача в організації разом із самою організацією.

    Без organization_id — в організації за замовчуванням, тобто в тій, до якої він
    приєднався найраніше: так клієнти, що не знають про кілька організацій, і далі
    працюють з однією й тією самою.

    З lock=True обидва рядки блокуються до кінця транзакції: роль і статус організації,
    перевірені перед зміною, не зміняться, доки зміну не збережено.
    """
    query = _memberships_query(user_id).limit(1)
    if organization_id is not None:
        query = query.where(OrganizationMember.organization_id == organization_id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    return await db_session.scalar(query)


async def get_user_memberships(db_session: AsyncSession, user_id: int) -> list[OrganizationMember]:
    """Усі членства користувача в організаціях для перемикання акаунтів."""
    result = await db_session.scalars(_memberships_query(user_id))
    return list(result.all())


async def is_edrpou_taken(db_session: AsyncSession, edrpou: str) -> bool:
    found = await db_session.scalar(select(Organization.id).where(Organization.edrpou == edrpou))
    return found is not None


async def require_membership(
    db_session: AsyncSession, user_id: int, organization_id: int | None = None
) -> OrganizationMember:
    membership = await get_user_membership(db_session, user_id, organization_id)
    if membership is None:
        raise errors.membership_not_found(organization_id)
    return membership


async def require_editor_membership(
    db_session: AsyncSession, user_id: int, organization_id: int | None = None
) -> OrganizationMember:
    """Членство, з яким можна змінювати профіль організації; заблоковане до кінця запиту."""
    membership = await get_user_membership(db_session, user_id, organization_id, lock=True)
    if membership is None:
        raise errors.membership_not_found(organization_id)
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
        # Паралельний запит встиг зайняти код ЄДРПОУ
        await db_session.rollback()
        if violated_constraint(error) == "uq_organizations_edrpou":
            raise errors.edrpou_taken() from error
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


async def list_approved_organizations(
    db_session: AsyncSession, *, limit: int, offset: int, city_id: int | None = None
) -> list[Organization]:
    """Публічний каталог (R-15): лише схвалені організації, нові спершу."""
    query = select(Organization).where(Organization.status == OrgStatusEnum.approved)
    if city_id is not None:
        query = query.where(Organization.city_id == city_id)
    query = (
        query.order_by(Organization.created_at.desc(), Organization.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(await db_session.scalars(query))


async def get_approved_organization(db_session: AsyncSession, organization_id: int) -> Organization:
    # Несхвалена організація видима лише творцю через /organizations/me (R-07)
    organization = await db_session.scalar(
        select(Organization).where(
            Organization.id == organization_id,
            Organization.status == OrgStatusEnum.approved,
        )
    )
    if organization is None:
        raise errors.organization_not_found()
    return organization


async def list_published_projects(db_session: AsyncSession, organization_id: int) -> list[Project]:
    query = (
        select(Project)
        .where(
            Project.organization_id == organization_id,
            Project.status == ProjectStatusEnum.published,
        )
        .order_by(Project.created_at.desc(), Project.id.desc())
    )
    return list(await db_session.scalars(query))
