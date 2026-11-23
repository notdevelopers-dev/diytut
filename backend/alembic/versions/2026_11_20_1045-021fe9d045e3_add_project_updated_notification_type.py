"""Add project_updated notification type

Revision ID: 021fe9d045e3
Revises: 6b10c96b9769
Create Date: 2026-11-20 10:45:29.560905

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "021fe9d045e3"
down_revision: str | Sequence[str] | None = "6b10c96b9769"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NEW_NOTIFICATION_TYPE = "project_updated"


def upgrade() -> None:
    """Upgrade schema."""
    # Нове значення enum автогенерація не бачить. У цій самій транзакції воно не
    # використовується, тож ADD VALUE тут безпечний. Порядок значень у БД — як у моделі
    # (це перевіряє test_db_enum_matches_model): поруч з іншими змінами проєкту
    op.execute(
        f"ALTER TYPE notificationtypeenum ADD VALUE IF NOT EXISTS '{NEW_NOTIFICATION_TYPE}' "
        "AFTER 'project_cancelled'"
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Сповіщенням про зміну проєкту в старій схемі немає відповідника. Порівняння як тексту:
    # порівняння з enum впало б, якби значення в типі вже не було
    op.execute(f"DELETE FROM notifications WHERE type::text = '{NEW_NOTIFICATION_TYPE}'")
    # Значення з enum Postgres не видаляє: тип перестворюємо. Решту значень беремо з БД, а не
    # фіксуємо тут: паралельні гілки додають свої типи, і після злиття міграцій порядок їх
    # застосування може бути будь-яким
    bind = op.get_bind()
    old_types = [
        value
        for value in bind.execute(
            sa.text("SELECT unnest(enum_range(NULL::notificationtypeenum))::text")
        ).scalars()
        if value != NEW_NOTIFICATION_TYPE
    ]
    op.execute("ALTER TYPE notificationtypeenum RENAME TO notificationtypeenum_old")
    sa.Enum(*old_types, name="notificationtypeenum").create(bind)
    op.execute(
        "ALTER TABLE notifications ALTER COLUMN type TYPE notificationtypeenum "
        "USING type::text::notificationtypeenum"
    )
    op.execute("DROP TYPE notificationtypeenum_old")
