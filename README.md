# ДійТут

## Технології та інструменти
- Python 3.14, FastAPI, сервер uvicorn
- SQLAlchemy 2.0 (async, драйвер asyncpg) — робота з БД
- Alembic — міграції схеми БД
- uv — керування залежностями (pyproject.toml + uv.lock)
- ruff — лінтер і форматер
- PostgreSQL 18, nginx (reverse proxy з лімітами), cloudflared (тунель)

## Структура репозиторію

```
.
├── compose.yml              # продакшн-конфігурація всього стеку
├── compose.override.yml     # доповнення для локальної розробки
├── .env.example             # шаблон змінних оточення
├── nginx/
│   └── conf.d/api.conf      # конфіг nginx: проксі на api, ліміти запитів
└── backend/
    ├── Dockerfile           # етапи: dev (розробка) і prod (продакшн)
    ├── pyproject.toml       # залежності та налаштування ruff
    ├── uv.lock              # точні версії всіх залежностей — комітити завжди
    ├── alembic.ini
    ├── alembic/
    │   ├── env.py
    │   └── versions/        # файли міграцій
    └── app/
        ├── main.py          # застосунок FastAPI
        ├── config.py        # налаштування зі змінних оточення
        ├── db.py            # підключення до БД, сесії
        └── models/          # моделі SQLAlchemy
```

## Як працює сервер (спрощено)

```mermaid
flowchart LR
    user(["Користувач"]) -->|HTTPS| cf["Cloudflare"]

    subgraph server["Сервер (без відкритих портів)"]
        cloudflared["cloudflared"] <--> nginx["Nginx"]
        nginx <--> api["FastAPI"]
        api <--> db[("PostgreSQL")]
        front[/"Фронтенд"/] -.-> nginx
    end

    cloudflared <--> cf
    cf --> cloudflared
```

Сервер не має відкритих портів: `cloudflared` сам підключається до Cloudflare, і запити приходять назад через цей тунель. PostgreSQL знаходиться в ізольованій мережі без доступу до інтернету, до неї має доступ лише FastAPI.

## Локальна розробка
1. Склонувати репозиторій і перейти в нього:

   ```bash
   git clone git@github.com:notdevelopers-dev/diytut.git
   cd diytut
   ```

2. Створити `.env` із шаблону:

   ```bash
   cp .env.example .env
   ```

   і заповнити;

3. Зібрати й запустити:

   ```bash
   docker compose up -d --build
   ```

4. Застосувати міграції:

   ```bash
   docker compose exec api alembic upgrade head
   ```

5. Перевірити:

   - <http://127.0.0.1:8000/health> → `{"status":"ok"}`
   - <http://127.0.0.1:8080/health> — те саме, але через nginx
   - <http://127.0.0.1:8000/docs> — автодокументація API

### Що працює локально

| Сервіс        | Адреса з вашої машини | Примітка                                   |
|---------------|-----------------------|--------------------------------------------|
| `api`         | `127.0.0.1:8000`      | код примонтовано, `--reload` увімкнено     |
| `nginx`       | `127.0.0.1:8080`      | весь ланцюжок з лімітами                   |
| `db`          | `127.0.0.1:5432`      | для psql, DBeaver тощо                     |
| `cloudflared` | —                     | локально вимкнений (профіль `prod`)        |

## Щоденна робота

```bash
docker compose up -d            # запустити
docker compose logs -f api      # логи бекенду
docker compose restart api      # перезапустити бекенд
docker compose down             # зупинити (дані БД зберігаються)
docker compose up -d --build    # перезібрати після зміни Dockerfile чи залежностей
```

> ⚠️ `docker compose down -v` видаляє том з даними БД. Використовуйте лише тоді, коли свідомо хочете почати з порожньої бази.

Зміни в `.py`-файлах підхоплюються автоматично, перезапускати нічого не треба.

### Консоль бази даних

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

## Production

### Особливості сервера

- `compose.override.yml` на сервері застосовуватися не повинен. У серверному `.env` має бути рядок:

  ```dotenv
  COMPOSE_FILE=compose.yml
  ```

- `.env` на сервер копіюється вручну і закривається від інших користувачів:

  ```bash
  chmod 600 .env
  ```

- `TUNNEL_TOKEN` береться в панелі Cloudflare Zero Trust під час створення тунелю. Публічний hostname у тунелі вказує на `http://nginx:8080`; доменне ім'я має збігатися з `server_name` у `nginx/conf.d/api.conf`.

### Розгортання

```bash
git pull
docker compose up -d --build
docker compose run --rm api alembic upgrade head
```

### Зміни конфігурації nginx

```bash
docker compose exec nginx nginx -t           # перевірити синтаксис
docker compose exec nginx nginx -s reload    # застосувати без перезапуску
```

Якщо `nginx -t` знайде помилку, старий конфіг продовжить працювати.
