# Backend Audit Report — MVP-604

**Task:** `[BE] MVP-604: Security, non-functional requirements and quality`  
**Scope:** `NF-03`, `NF-05`, `NF-06`  
**Branch / Base:** `main` (migration head `3266e0eca1a9`)

---

## 1. Executive Summary

| Scope | Focus | Status |
| --- | --- | --- |
| **NF-03** | Authentication, RBAC / ownership isolation, `404`-vs-`403` hiding, row locking, mass-assignment & input bounds | Audited 47 route handlers (46 rows); 3 gaps fixed (`unignore_user` blocked-org check, `GET /api/projects` & `GET /api/projects/{id}` blocked-org visibility, `search` max length 200) |
| **NF-05** | Server-side pagination in all list endpoints & SQL index coverage verified with `EXPLAIN` | Audited all list endpoints; bounded `GET /api/organizations/{id}` (`projects_limit`/`projects_offset`) & `GET /api/users/me/organizations`; added 12 indexes in migration `3266e0eca1a9` |
| **NF-06** | Automated test coverage (`pytest`), static analysis (`ruff`), and reversible sprint migrations (`alembic`) | `ruff check .` & `ruff format --check .` clean; `alembic check` clean; full sprint downgrade/upgrade and `downgrade base && upgrade head` verified; `pytest` passing |

---

## 2. Route Permission Audit (`NF-03`)

All routes mounted under `/api` (`backend/app/routers/__init__.py`) were audited across routers, dependencies, schemas, and services.

### Conventions Verified
- **Auth:** JWT `session` cookie (`HttpOnly`, `SameSite=lax`, `HS256`, `typ="session"` checked against `typ="registration"`) via `CurrentUserId` (`401`) or `OptionalUserId` (invalid token treated as guest on public endpoints).
- **Platform Admin:** `get_current_admin_id` queries `User.platform_role` in PostgreSQL on every request (immediate revocation; deleted user returns `401`).
- **404 vs 403:** Foreign organizations, drafts, join requests, and notifications return `404` to non-members/outsiders to prevent ID enumeration; authenticated members without sufficient role (`member` instead of `owner`/`admin`) or blocked organizations receive `403`.
- **Concurrency:** Check-then-write flows lock rows with `.with_for_update()` + `populate_existing=True` in consistent lock order.
- **Mass Assignment:** Request schemas (`UserUpdate`, `OrganizationCreate`, `OrganizationUpdate`, `ProjectCreate`, `ProjectUpdate`, `JoinRequestCreate`, `JoinRequestReview`, `OrganizationReview`) use `ConfigDict(extra="forbid")`.

### Complete Route Matrix (47 Route Handlers)

