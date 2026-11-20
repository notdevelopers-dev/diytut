"""Add project_updated notification type

Revision ID: 021fe9d045e3
Revises: 945f3020468b
Create Date: 2026-11-20 10:45:29.560905

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "021fe9d045e3"
down_revision: str | Sequence[str] | None = "945f3020468b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Зафіксовано тут, а не імпортовано з моделі: міграція не має змінюватися разом із кодом
OLD_TYPES = (
    "join_request_received",
    "join_request_cancelled",
    "join_request_accepted",
    "join_request_rejected",
    "project_cancelled",
    "hours_credited",
    "level_up",
    "review_available",
    "organization_approved",
    "organization_rejected",
)


def upgrade() -> None:
    """Upgrade schema."""
    # Нове значення enum автогенерація не бачить. У цій самій транзакції воно не
    # використовується, тож ADD VALUE тут безпечний. Порядок значень у БД — як у моделі
    # (це перевіряє test_db_enum_matches_model): поруч з іншими змінами проєкту
    op.execute(
        "ALTER TYPE notificationtypeenum ADD VALUE IF NOT EXISTS 'project_updated' "
        "AFTER 'project_cancelled'"
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Сповіщенням про зміну проєкту в старій схемі немає відповідника
    op.execute("DELETE FROM notifications WHERE type = 'project_updated'")
    # Значення з enum Postgres не видаляє: тип перестворюємо
    op.execute("ALTER TYPE notificationtypeenum RENAME TO notificationtypeenum_old")
    sa.Enum(*OLD_TYPES, name="notificationtypeenum").create(op.get_bind())
    op.execute(
        "ALTER TABLE notifications ALTER COLUMN type TYPE notificationtypeenum "
        "USING type::text::notificationtypeenum"
    )
    op.execute("DROP TYPE notificationtypeenum_old")
