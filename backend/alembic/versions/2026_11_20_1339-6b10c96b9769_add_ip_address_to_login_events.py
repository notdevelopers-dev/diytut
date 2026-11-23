"""Add IP address to login events

Revision ID: 6b10c96b9769
Revises: 945f3020468b
Create Date: 2026-11-20 13:39:29.486336

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "6b10c96b9769"
down_revision: str | Sequence[str] | None = "945f3020468b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Старі входи лишаються без IP: він не відновлюється
    op.add_column("login_events", sa.Column("ip", postgresql.INET(), nullable=True))


def downgrade() -> None:
    op.drop_column("login_events", "ip")
