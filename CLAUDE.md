# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ДійТут (DiyTut) is a web app that helps volunteers find projects and organizations find volunteers. It is a monorepo:

- `backend/`: FastAPI, async SQLAlchemy 2.0, Alembic, Python 3.14, uv, ruff
- `frontend/`: React 19, TypeScript 7, Vite, React Query, Tailwind 4, Oxlint, Prettier
- repo root: infrastructure (Docker Compose, nginx config in `nginx/conf.d/`, Cloudflare Tunnel)

The detailed docs are in Ukrainian: `README.md`, `backend/README.md` and `frontend/README.md`. Code comments, docs and user-facing UI strings are written in Ukrainian, while the `detail` messages in API errors are in English.

## When this file is wrong

Other developers change the code without always updating this file. If anything here contradicts the code, trust the code, tell the user about the mismatch, and propose a fix to this file.

## Design across the stack

The backend, the frontend and nginx form one system. When you add or change an endpoint, check how the frontend page will call it. When you build a page, check what requests it will make.

- **Request budget.**
  - nginx (`nginx/conf.d/api.conf`) limits each client IP to 10 requests per second with a burst of 20, and to 20 concurrent connections. Requests over the limit get 429. Users who share an IP, such as mobile carrier NAT or an office network, share this budget.
  - The React Query client does not retry 4xx responses, so a 429 shows up as a failed section of the page.
  - A page must load with a small, fixed number of requests, however many items it shows.
- **No per-item requests from lists.** If a catalog or list page would need one request per card or row, the endpoint has the wrong shape. Fix it on the backend:
  - embed the related data the list needs in the list response, for example `organization: {id, name}` in each project;
  - or accept a batch parameter (`?ids=1&ids=2`);
  - or add a dedicated aggregate endpoint.

  On the frontend, never call a data-fetching hook inside a component that is rendered once per list item.
- **No client-side joins over whole collections.** Do not make up for a missing field by fetching an entire other collection and joining it in the browser.
  - Existing example to fix, not copy: `useOrganizationNames` in `frontend/src/features/projects/hooks.ts` fetches up to 100 organizations because `GET /api/projects` returns only `organization_id`. Once there are more than 100 organizations, project cards lose the organization name.
- **Eager loading.** On the backend, load the related rows for a list in the same query, with `joinedload` or `selectinload`, never one query per row.
- **Server-side pagination and filtering.** Lists are paginated on the server (`limit`/`offset`, with a backend maximum). Filtering and search run in SQL, not by downloading everything to the client.
- **Cross-side changes.** If a change on one side requires a change on the other, such as a new or renamed field, a new endpoint, or frontend routes used in `notification.link`, do both. Backend and frontend usually ship as separate `[BE]`/`[FE]` tasks, so if the other side is out of scope, state exactly what it needs to change.

## Running the stack

```bash
docker compose up -d --build                 # db, migrate, api, nginx
docker compose --profile web up -d --build   # plus the Vite dev server
```

- Local development needs no `.env`. `compose.override.yml` loads automatically and does the following:
  - supplies dev defaults
  - sets `DEV_LOGIN=true` and `COOKIE_SECURE=false`
  - mounts `./backend` into the container and runs uvicorn with `--reload`
  - disables `cloudflared`
