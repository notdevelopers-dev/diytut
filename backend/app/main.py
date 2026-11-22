from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.routers import api_router

app = FastAPI(
    title="ДійТут API",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)
# Тимчасове сховище state, nonce і PKCE між редиректом на Google і поверненням з нього
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key.get_secret_value(),
    session_cookie="oauth_state",
    max_age=600,
    path="/api/auth/google",
    same_site="lax",
    https_only=settings.cookie_secure,
)
app.include_router(api_router)

# Лише для локальної розробки (SERVE_MEDIA): на сервері завантажені файли роздає nginx
if settings.serve_media:
    app.mount(
        settings.media_url,
        StaticFiles(directory=settings.media_root, check_dir=False),
        name="media",
    )
