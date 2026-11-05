"""Вхід без Google для локальної розробки (DEV_LOGIN=true).

Підміняє лише крок із Google: далі все так само, як після справжнього входу — наявний
користувач отримує сесію, новий іде на форму реєстрації фронтенду.
"""

from html import escape
from urllib.parse import parse_qs

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import select

from app.auth import GoogleIdentity, start_registration, start_session
from app.config import settings
from app.db import SessionDep
from app.models.base import User
from app.routers.auth import AFTER_LOGIN_URL, REGISTRATION_URL

DEV_SUB_PREFIX = "dev:"
LISTED_USERS = 50


def require_dev_login() -> None:
    if not settings.dev_login:
        raise HTTPException(status.HTTP_404_NOT_FOUND)


router = APIRouter(
    prefix="/auth/dev",
    tags=["auth"],
    dependencies=[Depends(require_dev_login)],
    include_in_schema=settings.dev_login,
)


@router.get("/login")
async def dev_login_page(session: SessionDep) -> HTMLResponse:
    users = (
        await session.execute(
            select(User.email, User.nickname).order_by(User.id.desc()).limit(LISTED_USERS)
        )
    ).all()
    buttons = "".join(
        f'<button name="email" value="{escape(email)}">{escape(email)}'
        f" <small>@{escape(nickname)}</small></button>"
        for email, nickname in users
    )
    existing = (
        f'<h2>Увійти як наявний користувач</h2><form method="post">{buttons}</form>'
        if users
        else ""
    )
    return HTMLResponse(
        f"""<!doctype html>
<html lang="uk">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dev-вхід</title>
<style>
  body {{ font-family: system-ui, sans-serif; max-width: 420px; margin: 40px auto;
         padding: 0 16px; background: #F7FBFF; }}
  form {{ display: grid; gap: 8px; margin-bottom: 24px; }}
  input, button {{ font: inherit; padding: 8px 12px; border-radius: 8px;
                  border: 1px solid #bcd; background: #fff; text-align: left; }}
  button {{ cursor: pointer; background: #DCECFF; }}
  small {{ color: #567; }}
  p {{ color: #567; }}
</style>
<h1>Dev-вхід замість Google</h1>
<p>Лише для локальної розробки. Новий email веде на форму реєстрації, як після Google.</p>
<form method="post">
  <input name="email" type="email" placeholder="email" required autofocus>
  <input name="first_name" placeholder="Ім'я (необов'язково)">
  <input name="last_name" placeholder="Прізвище (необов'язково)">
  <button>Увійти</button>
</form>
{existing}
</html>"""
    )


@router.post("/login")
async def dev_login(request: Request, session: SessionDep) -> RedirectResponse:
    # Без python-multipart: форма проста, тож розбираємо тіло самі
    form = {key: values[0] for key, values in parse_qs((await request.body()).decode()).items()}
    email = form.get("email", "").strip().lower()
    if "@" not in email:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Email is required")

    # Наявного користувача впізнаємо за email, тож працюють і акаунти, створені через Google
    user_id = await session.scalar(select(User.id).where(User.email == email))
    if user_id is not None:
        response = RedirectResponse(AFTER_LOGIN_URL, status.HTTP_302_FOUND)
        start_session(response, user_id)
        return response

    identity = GoogleIdentity(
        sub=DEV_SUB_PREFIX + email,
        email=email,
        email_verified=True,
        first_name=form.get("first_name", "").strip() or None,
        last_name=form.get("last_name", "").strip() or None,
    )
    response = RedirectResponse(REGISTRATION_URL, status.HTTP_302_FOUND)
    start_registration(response, identity)
    return response
