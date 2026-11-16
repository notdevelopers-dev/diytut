from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError

from app.db import violated_constraint
from app.models import (
    City,
    JoinRequest,
    JoinRequestStatusEnum,
    JoinRequestTargetEnum,
    Organization,
    Project,
    User,
)

STARTS_AT = datetime(2026, 12, 1, 10, 0, tzinfo=UTC)


@pytest.fixture
def ids(db) -> dict[str, int]:
    async def create(session) -> dict[str, int]:
        city = City(name="Львів", region="Львівська")
        session.add(city)
        await session.flush()
        owner, volunteer = (
            User(
                google_sub=f"google-{n}",
                email=f"user{n}@example.com",
                first_name="Тарас",
                last_name="Шевченко",
                phone="+380671234567",
                birth_date=date(1990, 3, 9),
                city_id=city.id,
            )
            for n in (1, 2)
        )
        session.add_all([owner, volunteer])
        await session.flush()
        organizations = [
            Organization(
                name=f"Фонд {n}",
                email=f"fund{n}@example.com",
                phone="+380671234567",
                city_id=city.id,
                created_by=owner.id,
            )
            for n in (1, 2)
        ]
        session.add_all(organizations)
        await session.flush()
        projects = [
            Project(
                organization_id=organizations[0].id,
                title=f"Проєкт {n}",
                description="Опис",
                starts_at=STARTS_AT,
                ends_at=STARTS_AT + timedelta(hours=3),
                is_online=True,
                capacity=10,
                volunteer_hours=Decimal("2"),
            )
            for n in (1, 2)
        ]
        session.add_all(projects)
        await session.flush()
        return {
            "user": volunteer.id,
            "organization": organizations[0].id,
            "other_organization": organizations[1].id,
            "project": projects[0].id,
            "other_project": projects[1].id,
        }

    return db(create)


def _org_request(ids: dict[str, int], **changes) -> JoinRequest:
    fields = {"user_id": ids["user"], "organization_id": ids["organization"]} | changes
    return JoinRequest(**fields)


def _project_request(ids: dict[str, int], **changes) -> JoinRequest:
    fields = {
        "user_id": ids["user"],
        "organization_id": ids["organization"],
        "target": JoinRequestTargetEnum.project,
        "project_id": ids["project"],
    } | changes
    return JoinRequest(**fields)


def _add_all(db, *requests: JoinRequest) -> None:
    async def create(session) -> None:
        session.add_all(requests)
        await session.flush()

    db(create)


def _violation(db, request: JoinRequest) -> str | None:
    async def create(session) -> str | None:
        with pytest.raises(IntegrityError) as error:
            async with session.begin_nested():
                session.add(request)
                await session.flush()
        return violated_constraint(error.value)

    return db(create)


def test_defaults(db, ids: dict[str, int]) -> None:
    request = _org_request(ids)
    _add_all(db, request)

    assert request.target is JoinRequestTargetEnum.organization
    assert request.status is JoinRequestStatusEnum.pending
    assert request.project_id is None
    assert request.created_at is not None


def test_duplicate_pending_organization_request_is_rejected_by_db(db, ids) -> None:
    _add_all(db, _org_request(ids))

    assert _violation(db, _org_request(ids)) == "uq_join_requests_pending_user_organization"


def test_duplicate_pending_project_request_is_rejected_by_db(db, ids) -> None:
    _add_all(db, _project_request(ids))

    assert _violation(db, _project_request(ids)) == "uq_join_requests_pending_user_project"


@pytest.mark.parametrize("status", [JoinRequestStatusEnum.accepted, JoinRequestStatusEnum.rejected])
def test_new_request_allowed_after_previous_is_reviewed(db, ids, status) -> None:
    _add_all(db, _org_request(ids, status=status), _project_request(ids, status=status))

    _add_all(db, _org_request(ids), _project_request(ids))


def test_pending_requests_to_different_targets_do_not_conflict(db, ids) -> None:
    _add_all(
        db,
        _org_request(ids),
        _org_request(ids, organization_id=ids["other_organization"]),
        # Заявки на проєкти тієї ж організації не заважають заявці на вступ до неї
        _project_request(ids),
        _project_request(ids, project_id=ids["other_project"]),
    )


@pytest.mark.parametrize(
    "request_factory",
    [
        lambda ids: _org_request(ids, project_id=ids["project"]),
        lambda ids: _project_request(ids, project_id=None),
    ],
    ids=["organization_with_project", "project_without_project_id"],
)
def test_project_id_must_match_target(db, ids, request_factory) -> None:
    assert _violation(db, request_factory(ids)) == "ck_join_requests_project_matches_target"
