"""Замір каталогу проєктів на тестовому наборі (задача 504: запит каталогу до 300 мс).

Створює набір даних в одній транзакції, міряє запити каталогу й підказок хештегів і
відкочує транзакцію: у БД нічого не лишається, тож запускати можна й на dev-базі.

    docker compose exec api uv run python -m scripts.benchmark_catalog
    docker compose exec api uv run python -m scripts.benchmark_catalog --projects 50000

Вихід з кодом 1, якщо медіана якогось запиту перевищує ліміт.
"""

import argparse
import asyncio
import statistics
import sys
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import engine
from app.models import (
    ExperienceLevelEnum,
    Organization,
    OrganizationMember,
    OrgMemberRoleEnum,
    OrgStatusEnum,
    ProjectCategoryEnum,
    User,
)
from app.schemas.projects import ProjectListItem, ProjectPage
from app.services import projects as service

LIMIT_MS = 300
RUNS = 7

# Проєкти з різними статусами й датами: кожен 10-й — чернетка, ще два з десяти — завершені,
# решта опубліковані з датами від місяця тому до пів року вперед (частина вже минула)
SEED_PROJECTS = text(
    """
    WITH params AS (
        SELECT CAST(:org_ids AS bigint[]) AS orgs, CAST(:city_ids AS int[]) AS cities,
            CAST(:categories AS text[]) AS categories
    )
    INSERT INTO projects (
        organization_id, title, description, starts_at, ends_at, is_online, city_id, address,
        capacity, volunteer_hours, is_adult_only, experience_level, categories, tags, status,
        published_at
    )
    SELECT
        orgs[1 + g % cardinality(orgs)],
        'Проєкт ' || g || ' ' || (ARRAY['толока', 'навчання', 'збір', 'ремонт'])[1 + g % 4],
        repeat('Опис волонтерського проєкту з усіма подробицями події. ', 8) || g,
        starts_at,
        starts_at + make_interval(hours => 2 + g % 70),
        g % 7 = 0,
        CASE WHEN g % 7 = 0 THEN NULL ELSE cities[1 + g % cardinality(cities)] END,
        CASE WHEN g % 7 = 0 THEN NULL ELSE 'вул. Тестова, ' || g END,
        5 + g % 50,
        1 + g % 8,
        g % 4 = 0,
        (enum_range(NULL::experiencelevelenum))[1 + g % 5],
        ARRAY[categories[1 + g % cardinality(categories)]],
        ARRAY['тег_' || (g * 7) % 300, 'тег_' || (g * 13) % 300]
            || CASE WHEN g % 9 = 0 THEN ARRAY['толока'] ELSE ARRAY[]::text[] END,
        CASE WHEN g % 10 = 0 THEN 'draft' WHEN g % 10 IN (1, 2) THEN 'completed'
             ELSE 'published' END::projectstatusenum,
        CASE WHEN g % 10 = 0 THEN NULL ELSE starts_at - interval '14 days' END
    FROM params, generate_series(1, CAST(:count AS int)) AS g,
        LATERAL (
            SELECT now() + make_interval(days => g % 180 - 30, hours => g % 24) AS starts_at
        ) AS dates
    """
)


async def seed(session: AsyncSession, projects: int, organizations: int) -> int:
    """Тестовий набір; повертає id користувача з членством і схваленими заявками."""
    viewer = User(
        email="benchmark@example.com",
        last_name="Тест",
        phone="+380671234567",
        birth_date=date(1990, 1, 1),
    )
    session.add(viewer)
    await session.flush()
    city_ids = list(await session.scalars(text("SELECT id FROM cities ORDER BY id LIMIT 100")))
    orgs = [
        Organization(
            name=f"Фонд {n}",
            email=f"fund{n}@example.com",
            phone="+380679998877",
            city_id=city_ids[n % len(city_ids)],
            status=OrgStatusEnum.approved,
            created_by=viewer.id,
        )
        for n in range(organizations)
    ]
    orgs[0].members.append(OrganizationMember(user_id=viewer.id, role=OrgMemberRoleEnum.member))
    session.add_all(orgs)
    await session.flush()

    await session.execute(
        SEED_PROJECTS,
        {
            "org_ids": [org.id for org in orgs],
            "city_ids": city_ids,
            "categories": [category.value for category in ProjectCategoryEnum],
            "count": projects,
        },
    )
    await session.execute(
        text(
            """
            INSERT INTO join_requests (user_id, target, organization_id, project_id, status)
            SELECT :user_id, 'project', organization_id, id, 'accepted'
            FROM projects WHERE status = 'published' ORDER BY id DESC LIMIT 50
            """
        ),
        {"user_id": viewer.id},
    )
    await session.execute(text("ANALYZE projects"))
    await session.execute(text("ANALYZE join_requests"))
    return viewer.id


