from datetime import UTC, datetime
from typing import Annotated, Literal

from authlib.integrations.starlette_client import OAuthError
from fastapi import APIRouter, Cookie, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError

from app.auth import (
    REGISTRATION_COOKIE,
    SESSION_COOKIE,
    GoogleIdentity,
    end_session,
    oauth,
    read_registration_identity,
    read_session_user_id,
    start_registration,
    start_session,
)
from app.config import settings
from app.db import SessionDep
from app.models.base import City, User
from app.schemas.users import RegistrationRequest, UserRead
from app.users import free_generated_nickname, get_user_id_by_google_sub, is_nickname_taken

# Сторінки фронтенду, куди повертаємо користувача після входу
AFTER_LOGIN_URL = "/"
REGISTRATION_URL = "/register/complete"
LOGIN_FAILED_URL = "/login?error=google"

router = APIRouter(prefix="/auth", tags=["auth"])


class Authenticated(BaseModel):
    status: Literal["authenticated"] = "authenticated"
    user: UserRead


class RegistrationRequired(BaseModel):
    status: Literal["registration_required"] = "registration_required"
    email: str
    first_name: str | None
    last_name: str | None


def field_error(status_code: int, field: str, error_type: str, message: str) -> HTTPException:
    """Помилка поля в тому ж форматі, що й помилки валідації FastAPI (422)."""
    return HTTPException(
        status_code, [{"type": error_type, "loc": ["body", field], "msg": message}]
    )


def nickname_taken() -> HTTPException:
    return field_error(
        status.HTTP_409_CONFLICT, "nickname", "nickname_taken", "Nickname is already taken"
    )


@router.get("/google/login")
async def google_login(request: Request) -> RedirectResponse:
    return await oauth.google.authorize_redirect(request, settings.google_redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request, session: SessionDep) -> RedirectResponse:
    try:
        token = await oauth.google.authorize_access_token(request)
    except OAuthError:
        return RedirectResponse(LOGIN_FAILED_URL, status.HTTP_302_FOUND)

    claims = token.get("userinfo")
    if not claims or not claims.get("email_verified"):
        return RedirectResponse(LOGIN_FAILED_URL, status.HTTP_302_FOUND)
    identity = GoogleIdentity.from_claims(claims)

    user_id = await get_user_id_by_google_sub(session, identity.sub)
    if user_id is None:
        # Новий користувач: у БД нічого не пишемо, доки він не заповнить форму реєстрації
        response = RedirectResponse(REGISTRATION_URL, status.HTTP_302_FOUND)
        start_registration(response, identity)
    else:
        response = RedirectResponse(AFTER_LOGIN_URL, status.HTTP_302_FOUND)
        start_session(response, user_id)
    return response


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(
    data: RegistrationRequest,
    session: SessionDep,
    response: Response,
    registration_token: Annotated[str | None, Cookie(alias=REGISTRATION_COOKIE)] = None,
) -> UserRead:
    identity = read_registration_identity(registration_token)
    if identity is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Registration expired, sign in with Google again"
        )

    if await session.get(City, data.city_id) is None:
        raise field_error(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "city_id", "city_not_found", "City not found"
        )

    if data.nickname is None:
        nickname = await free_generated_nickname(session)
    elif await is_nickname_taken(session, data.nickname):
        raise nickname_taken()
    else:
        nickname = data.nickname

    user = User(
        **data.model_dump(exclude={"nickname"}),
        nickname=nickname,
        google_sub=identity.sub,
        email=identity.email.lower(),
        profile_completed_at=datetime.now(UTC),
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError as error:
        # Хтось встиг зайняти нікнейм між перевіркою й записом, або форму відправили двічі
        await session.rollback()
        if getattr(error.orig.__cause__, "constraint_name", None) == "uq_users_nickname":
            raise nickname_taken() from error
        raise HTTPException(status.HTTP_409_CONFLICT, "User is already registered") from error

    start_session(response, user.id)
    return UserRead.model_validate(user)


@router.get("/me")
async def me(
    session: SessionDep,
    session_token: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
    registration_token: Annotated[str | None, Cookie(alias=REGISTRATION_COOKIE)] = None,
) -> Authenticated | RegistrationRequired:
    user_id = read_session_user_id(session_token)
    if user_id is not None:
        user = await session.get(User, user_id)
        if user is not None:
            return Authenticated(user=UserRead.model_validate(user))

    identity = read_registration_identity(registration_token)
    if identity is not None:
        return RegistrationRequired(
            email=identity.email, first_name=identity.first_name, last_name=identity.last_name
        )

    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    end_session(response)
