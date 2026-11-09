from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.models import (
    City,
    ExperienceLevelEnum,
    Organization,
    Project,
    ProjectStatusEnum,
    User,
)

STARTS_AT = datetime(2026, 12, 1, 10, 0, tzinfo=UTC)


@pytest.fixture
def ids(db) -> dict[str, int]:
    async def create(session) -> dict[str, int]:
        city = City(name="Львів", region="Львівська")
        session.add(city)
        await session.flush()
        user = User(
            google_sub="google-1",
            email="user1@example.com",
            first_name="Тарас",
            last_name="Шевченко",
            phone="+380671234567",
            birth_date=date(1990, 3, 9),
            city_id=city.id,
        )
        session.add(user)
        await session.flush()
        organization = Organization(
            name="Фонд",
            email="fund@example.com",
            phone="+380671234567",
            city_id=city.id,
            created_by=user.id,
        )
        session.add(organization)
        await session.flush()
        return {"city": city.id, "organization": organization.id}

    return db(create)


def _project(organization_id: int, **changes) -> Project:
    fields = {
        "organization_id": organization_id,
        "title": "Прибирання парку",
        "description": "Збираємо сміття в парку",
        "starts_at": STARTS_AT,
        "ends_at": STARTS_AT + timedelta(hours=3),
        "is_online": True,
        "capacity": 10,
        "volunteer_hours": Decimal("2.5"),
    } | changes
    return Project(**fields)


def test_project_defaults_and_organization_link(db, ids: dict[str, int]) -> None:
    async def create(session) -> int:
        project = _project(ids["organization"])
        session.add(project)
        await session.flush()
        return project.id

    project_id = db(create)

    async def load(session) -> tuple[Project, list[int]]:
        project = await session.get(Project, project_id)
        organization = await session.scalar(
            select(Organization)
            .where(Organization.id == ids["organization"])
            .options(selectinload(Organization.projects))
        )
        return project, [p.id for p in organization.projects]

    project, organization_projects = db(load)
    assert project.status == ProjectStatusEnum.draft
    assert project.experience_level == ExperienceLevelEnum.novice
    assert project.is_adult_only is False
    assert project.tags == []
    assert project.volunteer_hours == Decimal("2.50")
    assert project.created_at is not None
    assert organization_projects == [project_id]


def test_offline_project_with_location_is_allowed(db, ids: dict[str, int]) -> None:
    async def create(session) -> None:
        session.add(
            _project(ids["organization"], is_online=False, city_id=ids["city"], address="вул. 1")
        )
        await session.flush()

    db(create)


def test_projects_can_be_filtered_by_tag(db, ids: dict[str, int]) -> None:
    async def create(session) -> list[str]:
        session.add_all(
            [
                _project(ids["organization"], title="Еко", tags=["екологія", "діти"]),
                _project(ids["organization"], title="Кухня", tags=["їжа"]),
            ]
        )
        await session.flush()
        return list(
            await session.scalars(select(Project.title).where(Project.tags.contains(["діти"])))
        )

    assert db(create) == ["Еко"]


@pytest.mark.parametrize(
    ("changes", "constraint"),
    [
        ({"capacity": 0}, "ck_projects_capacity_positive"),
        ({"volunteer_hours": Decimal("0")}, "ck_projects_volunteer_hours_positive"),
        ({"ends_at": None}, 'column "ends_at"'),
        ({"ends_at": STARTS_AT}, "ck_projects_ends_after_start"),
        ({"ends_at": STARTS_AT - timedelta(hours=1)}, "ck_projects_ends_after_start"),
        ({"is_online": False}, "ck_projects_offline_has_location"),
        ({"is_online": False, "address": "вул. 1"}, "ck_projects_offline_has_location"),
    ],
)
def test_invalid_project_is_rejected_by_db(
    db, ids: dict[str, int], changes: dict, constraint: str
) -> None:
    async def create(session) -> str:
        with pytest.raises(IntegrityError) as error:
            async with session.begin_nested():
                session.add(_project(ids["organization"], **changes))
                await session.flush()
        return str(error.value)

    assert constraint in db(create)