| Method & Path | Auth | Permission & Isolation Check | Row Lock / Race Guard | Status |
| --- | --- | --- | --- | --- |
| `GET /api/health` | Public | DB `SELECT 1` liveness | — | OK |
| `GET /api/auth/google/login` | Public | OAuth2 PKCE or redirect to dev login when `DEV_LOGIN=true` (`Settings` forbids `DEV_LOGIN` + `COOKIE_SECURE=true`) | — | OK |
| `GET /api/auth/google/callback` | Public | Verifies OAuth state & `email_verified`; lookup by `google_sub` | — | OK |
| `POST /api/auth/register` | `registration` cookie | Signed short-lived (`30m`) `typ="registration"` token | `uq_users_nickname` `IntegrityError` handled (`409`) | OK |
| `GET /api/auth/me` | Cookie | Verifies `User` exists in DB (`401` if deleted) | — | OK |
| `POST /api/auth/logout` | Public | Clears `session` and `registration` cookies | — | OK |
| `GET/POST /api/auth/dev/login` | `require_dev_login` | Returns `404` when `DEV_LOGIN=false`; HTML escaped | — | OK |
| `GET /api/cities` | Public | Read-only static dictionary (461 cities) | — | OK |
| `GET /api/categories` | Public | Read-only static enum (21 categories) | — | OK |
| `GET /api/stats` | Public | Aggregate counters only (approved orgs, published projects, total hours); 60s TTL cache | — | OK |
| `GET /api/users/me` | `CurrentUserId` | Reads only `user_id` (`404` if deleted) | — | OK |
| `PATCH /api/users/me` | `CurrentUserId` | Updates only `user_id`; `UserUpdate` forbids `platform_role`/`email`/`google_sub` | `FOR UPDATE` on `User` + `uq_users_nickname` | OK |
| `GET /api/users/me/organizations` | `CurrentUserId` | Filters strictly by `OrganizationMember.user_id == user_id` | — | OK (paginated) |
| `GET /api/users/me/project-requests` | `CurrentUserId` | Filters strictly by `JoinRequest.user_id == user_id` | — | OK |
| `POST /api/organizations` | `CurrentUserId` | Verifies `User` exists (`401` if deleted); forces `status=pending`, `role=owner` | `uq_organizations_edrpou` (`409`) | OK |
| `GET /api/organizations` | Public | Filters `Organization.status == approved`; `OrganizationListItem` excludes `reviewed_*`/`edrpou` | — | OK |
| `GET /api/organizations/me` | `CurrentMembership` | Any member of selected `?organization_id=` (`404` if not member) | — | OK |
| `PATCH /api/organizations/me` | `EditorMembership` | `owner`/`admin` only (`403`), not `blocked` (`403`); `name`/`edrpou` forbidden | `FOR UPDATE` on membership + org | OK |
| `GET /api/organizations/me/projects` | `CurrentMembership` | Any member of selected org sees all statuses (`404` if not member) | — | OK |
| `GET /api/organizations/me/join-requests` | `CurrentUserId` + `require_request_reviewer` | `owner`/`admin` only (`403` for `member`, `404` if not member) | — | OK |
| `GET /api/organizations/me/ignored-users` | `CurrentUserId` + `require_request_reviewer` | `owner`/`admin` only (`403` for `member`, `404` if not member) | — | OK |
| `DELETE /api/organizations/me/ignored-users/{id}` | `EditorMembership` | **Fixed:** upgraded from `require_request_reviewer` to `EditorMembership` (`403` if `blocked`, `403` if `member`, `404` if not member) | `FOR UPDATE` on membership + org | Fixed |
| `GET /api/organizations/{id}` | Public | `Organization.status == approved` (`404` otherwise); published projects only; no member PII | — | Fixed (paginated) |
| `POST /api/organizations/{id}/join-requests` | `CurrentUserId` | Verifies `User` exists (`401`); org `approved` (`404`); not member (`409`); no pending req (`409`) | Partial unique index `uq_join_requests_pending_user_organization` | OK |
| `GET /api/organizations/{id}/my-request-status` | `CurrentUserId` | Own latest request only (`user_id == user_id`, `404` if none) | — | OK |
| `PATCH /api/join-requests/{id}` | `CurrentUserId` | Membership in `join_request.organization_id` (`404` if not member); `owner`/`admin` (`403`); not `blocked` (`403`); checks `pending` (`409`), project open/requirements/capacity | `FOR UPDATE` on `JoinRequest`, membership+org, `Project` | OK |
| `GET /api/projects` | Public | **Fixed:** `Organization.status == approved` joined + `search` bounded to `max_length=200` | — | Fixed |
| `GET /api/projects/my-request-statuses` | `CurrentUserId` | Own requests only (`user_id == user_id`); `project_id` list bounded (`1..100`) | — | OK |
| `GET /api/projects/{id}` | `OptionalUserId` | **Fixed:** non-members only see `published` projects of `approved` orgs (`404` otherwise); org members see all statuses | — | Fixed |
| `POST /api/projects` | `CurrentUserId` | `owner`/`admin` (`403`), not `blocked` (`403`); `approved` required to publish (`403`) | `FOR UPDATE` on membership + org | OK |
| `PATCH /api/projects/{id}` | `CurrentUserId` | `owner`/`admin` (`403`), not `blocked` (`403`), non-member `404`; checks `capacity >= accepted` & participant requirements | `FOR UPDATE` on membership+org, then `Project` | OK |
| `POST /api/projects/{id}/publish` | `CurrentUserId` | `owner`/`admin` (`403`), not `blocked` (`403`), `approved` (`403`), `draft` (`409`), non-member `404` | `FOR UPDATE` on membership+org, then `Project` | OK |
| `POST /api/projects/{id}/join-requests` | `CurrentUserId` | `User` exists (`401`); `published` + `approved` org (`404`); not organizer (`409`); not ignored (`403`); reapply backoff (`429`); age/level (`403`); capacity (`409`) | Partial unique index `uq_join_requests_active_user_project` | OK |
| `GET /api/projects/{id}/join-requests` | `CurrentUserId` | `owner`/`admin` of project org (`403` for `member`, `404` if not member) | — | OK |
| `GET /api/projects/{id}/my-request-status` | `CurrentUserId` | Own latest request only (`user_id == user_id`, `404` if none) | — | OK |
| `DELETE /api/projects/{id}/my-request` | `CurrentUserId` | Own active request only (`user_id == user_id`, `404` if none); before `starts_at` (`409`) | `FOR UPDATE OF join_requests` | OK |
| `GET /api/notifications` | `CurrentUserId` | `Notification.user_id == user_id` | — | OK |
| `GET /api/notifications/unread-count` | `CurrentUserId` | `Notification.user_id == user_id` | — | OK |
| `POST /api/notifications/read-all` | `CurrentUserId` | Updates only `Notification.user_id == user_id` | — | OK |
| `PATCH /api/notifications/{id}/read` | `CurrentUserId` | Filters `id == notification_id AND user_id == user_id` (`404` if foreign) | — | OK |
| `GET /api/admin/organizations` | `CurrentAdminId` | DB check `platform_role == admin` (`401`/`403`); `search` max 200 | — | OK |
| `GET /api/admin/organizations/{id}` | `CurrentAdminId` | DB check `platform_role == admin` (`401`/`403`) | — | OK |
| `POST /api/admin/organizations/{id}/review` | `CurrentAdminId` | DB check `platform_role == admin` (`401`/`403`); `pending` only (`409`) | `FOR UPDATE` on `Organization` | OK |
| `GET /api/admin/stats` | `CurrentAdminId` | DB check `platform_role == admin` (`401`/`403`) | — | OK |
| `GET /api/admin/stats/logins` | `CurrentAdminId` | DB check `platform_role == admin` (`401`/`403`); max 366 days (`422`) | — | OK |
| `GET /api/admin/stats/logins/recent` | `CurrentAdminId` | DB check `platform_role == admin` (`401`/`403`) | — | OK |

