from fastapi import APIRouter, HTTPException, status
from sqlalchemy.exc import IntegrityError

from app.auth import CurrentUserId
from app.db import SessionDep
from app.models.base import City
from app.organizations import get_user_memberships
from app.routers.auth import field_error
from app.schemas.organizations import OrganizationMembership
from app.schemas.users import UserProfileRead, UserUpdate
from app.users import get_user_for_update, get_user_with_details, is_nickname_taken_by_other

router = APIRouter(prefix="/users", tags=["users"])


def city_not_found() -> HTTPException:
    return field_error(
        status.HTTP_422_UNPROCESSABLE_CONTENT, "city_id", "city_not_found", "City not found"
    )


def nickname_taken() -> HTTPException:
    return field_error(
        status.HTTP_409_CONFLICT, "nickname", "nickname_taken", "Nickname is already taken"
    )


@router.get("/me")
async def read_my_profile(session: SessionDep, user_id: CurrentUserId) -> UserProfileRead:
    user = await get_user_with_details(session, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return UserProfileRead.model_validate(user)


@router.patch("/me")
async def update_my_profile(
    data: UserUpdate, session: SessionDep, user_id: CurrentUserId
) -> UserProfileRead:
    user = await get_user_for_update(session, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    changes = data.model_dump(exclude_unset=True)
    if not changes:
        await session.refresh(user, attribute_names=["city"])
        return UserProfileRead.model_validate(user)

    if (
        "city_id" in changes
        and changes["city_id"] is not None
        and await session.get(City, changes["city_id"]) is None
    ):
        raise city_not_found()

    if "nickname" in changes and changes["nickname"] is not None:
        if await is_nickname_taken_by_other(session, changes["nickname"], user_id):
            raise nickname_taken()

    for field, value in changes.items():
        setattr(user, field, value)

    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        if getattr(error.orig.__cause__, "constraint_name", None) == "uq_users_nickname":
            raise nickname_taken() from error
        raise

    # Оновлюємо зв'язок міста для серіалізації у UserProfileRead
    await session.refresh(user, attribute_names=["city"])
    return UserProfileRead.model_validate(user)


@router.get("/me/organizations")
async def read_my_organizations(
    session: SessionDep, user_id: CurrentUserId
) -> list[OrganizationMembership]:
    memberships = await get_user_memberships(session, user_id)
    return [OrganizationMembership.from_membership(m) for m in memberships]
