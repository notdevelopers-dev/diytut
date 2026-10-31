from typing import Annotated, Literal

from authlib.integrations.starlette_client import OAuthError
from fastapi import APIRouter, Cookie, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.auth import (
    REGISTRATION_COOKIE,
    SESSION_COOKIE,
    GoogleIdentity,
    end_session,
    get_user_id_by_google_sub,
    oauth,
    read_registration_identity,
    read_session_user_id,
    start_registration,
    start_session,
)
from app.config import settings
from app.db import SessionDep

# Сторінки фронтенду, куди повертаємо користувача після входу
AFTER_LOGIN_URL = "/"
REGISTRATION_URL = "/register/complete"
LOGIN_FAILED_URL = "/login?error=google"

router = APIRouter(prefix="/auth", tags=["auth"])


class Authenticated(BaseModel):
    status: Literal["authenticated"] = "authenticated"
    user_id: int


class RegistrationRequired(BaseModel):
    status: Literal["registration_required"] = "registration_required"
    email: str
    first_name: str | None
    last_name: str | None


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


@router.get("/me")
async def me(
    session_token: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
    registration_token: Annotated[str | None, Cookie(alias=REGISTRATION_COOKIE)] = None,
) -> Authenticated | RegistrationRequired:
    user_id = read_session_user_id(session_token)
    if user_id is not None:
        return Authenticated(user_id=user_id)

    identity = read_registration_identity(registration_token)
    if identity is not None:
        return RegistrationRequired(
            email=identity.email, first_name=identity.first_name, last_name=identity.last_name
        )

    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    end_session(response)
