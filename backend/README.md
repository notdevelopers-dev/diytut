# Бекенд

Python 3.14 + FastAPI + SQLAlchemy 2.0 + Alembic. Як підняти весь стек локально — у [головному README](../README.md#локальна-розробка).

Усі команди нижче виконуються з кореня репозиторію, а не з теки `backend/`.

## Консоль бази даних

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

## Залежності (uv)

Усі команди виконуються в контейнері `api`:

```bash
docker compose exec api uv add httpx              # додати залежність
docker compose exec api uv add --dev pytest-cov   # додати залежність лише для розробки
docker compose exec api uv remove httpx           # видалити
docker compose exec api uv lock --upgrade         # оновити всі версії в межах обмежень
```

- Не редагуйте `uv.lock` руками. Його веде тільки uv.
- Комітьте `pyproject.toml` і `uv.lock` разом. Продакшн-образ збирається з `--locked` і впаде, якщо вони не збігаються.
- Залежності для розробки (`ruff`, `pytest` тощо) — лише через `--dev`.

## Ендпоінти

Усі маршрути API живуть під префіксом `/api`, який задано в одному місці — `backend/app/routers/__init__.py`. Фронтенд звертається до API лише за відносним шляхом `/api/...`.

### Додати групу ендпоінтів

1. Створити файл у `backend/app/routers/`, наприклад `volunteers.py`:

   ```python
   from fastapi import APIRouter

   from app.db import SessionDep

   router = APIRouter(prefix="/volunteers", tags=["volunteers"])


   @router.get("")
   async def list_volunteers(session: SessionDep) -> list[dict]:
       ...
   ```

2. Підключити його в `backend/app/routers/__init__.py`:

   ```python
   from app.routers import health, volunteers

   api_router.include_router(volunteers.router)
   ```

   Після цього ендпоінт доступний за адресою `/api/volunteers`.

## Моделі та міграції

### Додати модель

1. Створити файл у `backend/app/models/`, наприклад `volunteer.py`:

   ```python
   from sqlalchemy import String
   from sqlalchemy.orm import Mapped, mapped_column

   from app.models.base import Base


   class Volunteer(Base):
       __tablename__ = "volunteer"

       id: Mapped[int] = mapped_column(primary_key=True)
       full_name: Mapped[str] = mapped_column(String(200))
       city: Mapped[str | None] = mapped_column(String(100))
   ```

2. Імпортувати її в `backend/app/models/__init__.py`:

   ```python
   from app.models.volunteer import Volunteer
   ```

   Alembic бачить лише імпортовані моделі.

### Створити й застосувати міграцію

```bash
docker compose exec api alembic revision --autogenerate -m "add volunteer"
# ⬆ переглянути згенерований файл у backend/alembic/versions/
docker compose exec api alembic upgrade head
```

Корисне:

```bash
docker compose exec api alembic current        # поточна версія схеми в БД
docker compose exec api alembic history        # список міграцій
docker compose exec api alembic downgrade -1   # відкотити останню міграцію
docker compose exec api alembic upgrade head --sql   # показати SQL, нічого не виконуючи
```

### Щодо міграцій БД

- Завжди переглядайте згенеровану міграцію перед комітом. Autogenerate — це чернетка, а не готовий результат.
- Перейменування Alembic не розпізнає. Перейменування колонки він подасть як «видалити стару + додати нову», і дані зникнуть. Такі місця виправляйте вручну на `op.alter_column(..., new_column_name="...")`, а таблиці — на `op.rename_table(...)`.
- Не використовуйте `Base.metadata.create_all()` у коді застосунку. Схемою керує лише Alembic.
- Не змінюйте міграції, які вже потрапили в `main`. Потрібна зміна — нова міграція.
- Одна міграція на PR, і перед злиттям підтягніть свіжий `main`. Якщо двоє паралельно створили міграції, після злиття з'являться дві «голови», і `alembic upgrade head` відмовиться працювати. Тоді:

  ```bash
  docker compose exec api alembic merge heads -m "merge heads"
  ```

- Імена індексів і обмежень генеруються автоматично за naming convention у `app/models/base.py`. Задавати їх вручну не потрібно.

## Лінт і форматування

```bash
docker compose exec api uv run ruff check .          # знайти проблеми
docker compose exec api uv run ruff check --fix .    # виправити те, що можна автоматично
docker compose exec api uv run ruff format .         # відформатувати код
```

Перед комітом коду бажано проходити `ruff check .` і `ruff format --check .` без помилок.

## Тести

```bash
docker compose exec api uv run pytest
```