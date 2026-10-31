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

**What works today:** sign up / sign in with a username, a private personal workspace, the
Sakura Latte and Midnight Blossom themes, a desktop with draggable/resizable windows, dock,
app launcher (Ctrl/⌘ K), a Settings app, and a responsive mobile layout. **What does not exist
yet:** tasks, calendar, projects, AI chat, journal. Those apps show a preview panel and store nothing.

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

## Verification status (M0 + M1)

Honest account of what has and has not been run.

**Run and passing in the authoring sandbox** (Node 22, PostgreSQL 16 + pgvector 0.6):
`pnpm install`; builds of all four workspaces; `tsc` typecheck and ESLint on all workspaces;
Prettier check; **web unit tests (64)** (window math, window store, registry, WCAG contrast of both
themes); **contracts unit tests (9)**; **API unit tests (13)**; **API e2e tests (19)** against real PostgreSQL (sign-up/sign-in/sign-out,
401 on private routes, workspace provisioning and race safety, cross-user isolation, CORS, security headers, OpenAPI);
`next build`; booting the compiled API and the Next standalone server and hitting them over HTTP;
cross-origin sign-up from the web origin.

**Not verified here. Please run locally first:**

1. **Docker**: `docker compose up --build`. Dockerfiles and compose were written but there was no Docker in the sandbox.
2. **Prisma migration tooling**: the sandbox could not download Prisma's schema engine, so the two migration SQL files were
   **written by hand** in Prisma's format and applied with plain SQL. On your machine run `pnpm db:migrate:deploy`
   on a fresh DB, then `pnpm db:status`, then `pnpm db:migrate` (`prisma migrate dev`). It should report _no pending changes_.
   If it reports drift, delete `packages/database/prisma/migrations/20261031000000_init`, run `pnpm db:migrate -- --name init`
   and keep the hand-written partial index migration (`..._one_personal_workspace_per_user`).
3. **Real-browser behaviour**: no browser was available, so dragging, resizing, the dock, the launcher and the mobile layout were
   verified only through their logic (unit tests) and a successful production build, **not by clicking through them**. Expect
   to find visual or interaction polish issues; please report them.
4. **Turborepo task runner** with your environment (`pnpm build` / `pnpm test`); package scripts were run individually.

## Known limitations

- No Content-Security-Policy on the web app yet (an inline script prevents theme flash); planned for M5 hardening.
- Auth rate limiting uses in-memory counters (single API instance). Move to Redis before running replicas.
- Username-only accounts use a reserved placeholder email on `users.hanabrew.invalid`; there is **no password reset** until a real email is attached.
- Window layouts persist per browser, not per user account.
- The `shadcn` CLI could not run offline; the UI components in `apps/web/src/components/ui` are hand-written in the shadcn style (`components.json` is included so `pnpm dlx shadcn add …` works later).
