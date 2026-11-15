from typing import Annotated

from fastapi import APIRouter, Path

from app.auth import CurrentUserId
from app.db import DbSessionDep
from app.schemas.join_requests import JoinRequestReview, JoinRequestReviewRead
from app.schemas.users import MAX_BIGINT
from app.services import join_requests as service

router = APIRouter()


@router.patch("/{join_request_id}")
async def review_join_request(
    join_request_id: Annotated[int, Path(gt=0, le=MAX_BIGINT)],
    data: JoinRequestReview,
    db_session: DbSessionDep,
    user_id: CurrentUserId,
) -> JoinRequestReviewRead:
    join_request = await service.review_join_request(db_session, user_id, join_request_id, data)
    return JoinRequestReviewRead.model_validate(join_request)
