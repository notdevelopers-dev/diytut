"""Add project cover photo

Revision ID: 33e80de69611
Revises: 945f3020468b
Create Date: 2026-11-22 10:02:01.547199

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "33e80de69611"
down_revision: str | Sequence[str] | None = "945f3020468b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Шлях до файлу обкладинки відносно MEDIA_ROOT (R-13)
    op.add_column("projects", sa.Column("cover_key", sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    # Самі файли в MEDIA_ROOT лишаються: міграція змінює лише схему
    op.drop_column("projects", "cover_key")
