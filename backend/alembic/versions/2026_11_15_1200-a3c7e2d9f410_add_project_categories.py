"""Add project categories and normalize hashtags

Revision ID: a3c7e2d9f410
Revises: 8c0fe1f11554
Create Date: 2026-11-15 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a3c7e2d9f410"
down_revision: str | Sequence[str] | None = "8c0fe1f11554"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Зафіксовано тут, а не імпортовано з моделі: міграція не має змінюватися разом із кодом
CATEGORIES = (
    "ecology",
    "education",
    "children",
    "idp",
    "military",
    "veterans",
    "medicine",
    "mental_health",
    "disability",
    "animals",
    "elderly",
    "social",
    "humanitarian",
    "fundraising",
    "legal",
    "culture",
    "sports",
    "tech",
    "media",
    "rebuild",
    "other",
)
KNOWN_CATEGORIES_SQL = ", ".join(f"'{category}'" for category in CATEGORIES)


def upgrade() -> None:
    """Upgrade schema."""
    # Наявні проєкти отримують «Інше»; server_default потрібен лише для заповнення
    op.add_column(
        "projects",
        sa.Column(
            "categories",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("ARRAY['other']::text[]"),
        ),
    )
    op.alter_column("projects", "categories", server_default=None)
    op.create_check_constraint(
        op.f("ck_projects_categories_count"),
        "projects",
        "cardinality(categories) BETWEEN 1 AND 2",
    )
    op.create_check_constraint(
        op.f("ck_projects_categories_known"),
        "projects",
        f"categories <@ ARRAY[{KNOWN_CATEGORIES_SQL}]::text[]",
    )
    op.create_index(
        "ix_projects_categories",
        "projects",
        ["categories"],
        unique=False,
        postgresql_using="gin",
    )

    # Хештеги тепер у нижньому регістрі, без «#», пробілів і дублікатів, як їх нормалізує
    # схема: інакше старі проєкти не знайдуться фільтром за хештегом
    op.execute(
        """
        UPDATE projects
        SET tags = COALESCE(
            (
                SELECT array_agg(tag ORDER BY first_position)
                FROM (
                    SELECT tag, min(position) AS first_position
                    FROM (
                        SELECT
                            translate(
                                regexp_replace(
                                    lower(btrim(ltrim(btrim(raw_tag), '#'))), '\\s+', '_', 'g'
                                ),
                                '''’',
                                'ʼʼ'
                            ) AS tag,
                            position
                        FROM unnest(tags) WITH ORDINALITY AS t(raw_tag, position)
                    ) AS normalized
                    WHERE tag <> ''
                    GROUP BY tag
                ) AS deduplicated
            ),
            '{}'
        )
        WHERE cardinality(tags) > 0
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Нормалізацію хештегів не відкотити: початкове написання не збереглося, а нормалізовані
    # значення коректні й для попередньої версії
    op.drop_index("ix_projects_categories", table_name="projects", postgresql_using="gin")
    op.drop_constraint(op.f("ck_projects_categories_known"), "projects", type_="check")
    op.drop_constraint(op.f("ck_projects_categories_count"), "projects", type_="check")
    op.drop_column("projects", "categories")
