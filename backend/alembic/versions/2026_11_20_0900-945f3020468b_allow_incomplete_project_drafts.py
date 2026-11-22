"""Allow incomplete project drafts and record publication time

Revision ID: 945f3020468b
Revises: b37cf69c01b1
Create Date: 2026-11-20 09:00:22.210313

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "945f3020468b"
down_revision: str | Sequence[str] | None = "b37cf69c01b1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Поля, без яких проєкт не опублікувати; у чернетці вони можуть бути порожніми
DRAFT_OPTIONAL_COLUMNS = {
    "description": sa.Text(),
    "starts_at": sa.DateTime(timezone=True),
    "ends_at": sa.DateTime(timezone=True),
    "capacity": sa.Integer(),
    "volunteer_hours": sa.Numeric(precision=5, scale=2),
}
# Зафіксовано тут, а не імпортовано з моделі: міграція не має змінюватися разом із кодом
MAX_CATEGORIES = 2


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("projects", sa.Column("published_at", sa.DateTime(timezone=True), nullable=True))
    # Справжній час публікації наявних проєктів невідомий: досі проєкт публікувався одразу
    # під час створення
    op.execute("UPDATE projects SET published_at = created_at WHERE status <> 'draft'")

    for column, type_ in DRAFT_OPTIONAL_COLUMNS.items():
        op.alter_column("projects", column, existing_type=type_, nullable=True)

    op.create_check_constraint(
        op.f("ck_projects_complete_unless_draft"),
        "projects",
        "status = 'draft' OR (description IS NOT NULL AND starts_at IS NOT NULL"
        " AND ends_at IS NOT NULL AND capacity IS NOT NULL AND volunteer_hours IS NOT NULL"
        " AND published_at IS NOT NULL)",
    )
    op.drop_constraint(op.f("ck_projects_offline_has_location"), "projects", type_="check")
    op.create_check_constraint(
        op.f("ck_projects_offline_has_location"),
        "projects",
        "status = 'draft' OR is_online OR (city_id IS NOT NULL AND address IS NOT NULL)",
    )
    op.drop_constraint(op.f("ck_projects_categories_count"), "projects", type_="check")
    op.create_check_constraint(
        op.f("ck_projects_categories_count"),
        "projects",
        f"cardinality(categories) <= {MAX_CATEGORIES}"
        " AND (status = 'draft' OR cardinality(categories) >= 1)",
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Чернетки, яким бракує полів, у попередній схемі зберегти не можна, а вигадані значення
    # потім пройшли б перевірку під час публікації. Попередня версія чернеток і не показувала,
    # тож їх видаляємо
    op.execute(
        """
        DELETE FROM projects
        WHERE status = 'draft'
          AND (
            description IS NULL
            OR starts_at IS NULL
            OR ends_at IS NULL
            OR capacity IS NULL
            OR volunteer_hours IS NULL
            OR NOT (is_online OR (city_id IS NOT NULL AND address IS NOT NULL))
            OR cardinality(categories) = 0
          )
        """
    )

    op.drop_constraint(op.f("ck_projects_categories_count"), "projects", type_="check")
    op.create_check_constraint(
        op.f("ck_projects_categories_count"),
        "projects",
        f"cardinality(categories) BETWEEN 1 AND {MAX_CATEGORIES}",
    )
    op.drop_constraint(op.f("ck_projects_offline_has_location"), "projects", type_="check")
    op.create_check_constraint(
        op.f("ck_projects_offline_has_location"),
        "projects",
        "is_online OR (city_id IS NOT NULL AND address IS NOT NULL)",
    )
    op.drop_constraint(op.f("ck_projects_complete_unless_draft"), "projects", type_="check")

    for column, type_ in DRAFT_OPTIONAL_COLUMNS.items():
        op.alter_column("projects", column, existing_type=type_, nullable=False)
    op.drop_column("projects", "published_at")
