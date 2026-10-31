from fastapi import APIRouter

from app.routers import auth, cities, health

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(cities.router)
