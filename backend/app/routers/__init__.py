from fastapi import APIRouter

from app.routers import auth, cities, health, organizations

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(cities.router, prefix="/cities", tags=["cities"]) # на смак девелопера, але наче як коли все в одному місці - просітше
api_router.include_router(organizations.router)
