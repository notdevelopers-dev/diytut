from fastapi import FastAPI

from app.routers import api_router

app = FastAPI(
    title="ДійТут API",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)
app.include_router(api_router)