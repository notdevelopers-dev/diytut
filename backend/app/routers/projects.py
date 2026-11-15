from typing import Annotated

from fastapi import APIRouter, Path, Query, status
from pydantic import StringConstraints

from app.auth import CurrentUserId
from app.db import DbSessionDep
from app.models import ProjectCategoryEnum
from app.schemas.projects import ProjectCreate, ProjectListItem, ProjectRead
from app.schemas.users import MAX_BIGINT, MAX_INT32
from app.services import projects as service

# Більше хештегів у фільтрі каталогу не потрібно, а довгий список лише навантажує запит
MAX_TAG_FILTERS = 20
MAX_TAG_FILTER_LENGTH = 100

router = APIRouter()


@router.get("")
async def list_projects(
    db_session: DbSessionDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0, le=MAX_INT32)] = 0,
    search: Annotated[str | None, Query()] = None,
    city_id: Annotated[int | None, Query(gt=0, le=MAX_INT32)] = None,
    # ?categories=ecology&categories=idp: проєкти з будь-якою з переданих сфер (R-14);
    # невідома сфера — 422. Ліміт — кількість сфер, тож повтори не пройдуть понад нього
    categories: Annotated[
        list[ProjectCategoryEnum] | None, Query(max_length=len(ProjectCategoryEnum))
    ] = None,
    # ?tags=толока&tags=дніпро: проєкти з будь-яким із переданих хештегів
    tags: Annotated[
        list[Annotated[str, StringConstraints(max_length=MAX_TAG_FILTER_LENGTH)]] | None,
        Query(max_length=MAX_TAG_FILTERS),
    ] = None,
) -> list[ProjectListItem]:
    projects = await service.list_active_projects(
        db_session,
        limit=limit,
        offset=offset,
        search=search,
        city_id=city_id,
        categories=categories,
        tags=tags,
    )
    return [ProjectListItem.model_validate(project) for project in projects]


@router.get("/{project_id}")
async def get_project(
    project_id: Annotated[int, Path(gt=0, le=MAX_BIGINT)], db_session: DbSessionDep
) -> ProjectRead:
    project = await service.get_published_project(db_session, project_id)
    return ProjectRead.model_validate(project)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate, db_session: DbSessionDep, user_id: CurrentUserId
) -> ProjectRead:
    project = await service.create_project(db_session, user_id, data)
    return ProjectRead.model_validate(project)
