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

- **HanaAI**: chat with Hana. She can search, create and update tasks, projects and calendar events, and prepare a weekly summary,
  through 14 fixed tools. **She asks you first** before deleting anything or changing many items at once (and, if you choose strict mode,
  before every change). Completed tasks stay locked to her too. Your conversations and API keys are private to you.
  Gemini, Groq and Ollama (local) are supported; see "Setting up Hana".

**Not built yet:** the chibi companion art (a placeholder avatar with seven moods is in place; swap points are documented in
`hana-avatar.tsx`), streaming replies, journal and long-term memory (M4).

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

## Setting up Hana (AI)

1. **Optional but recommended:** set `APP_ENCRYPTION_KEY` in `.env` (32+ random characters) and restart the API. It encrypts API keys you save in
   Settings (AES-256-GCM, bound to your account). Without it you can't save personal keys; server-level keys (below) still work.
2. Open **Settings → Hana's AI** and pick a provider:
   - **Gemini / Groq:** paste your API key, click **Load models**, choose one, **Save**, then **Test connection**.
     (Model names change often, so the list is loaded live from the provider; nothing is hard-coded.)
   - **Ollama (runs on your machine):** install Ollama, `ollama pull <a tool-capable model>`, then choose the model in Settings.
     Not every local model supports tools; the test button tells you if yours doesn't.
3. Open **HanaAI** and say hi.

**Server-level keys** (optional, for a personal self-hosted install): `GEMINI_API_KEY`, `GROQ_API_KEY` in `.env` act as defaults for users
who haven't saved their own. A user's own key always wins.

**Ollama from Docker:** the API container reaches Ollama on your machine through `host.docker.internal` (set via `DOCKER_OLLAMA_BASE_URL`;
the compose file adds the host gateway for Linux). Make sure Ollama listens on an address the container can reach.

**What Hana can do** (the complete list; nothing else is reachable):

| Kind                                     | Tools                                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Look things up                           | `search_tasks`, `get_task_overview`, `list_projects`, `get_project_progress`, `list_calendar_events`, `generate_weekly_summary` |
| Create / change (no approval by default) | `create_task`, `update_task`, `create_project`, `create_calendar_event`, `update_calendar_event`                                |
| **Always asks you first**                | `delete_task`, `delete_calendar_event`, `bulk_update_tasks` (several tasks at once)                                             |

**How it stays safe** (details in [ARCHITECTURE.md](./ARCHITECTURE.md) and [docs/development/ai.md](./docs/development/ai.md)):
tools run through the same services and workspace scoping as the normal API (the model can't choose a user or workspace); approvals expire after
15 minutes and run at most once; completed tasks can't be edited or reopened by Hana; text inside your tasks is treated as data, not instructions;
a model that loops is stopped after 6 steps; every tool call is logged (Settings → "Show recent AI activity"); and Hana **never** falls back from
your preferred provider to a cloud provider unless you switch on "Allow falling back to a cloud provider".

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

## Verification status (M0 – M3)

Honest account of what has and has not been run.

**Run and passing in the authoring sandbox** (Node 22, PostgreSQL 16 + pgvector 0.6), from a clean install:

- Turborepo `build`, `lint`, `typecheck` and `test`: **19/19 tasks**.
- **327 unit/component tests**: contracts 42, **ai-core 46**, API 83, web 156 (including component tests that render each app in jsdom against a fake API).
- **116 API e2e tests** against real PostgreSQL, including **45 for AI**: tool execution, approvals (approve / decline / expire / double-click / new message while waiting),
  strict mode, completed-task locking, tenant isolation (nobody can read, continue or approve another user's conversations or actions; tools can't touch another workspace),
  prompt-injection resistance, step limit, provider failures (before and after an action ran), cloud-fallback privacy rules, Gemini state replay, audit retention,
  encrypted key storage (plaintext never stored or returned), server keys, custom Ollama endpoints and their guard, rotated encryption key, rate limiting.
- **Adapters are tested against local fake servers** that mimic each provider's documented protocol (request shape and auth, tool calls, errors, timeouts, key redaction),
  and the **real compiled API + real Ollama adapter** were driven end to end against a stand-in Ollama server (chat → tool call → task created; delete stayed pending until approved).
- **Mutation checks** (I broke the code on purpose and confirmed tests fail): approval requirement removed, cloud-fallback consent removed, pending-action cleanup removed,
  Gemini thought-signature replay broken, foreign-provider flattening broken, workspace scoping removed, completed-task lock removed, race guard removed.
  A real bug found by the tests: an IPv4-mapped IPv6 address could have bypassed the cloud-metadata guard (fixed).

**Not verified. Please check these first:**

1. **Real providers.** The sandbox could not reach Gemini, Groq or Ollama. The adapters follow the providers' current official docs (verified by search), but a real
   key may expose differences. In particular **Gemini 3+ thought signatures** (required for multi-step tool use) and each model's tool-calling quirks.
   Use **Settings → Test connection**, then try "add a task called test" with each provider. Tell me exactly what any error says.
2. **Prisma migrations.** All four migration SQL files were hand-written (Prisma's engine couldn't download here). Run `pnpm db:migrate:deploy` then `pnpm db:migrate`; it should report no changes.
3. **Docker.** The compose file and Dockerfiles changed (new env vars, `ai-core`, Ollama host gateway) and were not run here.
4. **A real browser.** The chat, approval cards and settings were verified in jsdom, which doesn't do layout, so visual details are unchecked.

## Known limitations

- No Content-Security-Policy on the web app yet (an inline script prevents theme flash); planned for M5 hardening.
- Auth rate limiting uses in-memory counters (single API instance). Move to Redis before running replicas.
- Username-only accounts use a reserved placeholder email on `users.hanabrew.invalid`; there is **no password reset** until a real email is attached.
- Window layouts persist per browser, not per user account.
- Task lists return at most 500 rows (no cursor pagination yet). Calendar queries are limited to 100 days at a time.
- Calendar weeks start on Sunday (one constant, `WEEK_STARTS_ON`). No recurring events yet (M5), and no drag-to-move/resize of events: edit through the form.
- A task belongs to at most one project. Tags are free text on the task (no tag management screen).
- Completed tasks are locked, but can still be **deleted** (after a confirmation). Cancelled tasks are not locked. Reopening always returns a task to "To do". There is no audit trail of reopen events yet.
- **AI:** no streaming (replies arrive whole). Rate limiting is in-memory per API instance. A per-conversation lock is in-process, so multiple API replicas could interleave turns in one conversation (the database's unique ordering prevents corruption). Only the last ~40 messages / 40k characters are sent to the model. There is no long-term memory yet (M4), and no usage/cost tracking: set spending limits with your provider.
- **AI privacy:** conversations (including your task and event details Hana reads) go to the provider you choose. Choose Ollama to keep everything on your machine.
- The calendar shows task and project deadlines read-only as markers: change a due date by opening the task. Cancelled tasks and archived projects don't appear.
- The weekly/daily "now" line and "today" follow the chosen time zone, but the page doesn't live-update past midnight until it refreshes.
- The `shadcn` CLI could not run offline; the UI components in `apps/web/src/components/ui` are hand-written in the shadcn style (`components.json` is included so `pnpm dlx shadcn add …` works later).
