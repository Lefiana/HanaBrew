# HanaBrew 🌸☕

A cozy, modular, AI-driven productivity desktop: sakura blossoms, coffee-shop colours and a
desktop-style workspace in your browser. This repository is a **modular monolith** with an
API-first design (Next.js frontend, NestJS API, PostgreSQL).

## Status

| Milestone                                                                                 | State                                                                |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **M0** Foundation (monorepo, API, DB, auth, Docker)                                       | ✅ implemented; see "Verification status"                            |
| **M1** Desktop environment (themes, shell, dock, launcher, window manager, mobile layout) | ✅ implemented; see "Verification status"                            |
| M2 Tasks, Calendar, Projects                                                              | ⏳ not started. The apps exist only as clearly labelled placeholders |
| M3 HanaAI + chibi companion                                                               | ⏳ not started                                                       |
| M4 Journal + memory                                                                       | ⏳ not started                                                       |

**What works today:** sign up / sign in with a username; a private personal workspace; two themes;
a desktop with draggable/resizable windows, dock, launcher (Ctrl/⌘ K) and a responsive mobile layout; and, new in M2:

- **HanaTasks**: create/edit/delete, complete, status, priority, due date, description, tags, project link;
  search, filter (view, priority, project, tag) and sort; quick-add; overall progress. The whole task card opens the task.
  **Completed tasks are locked** (read-only); the only way to change one is an explicit, confirmed **Reopen**.
- **HanaCalendar**: month, week and day views; timed and all-day events; categories; time-zone aware;
  **task due dates and project deadlines** shown alongside events (click one to open it).
