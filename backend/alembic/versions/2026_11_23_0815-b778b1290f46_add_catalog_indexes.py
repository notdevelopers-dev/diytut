"""Add project catalog indexes

Revision ID: b778b1290f46
Revises: 021fe9d045e3
Create Date: 2026-11-20 12:27:53.851410

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b778b1290f46"
down_revision: str | Sequence[str] | None = "021fe9d045e3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Каталог показує лише опубліковані проєкти, тож індекси часткові
PUBLISHED = "status = 'published'"
# Звичайні індекси: назва → стовпці
BTREE_INDEXES = {
    "ix_projects_catalog_order": ["published_at", "id"],
    "ix_projects_catalog_dates": ["ends_at", "starts_at"],
    "ix_projects_catalog_city": ["city_id"],
}
# Триграмні індекси для пошуку за підрядком: назва → стовпець
TRIGRAM_INDEXES = {
    "ix_projects_catalog_title_trgm": "title",
    "ix_projects_catalog_description_trgm": "description",
}


def upgrade() -> None:
    """Upgrade schema."""
    # pg_trgm входить до contrib офіційного образу postgres; створює власник БД
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    for name, columns in BTREE_INDEXES.items():
        op.create_index(name, "projects", columns, postgresql_where=sa.text(PUBLISHED))
    for name, column in TRIGRAM_INDEXES.items():
        op.create_index(
            name,
            "projects",
            [column],
            postgresql_using="gin",
            postgresql_ops={column: "gin_trgm_ops"},
            postgresql_where=sa.text(PUBLISHED),
        )


def downgrade() -> None:
    """Downgrade schema."""
    for name in [*TRIGRAM_INDEXES, *BTREE_INDEXES]:
        op.drop_index(name, table_name="projects")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
