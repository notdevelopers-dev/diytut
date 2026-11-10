from typing import Annotated

from fastapi import APIRouter, Query, status

from app.auth import CurrentUserId
from app.db import DbSessionDep
from app.schemas.projects import ProjectCreate, ProjectListItem, ProjectRead
from app.schemas.users import MAX_INT32
from app.services import projects as service

router = APIRouter()


@router.get("")
async def list_projects(
    db_session: DbSessionDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0, le=MAX_INT32)] = 0,
    search: Annotated[str | None, Query()] = None,
    city_id: Annotated[int | None, Query(gt=0, le=MAX_INT32)] = None,
) -> list[ProjectListItem]:
    projects = await service.list_active_projects(
        db_session, limit=limit, offset=offset, search=search, city_id=city_id
    )
    return [ProjectListItem.model_validate(project) for project in projects]


@router.get("/{project_id}")
async def get_project(project_id: int, db_session: DbSessionDep) -> ProjectRead:
    project = await service.get_published_project(db_session, project_id)
    return ProjectRead.model_validate(project)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate, db_session: DbSessionDep, user_id: CurrentUserId
) -> ProjectRead:
    project = await service.create_project(db_session, user_id, data)
    return ProjectRead.model_validate(project)