- **HanaProjects**: projects with status and dates, archive/restore, linked tasks (added with the full task form, project preselected),
  **progress calculated from real task records** (cancelled tasks aren't counted).
- **Dashboard widgets** (desktop side panel and mobile home): task progress ring, due soon, coming up, projects in flight, all computed by the API.
- **Settings**: theme, motion, **time zone**, account.

**Not built yet:** HanaAI chat and the chibi companion (M3), journal and memory (M4).

## Stack

Next.js 16 · React 19 · TypeScript 6 · Tailwind CSS 4 · Motion · Zustand · TanStack Query ·
NestJS 12 · Better Auth (via `@thallesp/nestjs-better-auth`) · Prisma 7 · PostgreSQL 17 (+ pgvector image) ·
Zod · Vitest · pnpm 12 · Turborepo · Docker Compose.

## Prerequisites

- Node.js **≥ 22.22.1**
- pnpm **12** (`npm i -g pnpm@12.16.1`)
- Docker (for PostgreSQL, and for the containerised stack)

## Quick start (host development)

```bash
cp .env.example .env                      # then edit secrets; see "Environment"
docker compose up -d postgres             # PostgreSQL with a persistent volume
pnpm install                              # approves only the build scripts listed in pnpm-workspace.yaml
pnpm db:migrate:deploy                    # apply committed migrations
pnpm dev                                  # web on :3000, API on :4000
```

Open <http://localhost:3000>, create an account, and the desktop appears.
API docs: <http://localhost:4000/docs>. Health: `/api/health` and `/api/health/ready`.
A status page lives at <http://localhost:3000/status>.

> Generate a real secret: `openssl rand -base64 48` → `BETTER_AUTH_SECRET`.
> `POSTGRES_PASSWORD` in `.env` must match the password inside `DATABASE_URL`
> (URL-encode special characters there).

## Commands

| Command                             | What it does                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `pnpm dev`                          | Web + API in watch mode (builds shared packages first)                                        |
| `pnpm build`                        | Build everything                                                                              |
| `pnpm lint` / `pnpm typecheck`      | ESLint / TypeScript across all workspaces                                                     |
| `pnpm test`                         | Unit tests (no database needed)                                                               |
| `pnpm test:e2e`                     | API integration tests against a real Postgres (`TEST_DATABASE_URL`, name must end in `_test`) |
| `pnpm format` / `pnpm format:check` | Prettier                                                                                      |
| `pnpm db:migrate`                   | Create + apply a new migration during development (`prisma migrate dev`)                      |
| `pnpm db:migrate:deploy`            | Apply committed migrations (what production uses)                                             |
| `pnpm db:status`                    | Show migration status                                                                         |

Run the e2e suite (create the test database once):

```bash
docker compose exec postgres createdb -U hanabrew hanabrew_test
pnpm test:e2e
```

## Environment

All variables are documented in [`.env.example`](./.env.example). The API validates them at
startup and exits with a readable message if anything is missing or malformed. Never commit `.env`.

## Docker (whole stack)

```bash
docker compose up --build        # postgres → migrate (one-shot) → api → web
```

See [docs/deployment/docker.md](./docs/deployment/docker.md) for migrations, backups, restore and HTTPS.

## API overview (all routes except health and auth need a session)

| Route                                                                                       | Purpose                                                                                                      |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `POST /api/auth/sign-up/email`, `/sign-in/username`, `/sign-out`                            | Better Auth (username accounts)                                                                              |
| `GET /api/me`                                                                               | signed-in user + personal workspace                                                                          |
| `GET/POST /api/tasks`, `GET/PATCH/DELETE /api/tasks/:id`, `GET /api/tasks/summary`          | tasks (filters: `status`, `priority`, `projectId`, `tag`, `q`, `dueFrom`, `dueTo`, `sort`, `order`, `limit`) |
| `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id`                              | projects with calculated `progress`                                                                          |
| `GET/POST /api/calendar-events` (`from`, `to`), `GET/PATCH/DELETE /api/calendar-events/:id` | events overlapping a range                                                                                   |
| `GET/PATCH /api/settings`                                                                   | user settings (time zone)                                                                                    |
| `GET /api/dashboard`                                                                        | everything the widgets need                                                                                  |
| `GET /api/health`, `/api/health/ready`                                                      | liveness / readiness                                                                                         |

Interactive docs: `/docs`. Errors share one shape: `{ statusCode, error, message, requestId, issues? }`.

## Repository layout

```text
apps/web              Next.js app: desktop shell, window manager, themes, auth screens
apps/api              NestJS API: modules/{auth,health,users,workspaces}, config, infrastructure
packages/contracts    Zod schemas + shared API types (the web/API contract)
packages/database     Prisma schema, migrations, client factory
infrastructure/docker Dockerfiles
docs/                 architecture, development and deployment docs
```

More: [ARCHITECTURE.md](./ARCHITECTURE.md) · [docs/development/adding-an-app.md](./docs/development/adding-an-app.md) ·
[docs/development/troubleshooting.md](./docs/development/troubleshooting.md).

## Verification status (M0 + M1 + M2)

Honest account of what has and has not been run.

**Run and passing in the authoring sandbox** (Node 22, PostgreSQL 16 + pgvector 0.6), from a clean install:

- `pnpm install --frozen-lockfile`, then Turborepo `build`, `lint`, `typecheck` and `test`: **15/15 tasks**, repeated 3× to check for flakiness.
- **Unit/component tests: 208**: contracts 38, API 33, web 137 (96 logic tests including DST, all-day, calendar layout and deadline
  matching, plus 41 component tests that render each app in jsdom against a fake API and drive real interactions: quick-add, whole-card
  click, completing, the locked read-only view and confirmed reopen, the full task form inside a project, calendar event creation with exact
  instants and deadlines on the calendar, validation errors, time-zone saving).
- **API e2e tests: 65** against real PostgreSQL: sign-up/sign-in, 401 on every private route, CRUD, filters/sort/search,
  status/`completedAt` rules, **the completed-task lock (409 on every kind of edit, reopen allowed, progress moves accordingly)**,
  project progress from real records (including cancelled tasks), calendar overlap and all-day rules, **calendar deadlines**, DB CHECK
  constraints, CSRF origin check, and **tenant isolation** (a second user gets 404 on every read/update/delete of the first user's
  tasks, projects and events, sees none of their deadlines, and can't attach tasks to their projects).
- **Mutation checks** (I deliberately broke the code and confirmed the tests fail): removing the workspace filter (isolation tests failed);
  disabling the completed-task lock (API tests failed); removing the lost-update guard (its unit tests failed; an e2e race test alone could
  _not_ catch this, so it has a dedicated deterministic unit test); disabling the locked UI view and the checkbox/tag opt-out (component tests failed).
- `next build`; the compiled API and Next standalone server were started and exercised over HTTP, including a full
  sign-up → project → tasks → event → dashboard scenario and a forged-origin write (403).

**Not verified here. Please run locally first:**

1. **Docker** (`docker compose up --build`): Dockerfiles and compose were written but there was no Docker in the sandbox
   (you've since run the M0/M1 stack successfully; the M2 migration is new, so re-run it).
2. **Prisma migration tooling**: the sandbox could not download Prisma's schema engine, so all three migration SQL files were
   **written by hand** in Prisma's format and applied as plain SQL. On your machine run `pnpm db:migrate:deploy`, then
   `pnpm db:migrate` (`prisma migrate dev`): it should report _no pending changes_. If it proposes a new migration, keep your
   data, send me its SQL, and don't accept a reset. The `CHECK` constraints and partial index in the migrations are invisible to Prisma by design.
3. **Real-browser behaviour**: there was no browser in the sandbox. Interactions were verified in jsdom, which does not do
   layout, so **visual details are unchecked**: week/day grid event positioning and sizing, how deadline chips look and wrap in
   month cells, how the dashboard column fits beside windows, scroll behaviour, and form spacing. (You have since checked the M2 layout by hand.)
4. Prisma `migrate` and Docker on **your Windows machine** with the new migration.

## Known limitations

- No Content-Security-Policy on the web app yet (an inline script prevents theme flash); planned for M5 hardening.
- Auth rate limiting uses in-memory counters (single API instance). Move to Redis before running replicas.
- Username-only accounts use a reserved placeholder email on `users.hanabrew.invalid`; there is **no password reset** until a real email is attached.
- Window layouts persist per browser, not per user account.
- Task lists return at most 500 rows (no cursor pagination yet). Calendar queries are limited to 100 days at a time.
- Calendar weeks start on Sunday (one constant, `WEEK_STARTS_ON`). No recurring events yet (M5), and no drag-to-move/resize of events: edit through the form.
- A task belongs to at most one project. Tags are free text on the task (no tag management screen).
- Completed tasks are locked, but can still be **deleted** (after a confirmation). Cancelled tasks are not locked. Reopening always returns a task to "To do". There is no audit trail of reopen events yet.
- The calendar shows task and project deadlines read-only as markers: change a due date by opening the task. Cancelled tasks and archived projects don't appear.
- The weekly/daily "now" line and "today" follow the chosen time zone, but the page doesn't live-update past midnight until it refreshes.
- The `shadcn` CLI could not run offline; the UI components in `apps/web/src/components/ui` are hand-written in the shadcn style (`components.json` is included so `pnpm dlx shadcn add …` works later).