- Production uses `compose.yml` only (the server's `.env` sets `COMPOSE_FILE=compose.yml`).
- Ports, all bound to 127.0.0.1:
  - API: 8000, with Swagger at `/api/docs`
  - prod-like nginx chain: 8080
  - Postgres: 5432
  - Vite: 5173
- The one-shot `migrate` service runs `alembic upgrade head` before `api` starts. Cities are seeded by a migration.
- Dev login: with `DEV_LOGIN`, `/api/auth/google/login` redirects to `/api/auth/dev/login`, where any email or an existing user can be used.
  - `Settings` (`app/config.py`) refuses to start with `DEV_LOGIN` and `COOKIE_SECURE=true` together.
  - Without `DEV_LOGIN`, empty `GOOGLE_*` values stop startup.

## Backend

All backend tooling runs inside the `api` container. Nothing needs to be installed on the host.

```bash
docker compose exec api uv run pytest                                        # all tests
docker compose exec api uv run pytest tests/test_projects_api.py::test_name  # single test
docker compose exec api uv run ruff check .          # lint (add --fix to autofix)
docker compose exec api uv run ruff format .         # format
docker compose exec api uv run alembic revision --autogenerate -m "short description"
docker compose run --rm migrate                      # apply new migrations
docker compose exec api uv run alembic upgrade <from_rev>:head --sql   # preview SQL, no DB changes
docker compose exec api uv add <pkg>                 # deps only via uv; use --dev for dev-only tools
```

CI (`.github/workflows/ci.yml`) runs these backend checks, and all of them must pass:

- `ruff check .` and `ruff format --check .`
- `alembic upgrade head`, then `alembic check`: the models must match the migrations, with no pending autogenerate diff.
- `alembic downgrade base && alembic upgrade head`: every downgrade must fully undo its upgrade, including `DROP TYPE` for Postgres enums it created.
- `pytest`
- `docker build --target prod`, for both backend and frontend

### Layering

`routers/` → `services/` → `models/`. Pydantic request and response models live in `schemas/`.

- **Routers** are mounted once in `app/routers/__init__.py` under the `/api` prefix, so each router uses paths relative to its group.
  - A router function depends on `DbSessionDep` (`app/db.py`) and, if login is required, `CurrentUserId` (`app/auth.py`, read from the JWT `session` cookie).
  - A public endpoint that shows more to signed-in users, such as drafts to members of their organization, depends on `OptionalUserId` instead: a missing or invalid session counts as a guest, not a 401, because the frontend would redirect a 401 to `/login`.
  - It calls a single service function and returns `Schema.model_validate(result)`.
  - Integer path params use `Path(gt=0, le=MAX_BIGINT)`.
- **Services** hold all queries and business rules and own the transaction: they call `commit()` themselves.
  - They raise HTTP errors directly through the factories in `app/errors.py`, so add new errors there.
  - Field-level errors use `field_error(...)`, which matches FastAPI's 422 shape (`detail: [{type, loc: ["body", field], msg}]`). The frontend's `getApiErrorMessage` depends on that shape.
- **Constraint names** are generated deterministically by `NAMING_CONVENTION` in `app/models/base.py`, so never name constraints by hand.
  - For unique-constraint races, catch `IntegrityError`, roll back, and map the error by `violated_constraint(error)` to a constraint-name constant defined in the service.
- **Row locks**: check-then-write flows (reviews, role or status checks before an update) lock rows with `.with_for_update()` plus `execution_options(populate_existing=True)` before validating.
- **New models**: every new model module must be imported in `app/models/__init__.py`. Otherwise Alembic autogenerate and string-based `relationship()` targets cannot see it.
- **Enums** are Postgres enum types. Adding a value, for example to `NotificationTypeEnum`, needs a migration.
- **Notifications**: `create_notification()` in `app/notifications.py` only adds the row to the session.
  - The caller's `commit()` saves it, so the notification is atomic with the event it reports.
  - The frontend paths stored in `notification.link` come from helper functions in the same file. Change them only together with the matching frontend routes.

### Business rules

`backend/README.md` is the spec for endpoint behavior and domain rules: multiple organizations per user, who may do what, 404 instead of 403, the sign-in flow, notifications, volunteer hours and known limitations. Read the relevant section before you change an endpoint, and update it in the same change.

### Migrations

- Only Alembic changes the schema.
- Autogenerated migrations are drafts: review each one by hand. Alembic reports a rename as drop plus create, which loses data, so rewrite renames manually.
- Never edit a migration that is already on `main`. Make one migration per PR.
- Branches that start from the same head get no git conflict between their migrations, but the second one merged leaves two heads and breaks `alembic upgrade head` in CI.
  - After updating your branch from `main`, run `alembic heads`. If there are two, re-point your unmerged migration's `down_revision` to the head from `main`, so the history stays linear. Anyone who applied the old version locally must downgrade it first: Alembic treats every ancestor of an applied revision as applied.
  - Add a merge migration only when both heads are already on `main`.
- Adding a Postgres enum value: use `ADD VALUE ... AFTER '<value>'` at the same position as in the model, because `test_db_enum_matches_model` compares the order. To remove it in the downgrade, delete the rows that use it (compare as text), then recreate the type from the values read from the DB, not from a fixed list: other branches add their own values.
- File names follow `YYYY_MM_DD_HHMM-<rev>_<slug>.py`. ruff runs automatically on generated files (a post-write hook in `alembic.ini`).

### Tests

- Tests use a real Postgres with migrations applied. Inside the compose stack they reuse the container's `DATABASE_URL`, which is the dev DB.
  - Run them against a DB that holds only what migrations seed (cities). Tests that count rows, such as stats, admin lists and the catalog, fail when other rows were committed outside a test, by a script or by using the app.
- Each test runs inside an outer transaction that is rolled back afterwards. Application `commit()` calls become savepoints, so tests leave no data behind.
- All tests share one session-scoped `TestClient`, and therefore one event loop, because the async engine pool is bound to its loop. pytest-asyncio is not installed.
  - To seed data or query the DB, use the `db` fixture: `db(async_fn)` runs `async_fn(session)` on the app's loop and then commits.
- To authenticate, set a `session` cookie signed with `auth._encode({"sub": str(user_id), "typ": "session"}, auth.SESSION_TTL)` on path `/api`; many test files have a `sign_in` helper for this.
- To mock Google, use the `google_returns` fixture.
- `tests/conftest.py` sets environment variables before importing the app, which is why ruff ignores E402 there.

## Frontend

Run these in `frontend/`. Use Node 24 (`.nvmrc`) and npm only. Alternatively, use the compose `web` profile without installing Node on the host.

```bash
npm ci
npm run dev            # Vite on 5173; proxies /api to $API_PROXY_TARGET (default http://127.0.0.1:8000)
npm run build          # tsc -b && vite build
npm run lint           # oxlint with type-aware rules
npm run format:check   # prettier (no semicolons, single quotes); `npm run format` to fix
npm run typecheck
```

- No frontend test runner is set up. CI requires `format:check`, `lint` and `build` to pass.
- The `typescript` and `oxlint-tsgolint` versions are coupled, so upgrade them together.

### Structure

- `src/app/`: the application shell.
  - `providers.tsx`: ErrorBoundary → QueryClientProvider → ToastProvider.
  - `router.tsx`: every route in one place. Standalone pages (login, registration, org create and edit) sit outside `RootLayout`. `ProtectedRoute` and `AdminRoute` guard routes.
- `src/features/<feature>/`:
  - `api.ts`: plain axios calls
  - `hooks.ts`: React Query hooks and query keys
  - `pages/` and `components/`
  - `types.ts`
  - `index.ts`: a barrel that re-exports with explicit `.ts`/`.tsx` extensions
- Shared code:
  - domain types: `src/types/`
  - shared UI: `src/components/ui` and `src/components/feedback`
  - helpers: `src/lib/`
- `@/` is an alias for `src/`; it is defined in both `vite.config.ts` and `tsconfig.app.json`.

### API access and state

- All requests go through `apiClient` (`src/lib/api-client.ts`), which has base URL `/api` and `withCredentials`.
  - Always use relative paths. In dev the Vite proxy forwards them; in prod nginx serves the site and the API from one origin, so no CORS is configured.
  - `paramsSerializer: { indexes: null }` serializes arrays as `?tags=a&tags=b`, the format FastAPI reads. The default `tags[]=` format would be silently ignored.
  - A global interceptor redirects any 401 to `/login`, except responses from `/auth/me`.
- Session and user state lives in React Query under `AUTH_ME_QUERY_KEY` (`['auth', 'me']`, through `useAuth`). `/auth/me` also returns the user's default organization.
  - Mutations that change memberships or organizations invalidate both `['organizations']` and `AUTH_ME_QUERY_KEY`.
- Query keys are hierarchical arrays that start with the feature name, for example `['organizations', 'detail', id]`, so prefix invalidation works.
- Query client defaults: no retries on 4xx responses, `staleTime` of 30 s, no refetch on window focus.
- Show API errors with `getApiErrorMessage(err, fallback)` from `src/lib/errors.ts`.
- `VITE_*` variables are shipped to the browser, so never put secrets in them.

## Repository conventions

- LF line endings everywhere. Indent is 2 spaces, or 4 for Python (`.editorconfig`). Python line length is 100.
- PR title: the Jira task with its key, for example `SCRUM-<n> [BE] ...` or `SCRUM-<n> [FE] ...`. One PR per task, filled in from `.github/pull_request_template.md`.
- Dependency manifests and lock files are committed together: `pyproject.toml` with `uv.lock`, and `package.json` with `package-lock.json`. Never edit lock files by hand.
