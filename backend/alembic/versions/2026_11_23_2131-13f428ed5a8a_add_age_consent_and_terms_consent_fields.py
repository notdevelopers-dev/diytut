"""add age consent and terms consent fields

Revision ID: 13f428ed5a8a
Revises: 021fe9d045e3
Create Date: 2026-11-23 21:31:31.161319

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "13f428ed5a8a"
down_revision: str | Sequence[str] | None = "021fe9d045e3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "users",
        sa.Column(
            "parental_consent", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "terms_consent_date", sa.Date(), server_default=sa.text("CURRENT_DATE"), nullable=False
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "personal_data_consent_date",
            sa.Date(),
            server_default=sa.text("CURRENT_DATE"),
            nullable=False,
        ),
    )
    # Для наявних користувачів фіксуємо згоду датою створення акаунту
    op.execute(
        "UPDATE users SET terms_consent_date = created_at::date, "
        "personal_data_consent_date = created_at::date WHERE created_at IS NOT NULL"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "personal_data_consent_date")
    op.drop_column("users", "terms_consent_date")
    op.drop_column("users", "parental_consent")
