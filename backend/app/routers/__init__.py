from fastapi import APIRouter

from app.config import settings
from app.routers import admin, auth, cities, dev_auth, health, organizations, users

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router, tags=["service"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
# Лише для локальної розробки; без DEV_LOGIN ендпоінти відповідають 404 і не видні в /api/docs
api_router.include_router(
    dev_auth.router, prefix="/auth/dev", tags=["auth"], include_in_schema=settings.dev_login
)
api_router.include_router(cities.router, prefix="/cities", tags=["cities"])
api_router.include_router(organizations.router, prefix="/organizations", tags=["organizations"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
