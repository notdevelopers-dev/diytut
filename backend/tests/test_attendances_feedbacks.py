from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import delete, func, select, text
from sqlalchemy.exc import IntegrityError

from app.db import violated_constraint
from app.models import (
    Attendance,
    City,
    Feedback,
    FeedbackTargetEnum,
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
        owner, volunteer, other_volunteer = (
            User(
                google_sub=f"google-{n}",
                email=f"user{n}@example.com",
                first_name="Тарас",
                last_name="Шевченко",
                phone="+380671234567",
                birth_date=date(1990, 3, 9),
                city_id=city.id,
            )
            for n in (1, 2, 3)
        )
        session.add_all([owner, volunteer, other_volunteer])
        await session.flush()
        organization = Organization(
            name="Фонд",
            email="fund@example.com",
            phone="+380671234567",
            city_id=city.id,
            created_by=owner.id,
        )
        session.add(organization)
        await session.flush()
        projects = [
            Project(
                organization_id=organization.id,
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
            "owner": owner.id,
            "volunteer": volunteer.id,
            "other_volunteer": other_volunteer.id,
            "project": projects[0].id,
            "other_project": projects[1].id,
        }

    return db(create)


def _attendance(ids: dict[str, int], **changes) -> Attendance:
    fields = {
        "project_id": ids["project"],
        "user_id": ids["volunteer"],
        "hours": Decimal("2"),
        "confirmed_by": ids["owner"],
    } | changes
    return Attendance(**fields)


def _project_feedback(ids: dict[str, int], attendance_id: int, **changes) -> Feedback:
    fields = {
        "attendance_id": attendance_id,
        "target": FeedbackTargetEnum.project,
        "author_id": ids["volunteer"],
        "rating": 5,
    } | changes
    return Feedback(**fields)


def _volunteer_feedback(ids: dict[str, int], attendance_id: int, **changes) -> Feedback:
    fields = {
        "attendance_id": attendance_id,
        "target": FeedbackTargetEnum.volunteer,
        "author_id": ids["owner"],
        "rating": 4,
    } | changes
    return Feedback(**fields)


def _add_all(db, *records: Attendance | Feedback) -> None:
    async def create(session) -> None:
        session.add_all(records)
        await session.flush()

    db(create)


def _violation(db, record: Attendance | Feedback) -> str | None:
    async def create(session) -> str | None:
        with pytest.raises(IntegrityError) as error:
            async with session.begin_nested():
                session.add(record)
                await session.flush()
        return violated_constraint(error.value)

    return db(create)


@pytest.fixture
def attendance_id(db, ids: dict[str, int]) -> int:
    attendance = _attendance(ids)
    _add_all(db, attendance)
    return attendance.id


def test_attendance_keeps_fractional_hours_and_confirmation_time(db, ids: dict[str, int]) -> None:
    attendance = _attendance(ids, hours=Decimal("2.5"))
    _add_all(db, attendance)

    async def reload(session) -> None:
        await session.refresh(attendance)

    db(reload)
    assert attendance.hours == Decimal("2.50")
    # Час зберігається з часовою зоною (NF-08)
    assert attendance.confirmed_at.tzinfo is not None
    assert attendance.updated_at.tzinfo is not None


def test_zero_hours_are_allowed(db, ids: dict[str, int]) -> None:
    # Організатор може підтвердити, що волонтер не прийшов (R-25)
    _add_all(db, _attendance(ids, hours=Decimal("0")))


def test_negative_hours_are_rejected_by_db(db, ids: dict[str, int]) -> None:
    violation = _violation(db, _attendance(ids, hours=Decimal("-0.5")))

    assert violation == "ck_attendances_hours_not_negative"


def test_hours_cannot_be_credited_twice_for_same_project(db, ids: dict[str, int]) -> None:
    _add_all(db, _attendance(ids))

    # Навіть з іншою кількістю годин: виправлення — це зміна запису, а не новий запис (NF-09)
    violation = _violation(db, _attendance(ids, hours=Decimal("1")))

    assert violation == "uq_attendances_project_id_user_id"


def test_attendances_of_other_volunteers_and_projects_do_not_conflict(
    db, ids: dict[str, int]
) -> None:
    _add_all(
        db,
        _attendance(ids),
        _attendance(ids, user_id=ids["other_volunteer"]),
        _attendance(ids, project_id=ids["other_project"]),
    )


@pytest.mark.parametrize(
    ("changes", "constraint"),
    [
        ({"project_id": -1}, "fk_attendances_project_id_projects"),
        ({"user_id": -1}, "fk_attendances_user_id_users"),
        ({"confirmed_by": -1}, "fk_attendances_confirmed_by_users"),
    ],
)
def test_attendance_references_must_exist(
    db, ids: dict[str, int], changes: dict, constraint: str
) -> None:
    assert _violation(db, _attendance(ids, **changes)) == constraint


def _delete_users(session, *user_ids: int):
    # Видаляємо в обхід ORM, щоб спрацював саме ON DELETE SET NULL у БД
    session.expunge_all()
    return session.execute(delete(User).where(User.id.in_(user_ids)))


def test_attendance_and_feedback_are_anonymised_when_volunteer_is_deleted(
    db, ids: dict[str, int], attendance_id: int
) -> None:
    _add_all(db, _project_feedback(ids, attendance_id))

    async def delete_volunteer(session) -> tuple:
        await _delete_users(session, ids["volunteer"])
        attendance = await session.scalar(select(Attendance))
        feedback = await session.scalar(select(Feedback))
        return attendance.user_id, attendance.hours, feedback.author_id, feedback.rating

    # Години й оцінка лишаються в статистиці проєкту, але вже нікому не належать
    assert db(delete_volunteer) == (None, Decimal("2.00"), None, 5)


def test_hours_stay_with_volunteer_when_confirmer_is_deleted(db, ids: dict[str, int]) -> None:
    _add_all(db, _attendance(ids, confirmed_by=ids["other_volunteer"]))

    async def delete_confirmer(session) -> tuple:
        await _delete_users(session, ids["other_volunteer"])
        attendance = await session.scalar(select(Attendance))
        return attendance.user_id, attendance.hours, attendance.confirmed_by

    assert db(delete_confirmer) == (ids["volunteer"], Decimal("2.00"), None)


def test_anonymised_attendances_of_same_project_do_not_conflict(db, ids: dict[str, int]) -> None:
    _add_all(db, _attendance(ids), _attendance(ids, user_id=ids["other_volunteer"]))

    async def delete_volunteers(session) -> int:
        await _delete_users(session, ids["volunteer"], ids["other_volunteer"])
        return await session.scalar(
            select(func.count()).select_from(Attendance).where(Attendance.user_id.is_(None))
        )

    # Унікальність пари (проєкт, волонтер) не зачіпає записи без волонтера
    assert db(delete_volunteers) == 2


def test_both_sides_leave_feedback_for_same_attendance(
    db, ids: dict[str, int], attendance_id: int
) -> None:
    about_project = _project_feedback(ids, attendance_id, comment="Чудова організація")
    about_volunteer = _volunteer_feedback(ids, attendance_id)
    _add_all(db, about_project, about_volunteer)

    assert about_project.comment == "Чудова організація"
    # Коментар необов'язковий: достатньо оцінки
    assert about_volunteer.comment is None
    assert about_project.created_at.tzinfo is not None


@pytest.mark.parametrize("feedback_factory", [_project_feedback, _volunteer_feedback])
def test_second_feedback_from_same_side_is_rejected_by_db(
    db, ids: dict[str, int], attendance_id: int, feedback_factory
) -> None:
    _add_all(db, feedback_factory(ids, attendance_id))

    violation = _violation(db, feedback_factory(ids, attendance_id, rating=1))

    assert violation == "uq_feedbacks_attendance_id_target"


def test_feedback_for_other_attendance_does_not_conflict(
    db, ids: dict[str, int], attendance_id: int
) -> None:
    other_attendance = _attendance(ids, project_id=ids["other_project"])
    _add_all(db, other_attendance)

    _add_all(
        db,
        _project_feedback(ids, attendance_id),
        _project_feedback(ids, other_attendance.id),
    )


@pytest.mark.parametrize("rating", [1, 5])
def test_rating_bounds_are_allowed(
    db, ids: dict[str, int], attendance_id: int, rating: int
) -> None:
    _add_all(db, _project_feedback(ids, attendance_id, rating=rating))


@pytest.mark.parametrize("rating", [0, 6, -1])
def test_rating_out_of_range_is_rejected_by_db(
    db, ids: dict[str, int], attendance_id: int, rating: int
) -> None:
    violation = _violation(db, _project_feedback(ids, attendance_id, rating=rating))

    assert violation == "ck_feedbacks_rating_in_range"


def test_feedback_requires_confirmed_attendance(db, ids: dict[str, int]) -> None:
    # Без запису про підтверджену участь відгук залишити неможливо (R-28)
    violation = _violation(db, _project_feedback(ids, -1))

    assert violation == "fk_feedbacks_attendance_id_attendances"


def test_db_enum_matches_model(db) -> None:
    # Autogenerate не помічає нових значень enum: забуте в міграції значення впало б лише на вставці
    async def values(session) -> list[str]:
        return await session.scalar(text("SELECT enum_range(NULL::feedbacktargetenum)::text[]"))

    assert db(values) == [member.value for member in FeedbackTargetEnum]
