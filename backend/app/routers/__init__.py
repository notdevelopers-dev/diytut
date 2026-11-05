from fastapi import APIRouter

from app.routers import auth, cities, dev_auth, health, organizations, users

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(dev_auth.router)
api_router.include_router(cities.router)
api_router.include_router(organizations.router)
api_router.include_router(users.router)