---

## 3. List Pagination & Database Index Audit (`NF-05`)

### List Endpoints Inventory

| Endpoint | Pagination Params | Max Page Size | Total Count | Deterministic Order |
| --- | --- | --- | --- | --- |
| `GET /api/organizations` | `limit=20, offset=0` | `100` | — | `created_at DESC, id DESC` |
| `GET /api/organizations/{id}` (`projects`) | `projects_limit=20, projects_offset=0` | `100` | — | `published_at DESC, id DESC` |
| `GET /api/organizations/me/projects` | `limit=20, offset=0` | `100` | `total` | `created_at DESC, id DESC` |
| `GET /api/organizations/me/join-requests` | `limit=20, offset=0` | `100` | — | `created_at ASC, id ASC` |
| `GET /api/organizations/me/ignored-users` | `limit=20, offset=0` | `100` | — | `created_at DESC, user_id DESC` |
| `GET /api/projects` | `limit=20, offset=0` | `100` | — | `published_at DESC, id DESC` |
| `GET /api/projects/{id}/join-requests` | `limit=20, offset=0` | `100` | — | `created_at ASC, id ASC` |
| `GET /api/users/me/organizations` | `limit=100, offset=0` | `100` | — | `joined_at ASC, organization_id ASC` |
| `GET /api/users/me/project-requests` | `limit=20, offset=0` | `100` | — | `created_at DESC, id DESC` |
| `GET /api/notifications` | `limit=50, offset=0` | `50` | — | `created_at DESC, id DESC` |
| `GET /api/admin/organizations` | `limit=20, offset=0` | `100` | `total` | `created_at ASC, id ASC` |
| `GET /api/admin/stats/logins/recent` | `limit=20, offset=0` | `100` | `total` | `created_at DESC, id DESC` |
| `GET /api/cities` | Bounded static table (461 rows) | 461 | — | `name COLLATE "uk-x-icu"` |
| `GET /api/categories` | Bounded static enum (21 items, cached 1h) | 21 | — | Insertion order |

