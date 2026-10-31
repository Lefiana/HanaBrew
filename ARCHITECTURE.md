# HanaBrew Architecture

## Style

Modular monolith, API-first. `apps/web` (Next.js) and `apps/api` (NestJS) are separate deployables that
talk over REST. They share only `packages/contracts` (Zod schemas/types). The web app never touches the database;
`packages/database` is imported by the API alone.

```text
Browser ──HTTP/cookies──> NestJS API ──Prisma──> PostgreSQL
  │                          │
  └─ Next.js (UI only)       └─ modules: auth · users · workspaces · health   (more per milestone)
```

Request flow in the API: **Controller (thin) → Service (business rules) → PrismaService (data access)**.
Controllers never contain business logic and depend on `AuthenticatedUser`, not on the auth library.

## Backend (`apps/api`)

| Area                       | Responsibility                                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `config/`                  | Zod-validated environment; `parseEnv` is pure and unit-tested. Fails fast with a readable list of problems             |
| `infrastructure/database/` | `PrismaService` owns the single Prisma client / pool                                                                   |
| `common/`                  | request-id + one-line request logging (no bodies/cookies), single error shape, version                                 |
| `modules/auth/`            | **the only place that imports Better Auth** and its Nest adapter; exports `Public`, `CurrentUser`, `AuthenticatedUser` |
| `modules/workspaces/`      | `ensurePersonalWorkspace`: atomic, race-safe (partial unique index)                                                    |
| `modules/users/`           | `GET /api/me`                                                                                                          |
| `modules/health/`          | `GET /api/health` (liveness), `GET /api/health/ready` (DB check, 503 when down)                                        |
| `bootstrap.ts`             | Helmet, credentialed CORS allow-list, global prefix, trust-proxy, Swagger; shared by `main.ts` and e2e tests           |

### Authentication

- Better Auth runs **inside** the NestJS API, mounted at `/api/auth/*` through the community adapter
  `@thallesp/nestjs-better-auth` (body parser disabled in Nest as the adapter requires; it re-adds parsers for other routes).
- Sessions are **HTTP-only cookies** (`hanabrew.session_token`, `SameSite=Lax`, `Secure` automatically when `API_PUBLIC_URL` is https).
  The browser sends them with `credentials: "include"`; CORS allows only the configured origins. Better Auth also checks `Origin` against `trustedOrigins`.
- **Deny by default:** the adapter registers a global guard, so every route needs a session unless marked `@Public()`.
- **Username accounts (M0):** the API owns the `email` column. A `databaseHooks.user.create.before` hook replaces any client-supplied email with
  `<username>@users.hanabrew.invalid` and rejects sign-up without a username. Attaching a real, verified email is a later milestone.
- The workspace for a new account is created in an `after` hook; `GET /api/me` also creates it if missing (self-healing, idempotent).
- Identity is **always derived from the verified session**, never from a client-supplied user id.

### Data model (M0)

`User`, `Session`, `Account`, `Verification` (Better Auth) · `Workspace` (kind `PERSONAL`, `ownerId`) · `WorkspaceMembership` (role `OWNER|ADMIN|MEMBER`).
UUID primary keys, FK `ON DELETE CASCADE`, indexes on every FK. A hand-written partial unique index guarantees **one personal workspace per owner**.
Every user-owned table added later hangs off `Workspace` and must be authorised through `WorkspaceMembership` on the server.

## Frontend (`apps/web`)

- **Design tokens** live only in `styles/tokens.css` (two themes via `[data-theme]`); Tailwind utilities are mapped to them in `globals.css`.
  `tokens.spec.ts` computes WCAG contrast for every text/background pair in both themes. A pre-hydration script sets the theme to avoid a flash.
- **Window manager** (`features/desktop/`): pure geometry in `window-math.ts`, a Zustand store in `window-store.ts` (open/close/minimize/restore/maximize/focus/z-order/move/resize,
  viewport clamping, one window per app). Only per-app layout preferences are persisted. It knows nothing about any app's content.
- **Application registry** (`app-registry.ts`) drives the dock, launcher, routes and mobile nav. `app-components.tsx` maps ids to components.
  The _same component_ renders in a floating window and at `/apps/[appId]` (full page), which is also the mobile experience.
- **Responsive:** ≥768px floating desktop; below that a home grid + bottom navigation with full-screen app pages.
- **Auth gating:** `AuthGate` calls `/api/me` and redirects to `/sign-in` on 401. This is UX only; the API enforces access on every request.
- **Motion:** Motion library + CSS; honours `prefers-reduced-motion` and a Settings override; sakura petals are CSS-only and switch off with reduced motion.

## Decisions and deviations from the master prompt

| Decision                                                          | Why                                                                                                                                      |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **TypeScript 6.0**, not 7                                         | Better Auth's Nest adapter and `typescript-eslint` declare peer ranges that exclude TS 7                                                 |
| **Prisma 7.10.1** (pinned), not the 8.0 release candidate         | npm's `latest` tag pointed at a release candidate; pinned the newest stable 7.x                                                          |
| **No `nestjs-zod`**                                               | its peer range does not include NestJS 12. No body-validated endpoint exists yet; a small Zod pipe will be added with the first one (M2) |
| Zod only (no class-validator)                                     | one validation library, shared with the web via `packages/contracts`                                                                     |
| Better Auth `basePath` `/api/auth`, global API prefix `/api`      | consistent URLs; adapter excludes the auth path from the prefix                                                                          |
| CORS handled once in `bootstrap.ts` (adapter's own CORS disabled) | avoids duplicate/contradictory headers                                                                                                   |
| Tests run migration **SQL** directly (`test/global-setup.ts`)     | deterministic and independent of Prisma's engine; refuses to run unless the DB name ends in `_test`                                      |
| `shadcn` components hand-written                                  | CLI needs network access unavailable at authoring time                                                                                   |
