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
    assert project.categories == ["other"]
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


def _published(organization_id: int, **changes) -> Project:
    published = {"status": ProjectStatusEnum.published, "published_at": STARTS_AT - timedelta(7)}
    return _project(organization_id, **published | changes)


def _rejection(db, project: Project) -> str:
    """Текст помилки БД при спробі зберегти проєкт."""

    async def create(session) -> str:
        with pytest.raises(IntegrityError) as error:
            async with session.begin_nested():
                session.add(project)
                await session.flush()
        return str(error.value)

    return db(create)


@pytest.mark.parametrize(
    ("changes", "constraint"),
    [
        ({"capacity": 0}, "ck_projects_capacity_positive"),
        ({"volunteer_hours": Decimal("0")}, "ck_projects_volunteer_hours_positive"),
        ({"ends_at": STARTS_AT}, "ck_projects_ends_after_start"),
        ({"ends_at": STARTS_AT - timedelta(hours=1)}, "ck_projects_ends_after_start"),
        ({"is_online": False}, "ck_projects_offline_has_location"),
        ({"is_online": False, "address": "вул. 1"}, "ck_projects_offline_has_location"),
        ({"categories": []}, "ck_projects_categories_count"),
        ({"categories": ["ecology", "idp", "animals"]}, "ck_projects_categories_count"),
        ({"categories": ["space"]}, "ck_projects_categories_known"),
        # Опублікований проєкт має всі поля, яких у чернетці може й не бути
        ({"description": None}, "ck_projects_complete_unless_draft"),
        ({"starts_at": None}, "ck_projects_complete_unless_draft"),
        ({"ends_at": None}, "ck_projects_complete_unless_draft"),
        ({"capacity": None}, "ck_projects_complete_unless_draft"),
        ({"volunteer_hours": None}, "ck_projects_complete_unless_draft"),
        ({"published_at": None}, "ck_projects_complete_unless_draft"),
    ],
)
def test_invalid_published_project_is_rejected_by_db(
    db, ids: dict[str, int], changes: dict, constraint: str
) -> None:
    assert constraint in _rejection(db, _published(ids["organization"], **changes))


@pytest.mark.parametrize(
    "status",
    [ProjectStatusEnum.published, ProjectStatusEnum.completed, ProjectStatusEnum.cancelled],
)
def test_not_draft_project_requires_all_fields(
    db, ids: dict[str, int], status: ProjectStatusEnum
) -> None:
    project = Project(organization_id=ids["organization"], title="Лише назва", status=status)
    assert "ck_projects_complete_unless_draft" in _rejection(db, project)


def test_draft_with_title_only_is_allowed(db, ids: dict[str, int]) -> None:
    # Рішення 18.11: чернетку можна зберегти з однією назвою, решту дописати пізніше
    async def create(session) -> int:
        project = Project(
            organization_id=ids["organization"],
            title="Лише назва",
            categories=[],
            status=ProjectStatusEnum.draft,
        )
        session.add(project)
        await session.flush()
        return project.id

    project_id = db(create)

    async def load(session) -> Project:
        return await session.get(Project, project_id)

    project = db(load)
    assert project.description is None
    assert project.starts_at is None
    assert project.capacity is None
    assert project.is_online is False
    assert project.city_id is None
    assert project.categories == []
    assert project.published_at is None


@pytest.mark.parametrize(
    ("changes", "constraint"),
    [
        # Порожні поля чернетка дозволяє, а заповнені мають бути коректними
        ({"capacity": 0}, "ck_projects_capacity_positive"),
        ({"volunteer_hours": Decimal("0")}, "ck_projects_volunteer_hours_positive"),
        ({"ends_at": STARTS_AT - timedelta(hours=1)}, "ck_projects_ends_after_start"),
        ({"categories": ["ecology", "idp", "animals"]}, "ck_projects_categories_count"),
        ({"categories": ["space"]}, "ck_projects_categories_known"),
    ],
)
def test_invalid_draft_values_are_rejected_by_db(
    db, ids: dict[str, int], changes: dict, constraint: str
) -> None:
    project = Project(
        organization_id=ids["organization"],
        title="Чернетка",
        starts_at=STARTS_AT,
        status=ProjectStatusEnum.draft,
        **changes,
    )
    assert constraint in _rejection(db, project)
