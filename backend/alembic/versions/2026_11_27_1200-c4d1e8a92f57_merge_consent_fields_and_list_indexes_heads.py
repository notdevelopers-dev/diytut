"""Merge consent fields and list indexes heads

Revision ID: c4d1e8a92f57
Revises: 13f428ed5a8a, 3266e0eca1a9
Create Date: 2026-11-27 12:00:00.000000

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "c4d1e8a92f57"
down_revision: str | Sequence[str] | None = ("13f428ed5a8a", "3266e0eca1a9")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
