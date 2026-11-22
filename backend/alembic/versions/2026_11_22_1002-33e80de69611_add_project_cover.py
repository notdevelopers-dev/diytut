"""Add project cover photo and notification about its removal

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

NEW_NOTIFICATION_TYPE = "project_photo_removed"


def upgrade() -> None:
    """Upgrade schema."""
    # Шлях до файлу обкладинки відносно MEDIA_ROOT (R-13)
    op.add_column("projects", sa.Column("cover_key", sa.Text(), nullable=True))
    # Нове значення enum автогенерація не бачить. У цій самій транзакції воно не
    # використовується, тож ADD VALUE тут безпечний. Порядок значень у БД — як у моделі
    # (це перевіряє test_db_enum_matches_model): у кінці, після рішень адміністратора
    op.execute(
        f"ALTER TYPE notificationtypeenum ADD VALUE IF NOT EXISTS '{NEW_NOTIFICATION_TYPE}' "
        "AFTER 'organization_rejected'"
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Сповіщенням про видалення фото в старій схемі немає відповідника. Порівняння як тексту:
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

    # Самі файли в MEDIA_ROOT лишаються: міграція змінює лише схему
    op.drop_column("projects", "cover_key")
