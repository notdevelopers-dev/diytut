from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

import jwt
from authlib.integrations.starlette_client import OAuth
from fastapi import Cookie, Depends, HTTPException, Response, status

from app.config import settings

SESSION_COOKIE = "session"
REGISTRATION_COOKIE = "registration"
SESSION_TTL = timedelta(days=7)
# Скільки часу є на заповнення форми реєстрації після входу через Google
REGISTRATION_TTL = timedelta(minutes=30)
JWT_ALGORITHM = "HS256"

oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile", "code_challenge_method": "S256"},
)


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str
    email_verified: bool
    first_name: str | None
    last_name: str | None

    @classmethod
    def from_claims(cls, claims: dict[str, Any]) -> GoogleIdentity:
        return cls(
            sub=claims["sub"],
            email=claims["email"],
            email_verified=bool(claims.get("email_verified")),
            first_name=claims.get("given_name"),
            last_name=claims.get("family_name"),
        )


def _encode(claims: dict[str, Any], ttl: timedelta) -> str:
    now = datetime.now(UTC)
    payload = {**claims, "iat": now, "exp": now + ttl}
    return jwt.encode(payload, settings.secret_key, algorithm=JWT_ALGORITHM)


def _decode(token: str | None, token_type: str) -> dict[str, Any] | None:
    if token is None:
        return None
    try:
        claims = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "exp", "typ"]},
        )
    except jwt.InvalidTokenError:
        return None
    # Токен реєстрації не повинен працювати як токен сесії, і навпаки
    if claims["typ"] != token_type:
        return None
    return claims


def _set_cookie(response: Response, name: str, value: str, ttl: timedelta) -> None:
    response.set_cookie(
        name,
        value,
        max_age=int(ttl.total_seconds()),
        path="/api",
        secure=settings.cookie_secure,
        httponly=True,
        samesite="lax",
    )


def _delete_cookie(response: Response, name: str) -> None:
    response.delete_cookie(
        name, path="/api", secure=settings.cookie_secure, httponly=True, samesite="lax"
    )


def start_session(response: Response, user_id: int) -> None:
    token = _encode({"sub": str(user_id), "typ": "session"}, SESSION_TTL)
    _set_cookie(response, SESSION_COOKIE, token, SESSION_TTL)
    _delete_cookie(response, REGISTRATION_COOKIE)


def start_registration(response: Response, identity: GoogleIdentity) -> None:
    claims = {
        "sub": identity.sub,
        "typ": "registration",
        "email": identity.email,
        "given_name": identity.first_name,
        "family_name": identity.last_name,
    }
    _set_cookie(response, REGISTRATION_COOKIE, _encode(claims, REGISTRATION_TTL), REGISTRATION_TTL)
    _delete_cookie(response, SESSION_COOKIE)


def end_session(response: Response) -> None:
    _delete_cookie(response, SESSION_COOKIE)
    _delete_cookie(response, REGISTRATION_COOKIE)


def read_session_user_id(token: str | None) -> int | None:
    claims = _decode(token, "session")
    return int(claims["sub"]) if claims else None


def read_registration_identity(token: str | None) -> GoogleIdentity | None:
    claims = _decode(token, "registration")
    if claims is None:
        return None
    # У токен реєстрації потрапляють лише підтверджені email
    return GoogleIdentity.from_claims({**claims, "email_verified": True})


async def get_current_user_id(
    session_token: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> int:
    user_id = read_session_user_id(session_token)
    if user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    return user_id


CurrentUserId = Annotated[int, Depends(get_current_user_id)]
