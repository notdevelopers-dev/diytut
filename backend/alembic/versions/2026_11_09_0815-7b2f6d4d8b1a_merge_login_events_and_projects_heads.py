"""Merge login events and projects heads

Revision ID: 7b2f6d4d8b1a
Revises: e980413464e2, 29294c411422
Create Date: 2026-11-09 08:15:00.000000

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "7b2f6d4d8b1a"
down_revision: str | Sequence[str] | None = ("e980413464e2", "29294c411422")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