### Indexes Added & `EXPLAIN ANALYZE` Results

Before migration `3266e0eca1a9`, `EXPLAIN` on list queries produced `Seq Scan` + `Sort` on `projects`, `organizations`, `join_requests`, `notifications`, and `Incremental Sort` on `login_events`.

Migration `3266e0eca1a9` added 12 targeted composite / partial indexes:
- `projects`: `ix_projects_published_at_id`, `ix_projects_org_created_at_id`, `ix_projects_org_published_at_id`
- `organizations`: `ix_organizations_status_created_at_id`, `ix_organizations_approved_city_created_at_id`, `ix_organizations_created_at_id`
- `join_requests`: `ix_join_requests_user_project_created`, `ix_join_requests_project_status_created`, `ix_join_requests_org_pending_created`
- `notifications`: `ix_notifications_user_created_id`
- `login_events`: `ix_login_events_created_at_id`
- `organization_ignored_users`: `ix_organization_ignored_users_org_created_user`

Seeded `EXPLAIN ANALYZE` (500 users, 500 organizations, 1,000 projects, 1,000 notifications, 1,000 login events in a rolled-back transaction) confirmed index usage across all list queries (`0.138 ms`–`0.555 ms` execution time):
- `GET /api/projects`: `Index Scan using ix_projects_published_at_id` + `Memoize -> Index Scan using pk_organizations` (`0.555 ms`, zero sort).
- `GET /api/organizations`: `Index Scan Backward using ix_organizations_created_at_id` (`0.138 ms`) / `ix_organizations_status_created_at_id` (`0.167 ms`).
- `GET /api/notifications`: `Index Only Scan using ix_notifications_user_created_id` (`0.496 ms`, zero sort).
- `GET /api/admin/stats/logins/recent`: `Index Only Scan using ix_login_events_created_at_id` (`0.145 ms`, zero incremental sort).
- `GET /api/organizations/me/join-requests`, `GET /api/projects/{id}/join-requests`, `GET /api/users/me/project-requests`: `Index Only Scan` on their respective partial indexes with `enable_seqscan = off`.

---

## 4. Sprint Migrations Upgrade & Downgrade Verification (`NF-06`)

All sprint migrations from `5c9f9a7571e5` through `3266e0eca1a9` were tested with both:
1. Step-down to `2da594f611c3` and re-upgrade to `head`:
   - `3266e0eca1a9` (`add list query indexes`)
   - `021fe9d045e3` (`Add project_updated notification type`)
   - `6b10c96b9769` (`Add IP address to login events`)
   - `945f3020468b` (`Allow incomplete project drafts and record publication time`)
   - `b37cf69c01b1` (`Add project join request cancellation and ignored users`)
   - `a3c7e2d9f410` (`Add project categories and normalize hashtags`)
   - `8c0fe1f11554` (`Allow several organizations per user`)
   - `5c9f9a7571e5` (`Add attendances and feedbacks`)
2. Full `alembic downgrade base && alembic upgrade head` followed by `alembic check` (`No new upgrade operations detected.`).

---

## 5. Quality Verification (`pytest` & `ruff`)

- `uv run ruff check .` — passed with 0 errors.
- `uv run ruff format --check .` — passed (`97 files already formatted`).
- `uv run alembic check` — passed (`No new upgrade operations detected.`).
- `uv run pytest` — **813 passed** (including `tests/test_security_audit.py`).

### Follow-Up Notes
- **Frontend (`[FE]`):** `OrganizationViewPage.tsx` calls `GET /api/organizations/{id}` with the default `projects_limit=20` and `OrganizationDetailRead` does not expose `projects_total`; organizations with >20 published projects will truncate at 20 on the public org page until a follow-up `[FE]`/`[BE]` pagination task is added.
- **Stats consistency:** `app/services/stats.py` (`_is_active_project`) counts `Project.status == published` without joining `Organization.status == approved`; if an approved organization with active projects is blocked, `GET /api/stats` continues counting its projects while `GET /api/projects` hides them.
