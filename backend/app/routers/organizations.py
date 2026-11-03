from fastapi import APIRouter, HTTPException, status
from sqlalchemy.exc import IntegrityError

from app.auth import CurrentUserId
from app.db import SessionDep
from app.models.base import City, Organization, OrganizationMember, OrgMemberRoleEnum, User
from app.organizations import get_user_organization_id, is_edrpou_taken
from app.routers.auth import field_error
from app.schemas.organizations import OrganizationCreate, OrganizationRead

router = APIRouter(prefix="/organizations", tags=["organizations"])

# Краще винести в окремий файл ../errors.py і потім іпортити
def already_has_organization() -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, "User already belongs to an organization")


def edrpou_taken() -> HTTPException:
    return field_error(
        status.HTTP_409_CONFLICT,
        "edrpou",
        "edrpou_taken",
        "Organization with this EDRPOU code is already registered",
    )

# загальна рекомендація: вся бізнес логіка зберігається в services/
# шнтерфейси для взаємодії з базоб (по типу звичайні селекти та безпосередньо всі маніпуляції з склалчемі)
@router.post("", status_code=status.HTTP_201_CREATED)
async def create_organization(
    # session дуже ambigious: може бути логін сесія, а може і дб
    # session => db_session
    data: OrganizationCreate, session: SessionDep, user_id: CurrentUserId
) -> OrganizationRead:

    # нащо це, якщо вже є user_id в депендесях? 
    # if await session.get(User, user_id) is None:
    #  raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")

    # це авторизація, рекомендую винести в модуль з бізнес логікою і зробити метод абстрактнішим
    # is_user_able_to_create_org(user_id=user_id)
    if await get_user_organization_id(session, user_id) is not None:
        raise already_has_organization()

    # pydantic вміє робити валідацію None із коробки
    # реально `session.get(City, data.city_id)``, не `data.get(city_id)`?
    if await session.get(City, data.city_id) is None:
        raise field_error(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "city_id", "city_not_found", "City not found"
        )

    if data.edrpou is not None and await is_edrpou_taken(session, data.edrpou):
        raise edrpou_taken()

    # Організація й запис про її творця створюються в одній транзакції
    organization = Organization(**data.model_dump(), created_by=user_id)
    organization.members.append(OrganizationMember(user_id=user_id, role=OrgMemberRoleEnum.owner))
    session.add(organization)
    try:
        await session.commit()
    except IntegrityError as error:
        # Паралельний запит встиг створити організацію або зайняти код ЄДРПОУ
        await session.rollback()
        constraint = getattr(error.orig.__cause__, "constraint_name", None)
        if constraint == "uq_organizations_edrpou":
            raise edrpou_taken() from error
        if constraint in ("uq_organization_members_user_id", "pk_organization_members"):
            raise already_has_organization() from error
        raise

    # created_at та status заповнює БД
    await session.refresh(organization)
    return OrganizationRead.model_validate(organization)