async def measure(call: Callable[[], Awaitable[Any]]) -> tuple[float, float]:
    """Медіана й максимум у мілісекундах; перший прогін — прогрів, не враховується."""
    await call()
    timings = []
    for _ in range(RUNS):
        started = time.perf_counter()
        await call()
        timings.append((time.perf_counter() - started) * 1000)
    return statistics.median(timings), max(timings)


async def main(projects: int, organizations: int) -> bool:
    async with engine.connect() as connection:
        await connection.begin()
        try:
            session = AsyncSession(bind=connection, join_transaction_mode="create_savepoint")
            print(f"Тестовий набір: {projects} проєктів, {organizations} організацій...")
            viewer_id = await seed(session, projects, organizations)
            city_id = await session.scalar(
                text("SELECT city_id FROM projects GROUP BY city_id ORDER BY count(*) DESC")
            )
            now = datetime.now(UTC)

            async def page(user_id: int | None = None, **filters: Any) -> int:
                items, total, visible = await service.list_active_projects(
                    session, user_id, limit=12, offset=filters.pop("offset", 0), **filters
                )
                ProjectPage(
                    items=[
                        ProjectListItem.for_viewer(item, show_details=item.id in visible)
                        for item in items
                    ],
                    total=total,
                )
                session.expunge_all()
                return total

            cases: list[tuple[str, Callable[[], Awaitable[Any]]]] = [
                ("Перша сторінка, гість", lambda: page()),
                ("Перша сторінка, учасник", lambda: page(viewer_id)),
                ("Пошук «толока»", lambda: page(search="толока")),
                ("Місто", lambda: page(city_id=city_id)),
                ("Хештег", lambda: page(tags=["тег_7"])),
                ("Сфера", lambda: page(categories=[ProjectCategoryEnum.ecology])),
                (
                    "Проміжок дат",
                    lambda: page(
                        date_from=now + timedelta(days=7), date_to=now + timedelta(days=9)
                    ),
                ),
                (
                    "18+ і рівень",
                    lambda: page(is_adult_only=True, experience_level=ExperienceLevelEnum.amateur),
                ),
                (
                    "Усі фільтри",
                    lambda: page(
                        viewer_id,
                        search="проєкт",
                        city_id=city_id,
                        categories=list(ProjectCategoryEnum)[:5],
                        date_from=now,
                        date_to=now + timedelta(days=60),
                        is_adult_only=False,
                        experience_level=ExperienceLevelEnum.experienced,
                    ),
                ),
                ("Сторінка 400 (offset 4800)", lambda: page(offset=4800)),
                (
                    "Підказки хештегів «тег_1»",
                    lambda: service.suggest_tags(session, "тег_1", limit=10),
                ),
                ("Популярні хештеги", lambda: service.suggest_tags(session, "", limit=10)),
            ]

            ok = True
            print(f"{'Запит':<32}{'медіана, мс':>12}{'макс, мс':>10}")
            for name, call in cases:
                median, worst = await measure(call)
                ok &= median < LIMIT_MS
                mark = "" if median < LIMIT_MS else f"  > {LIMIT_MS} мс"
                print(f"{name:<32}{median:>12.1f}{worst:>10.1f}{mark}")
            return ok
        finally:
            await connection.rollback()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--projects", type=int, default=20_000)
    parser.add_argument("--organizations", type=int, default=500)
    args = parser.parse_args()
    sys.exit(0 if asyncio.run(main(args.projects, args.organizations)) else 1)
