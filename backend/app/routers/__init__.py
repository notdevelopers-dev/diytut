from fastapi import APIRouter

from app.routers import auth, cities, health, organizations, users

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router, tags=["service"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(cities.router, prefix="/cities", tags=["cities"])
api_router.include_router(organizations.router, prefix="/organizations", tags=["organizations"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
