from sqlalchemy.ext.asyncio import AsyncSession

from app import errors
from app.auth import read_registration_identity, read_session_user_id
from app.models import User
from app.schemas.auth import Authenticated, RegistrationRequired
from app.schemas.organizations import OrganizationMembership
from app.schemas.users import UserRead
from app.services.organizations import get_user_membership


async def get_auth_status(
    db_session: AsyncSession, session_token: str | None, registration_token: str | None
) -> Authenticated | RegistrationRequired:
    user_id = read_session_user_id(session_token)
    # Користувача могли видалити, поки його токен сесії ще дійсний
    user = await db_session.get(User, user_id) if user_id is not None else None
    if user is not None:
        membership = await get_user_membership(db_session, user.id)
        organization = OrganizationMembership.from_membership(membership) if membership else None
        return Authenticated(user=UserRead.model_validate(user), organization=organization)

    identity = read_registration_identity(registration_token)
    if identity is not None:
        return RegistrationRequired(
            email=identity.email, first_name=identity.first_name, last_name=identity.last_name
        )

    raise errors.not_authenticated()
