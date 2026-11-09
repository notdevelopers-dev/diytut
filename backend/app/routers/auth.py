from typing import Annotated

from authlib.integrations.starlette_client import OAuthError
from fastapi import APIRouter, Cookie, Request, Response, status
from fastapi.responses import RedirectResponse

from app import errors
from app.auth import (
    REGISTRATION_COOKIE,
    SESSION_COOKIE,
    GoogleIdentity,
    end_session,
    oauth,
    read_registration_identity,
    start_registration,
    start_session,
)
from app.config import settings
from app.db import DbSessionDep
from app.models import LoginMethodEnum
from app.schemas.auth import Authenticated, RegistrationRequired
from app.schemas.users import RegistrationRequest, UserRead
from app.services.auth import get_auth_status
from app.services.logins import record_login
from app.services.users import get_user_id_by_google_sub, register_user

# Сторінки фронтенду, куди повертаємо користувача після входу
AFTER_LOGIN_URL = "/"
REGISTRATION_URL = "/register/complete"
LOGIN_FAILED_URL = "/login?error=google"
DEV_LOGIN_URL = "/api/auth/dev/login"

router = APIRouter()


@router.get("/google/login")
async def google_login(request: Request) -> RedirectResponse:
    if settings.dev_login:
        # Локальна розробка без ключів Google: замість Google — сторінка dev-входу
        return RedirectResponse(DEV_LOGIN_URL, status.HTTP_302_FOUND)
    return await oauth.google.authorize_redirect(request, settings.google_redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request, db_session: DbSessionDep) -> RedirectResponse:
    try:
        token = await oauth.google.authorize_access_token(request)
    except OAuthError:
        return RedirectResponse(LOGIN_FAILED_URL, status.HTTP_302_FOUND)

    claims = token.get("userinfo")
    if not claims or not claims.get("email_verified"):
        return RedirectResponse(LOGIN_FAILED_URL, status.HTTP_302_FOUND)
    identity = GoogleIdentity.from_claims(claims)

    user_id = await get_user_id_by_google_sub(db_session, identity.sub)
    if user_id is None:
        # Новий користувач: у БД нічого не пишемо, доки він не заповнить форму реєстрації
        response = RedirectResponse(REGISTRATION_URL, status.HTTP_302_FOUND)
        start_registration(response, identity)
    else:
        await record_login(db_session, user_id, LoginMethodEnum.google)
        response = RedirectResponse(AFTER_LOGIN_URL, status.HTTP_302_FOUND)
        start_session(response, user_id)
    return response


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(
    data: RegistrationRequest,
    db_session: DbSessionDep,
    response: Response,
    registration_token: Annotated[str | None, Cookie(alias=REGISTRATION_COOKIE)] = None,
) -> UserRead:
    identity = read_registration_identity(registration_token)
    if identity is None:
        raise errors.registration_expired()

    user = await register_user(db_session, identity, data)
    await record_login(db_session, user.id, LoginMethodEnum.registration)
    start_session(response, user.id)
    return UserRead.model_validate(user)


@router.get("/me")
async def me(
    db_session: DbSessionDep,
    session_token: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
    registration_token: Annotated[str | None, Cookie(alias=REGISTRATION_COOKIE)] = None,
) -> Authenticated | RegistrationRequired:
    return await get_auth_status(db_session, session_token, registration_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    end_session(response)
