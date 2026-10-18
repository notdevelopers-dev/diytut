# ДійТут

## Технології та інструменти
- **Python 3.14**, **FastAPI**, сервер **uvicorn**
- **SQLAlchemy 2.0** (async, драйвер asyncpg) — робота з БД
- **Alembic** — міграції схеми БД
- **uv** — керування залежностями (`pyproject.toml` + `uv.lock`)
- **ruff** — лінтер і форматер
- **PostgreSQL 18**, **nginx** (reverse proxy з лімітами), **cloudflared** (тунель)
- Фронтенд: **React** + **TypeScript 7**, збирання **Vite**, лінтер **Oxlint** (з перевірками типів), форматер **Prettier**

## Документація

- [Бекенд](backend/README.md) — залежності, ендпоінти, моделі й міграції, лінт, тести
- [Фронтенд](frontend/README.md) — запуск (на машині й у контейнері), скрипти, звернення до API, редактор

## Структура репозиторію

```
.
├── compose.yml              # продакшн-конфігурація всього стеку
├── compose.override.yml     # доповнення для локальної розробки (підхоплюється автоматично)
├── .env.example             # шаблон змінних оточення
├── .editorconfig            # спільні правила відступів і кінців рядків
├── .gitattributes           # LF у репозиторії незалежно від ОС
├── .github/
│   └── dependabot.yml       # автоматичні PR з оновленнями залежностей
├── nginx/
│   └── conf.d/api.conf      # конфіг nginx: проксі на api, ліміти запитів
├── frontend/                # React + TypeScript + Vite
│   ├── Dockerfile           # етап dev (Vite у контейнері)
│   ├── package.json
│   ├── package-lock.json    # точні версії залежностей — комітити завжди
│   ├── .nvmrc               # версія Node.js
│   ├── .oxlintrc.json       # налаштування лінтера
│   ├── .prettierrc.json     # налаштування форматера
│   ├── vite.config.ts       # зокрема проксі /api на бекенд
│   └── src/
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
        ├── routers/         # ендпоінти API (усі під префіксом /api)
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

## Що потрібно встановити

- **Git**
- **Docker** з **Docker Compose v2** (команда `docker compose`, а не `docker-compose`)
- **Node.js 24** — лише для роботи над фронтендом на своїй машині (точна версія — у `frontend/.nvmrc`). Без Node фронтенд можна запускати в контейнері, див. [Фронтенд → Запуск у контейнері](frontend/README.md#запуск-у-контейнері-без-node-на-машині)

Python, uv чи Postgres на свою машину ставити не обов'язково: бекенд повністю працює в контейнерах.

**Windows:** Docker Desktop з бекендом WSL2. Клонуйте репозиторій **всередину файлової системи WSL** (наприклад, `~/projects/`), а не на диск `C:`. Інакше автоперезавантаження коду працюватиме повільно й навантажуватиме процесор. Те саме стосується VM чи подібного: коду бажано лежати у файловій системі VM, а не в спільній теці.

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

   - <http://127.0.0.1:8000/api/health> → `{"status":"ok"}`
   - <http://127.0.0.1:8080/api/health> — те саме, але через nginx
   - <http://127.0.0.1:8000/api/docs> — автодокументація API

Фронтенд запускається окремо — див. [frontend/README.md](frontend/README.md).

### Що працює локально

| Сервіс        | Адреса з вашої машини | Примітка                                   |
|---------------|-----------------------|--------------------------------------------|
| `api`         | `127.0.0.1:8000`      | код примонтовано, `--reload` увімкнено     |
| `nginx`       | `127.0.0.1:8080`      | весь ланцюжок з лімітами                   |
| `db`          | `127.0.0.1:5432`      | для psql, DBeaver тощо                     |
| `cloudflared` | —                     | локально вимкнений (профіль `prod`)        |
| `web`         | `127.0.0.1:5173`      | Vite у контейнері, лише з профілем `web`   |

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

- `TUNNEL_TOKEN` береться в панелі Cloudflare Zero Trust під час створення тунелю. Публічний hostname (домен сайту) у тунелі вказує на `http://nginx:8080`. Сайт і API живуть на одному домені: фронтенд на `/`, API на `/api/`.

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