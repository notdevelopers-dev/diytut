from typing import Literal

from pydantic import BaseModel

from app.schemas.organizations import OrganizationMembership
from app.schemas.users import UserRead


class Authenticated(BaseModel):
    status: Literal["authenticated"] = "authenticated"
    user: UserRead
    # Організація користувача за замовчуванням (найдавніша); null, якщо жодної немає.
    # Усі його організації — у GET /users/me/organizations
    organization: OrganizationMembership | None


class RegistrationRequired(BaseModel):
    status: Literal["registration_required"] = "registration_required"
    email: str
    first_name: str | None
    last_name: str | None
