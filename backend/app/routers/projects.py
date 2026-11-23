from typing import Annotated

from fastapi import APIRouter, File, Path, Query, UploadFile, status
from pydantic import Field, StringConstraints

from app.auth import CurrentUserId, OptionalUserId
from app.db import DbSessionDep
from app.models import JoinRequestStatusEnum, ProjectCategoryEnum
from app.schemas.join_requests import (
    JoinRequestCreate,
    JoinRequestRead,
    ProjectJoinRequestRead,
    ProjectJoinRequestStatusRead,
)
from app.schemas.projects import ProjectCreate, ProjectListItem, ProjectRead, ProjectUpdate
from app.schemas.users import MAX_BIGINT, MAX_INT32
from app.services import project_join_requests as join_requests_service
from app.services import project_photos as photos_service
from app.services import projects as service

# Більше карток на сторінці не буває: каталог віддає до 100 проєктів за раз
MAX_STATUS_PROJECTS = 100
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


ProjectId = Annotated[int, Path(gt=0, le=MAX_BIGINT)]


# Оголошено до /{project_id}: інакше шлях сприймався б як id проєкту
@router.get("/my-request-statuses")
async def read_my_request_statuses(
    db_session: DbSessionDep,
    user_id: CurrentUserId,
    # ?project_id=1&project_id=2: стани для всіх карток сторінки одним запитом;
    # проєкти без заявок у відповіді відсутні
    project_id: Annotated[
        list[Annotated[int, Field(gt=0, le=MAX_BIGINT)]],
        Query(min_length=1, max_length=MAX_STATUS_PROJECTS),
    ],
) -> list[ProjectJoinRequestStatusRead]:
    statuses = await join_requests_service.get_my_request_statuses(db_session, user_id, project_id)
    return [ProjectJoinRequestStatusRead.from_status(*item) for item in statuses]


@router.get("/{project_id}")
async def get_project(
    project_id: ProjectId, db_session: DbSessionDep, user_id: OptionalUserId
) -> ProjectRead:
    project, accepted_count = await service.read_project(db_session, project_id, user_id)
    return ProjectRead.from_project(project, accepted_count)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate, db_session: DbSessionDep, user_id: CurrentUserId
) -> ProjectRead:
    project, accepted_count = await service.create_project(db_session, user_id, data)
    return ProjectRead.from_project(project, accepted_count)


@router.patch("/{project_id}")
async def update_project(
    project_id: ProjectId, data: ProjectUpdate, db_session: DbSessionDep, user_id: CurrentUserId
) -> ProjectRead:
    project, accepted_count = await service.update_project(db_session, user_id, project_id, data)
    return ProjectRead.from_project(project, accepted_count)


@router.post("/{project_id}/publish")
async def publish_project(
    project_id: ProjectId, db_session: DbSessionDep, user_id: CurrentUserId
) -> ProjectRead:
    project, accepted_count = await service.publish_project(db_session, user_id, project_id)
    return ProjectRead.from_project(project, accepted_count)


@router.post("/{project_id}/photo")
async def upload_project_photo(
    project_id: ProjectId,
    file: Annotated[UploadFile, File(description="JPEG, PNG або WebP до 10 МБ")],
    db_session: DbSessionDep,
    user_id: CurrentUserId,
) -> ProjectRead:
    project, accepted_count = await photos_service.set_project_photo(
        db_session, user_id, project_id, file
    )
    return ProjectRead.from_project(project, accepted_count)


@router.delete("/{project_id}/photo")
async def delete_project_photo(
    project_id: ProjectId, db_session: DbSessionDep, user_id: CurrentUserId
) -> ProjectRead:
    project, accepted_count = await photos_service.delete_project_photo(
        db_session, user_id, project_id
    )
    return ProjectRead.from_project(project, accepted_count)


@router.post("/{project_id}/join-requests", status_code=status.HTTP_201_CREATED)
async def create_join_request(
    project_id: ProjectId,
    data: JoinRequestCreate,
    db_session: DbSessionDep,
    user_id: CurrentUserId,
) -> JoinRequestRead:
    join_request = await join_requests_service.create_project_join_request(
        db_session, user_id, project_id, data
    )
    return JoinRequestRead.model_validate(join_request)


@router.get("/{project_id}/join-requests")
async def list_join_requests(
    project_id: ProjectId,
    db_session: DbSessionDep,
    user_id: CurrentUserId,
    # За замовчуванням — черга на розгляд; accepted — склад учасників
    status: JoinRequestStatusEnum = JoinRequestStatusEnum.pending,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0, le=MAX_INT32)] = 0,
) -> list[ProjectJoinRequestRead]:
    join_requests, hours = await join_requests_service.list_project_requests(
        db_session, user_id, project_id, status=status, limit=limit, offset=offset
    )
    return [
        ProjectJoinRequestRead.from_request(request, hours[request.user_id])
        for request in join_requests
    ]


@router.get("/{project_id}/my-request-status")
async def read_my_join_request(
    project_id: ProjectId, db_session: DbSessionDep, user_id: CurrentUserId
) -> ProjectJoinRequestStatusRead:
    join_request, can_reapply_at = await join_requests_service.get_my_request_status(
        db_session, user_id, project_id
    )
    return ProjectJoinRequestStatusRead.from_status(join_request, can_reapply_at)


@router.delete("/{project_id}/my-request")
async def cancel_my_join_request(
    project_id: ProjectId, db_session: DbSessionDep, user_id: CurrentUserId
) -> JoinRequestRead:
    join_request = await join_requests_service.cancel_my_project_request(
        db_session, user_id, project_id
    )
    return JoinRequestRead.model_validate(join_request)
