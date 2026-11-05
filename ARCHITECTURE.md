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

### Data model (M0 + M2)

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

## M2: productivity modules

### Tenant isolation (how "users can't see each other's data" is enforced)

1. The global auth guard establishes the session; `WorkspaceGuard` then resolves the caller's workspace **from that session**. Clients never send a workspace or user id (and request bodies are `strict`, so extra fields like `workspaceId` are rejected).
2. Every service method takes the `workspaceId` and every query filters by it (`where: { id, workspaceId }`). Updates verify ownership first; deletes are `deleteMany({ id, workspaceId })` and a zero count is a 404.
3. Foreign ids supplied by the client (e.g. a task's `projectId`) are checked to belong to the same workspace.
4. Another user's record is a **404** (not 403) so existence isn't leaked.
5. Covered by e2e tests that drive two real users against PostgreSQL (and the tests were mutation-checked).

### Validation and CSRF

All inputs are validated with Zod contracts from `packages/contracts` through `ZodValidationPipe`; failures return 400 with per-field `issues`. Unsafe requests (POST/PATCH/DELETE) also pass an `Origin` allow-list middleware, so a cookie-authenticated request from another site is refused (403) even though `SameSite=Lax` already blocks most cross-site cases.

### Time model (the rule that prevents "my event moved a day")

| Kind                                | Stored as                                                                                                         | Why                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Task due date, project start/target | `DATE` (`"YYYY-MM-DD"` on the wire)                                                                               | A due date is a calendar date, not a moment; it never shifts with zones |
| Timed event                         | `timestamptz` start/end (exact instants, `Z` on output) + the creator's IANA zone                                 | Unambiguous moment; rendered in the user's chosen zone                  |
| All-day event                       | **floating dates**: start = `00:00Z` of the first day, end = `00:00Z` of the day _after_ the last day (exclusive) | Stays on the same dates in every zone; same convention as iCalendar     |
| "Today" / overdue                   | computed from the user's effective zone (saved setting, else the browser's)                                       | Correct near midnight for users far from UTC                            |

The conversion helpers live in `packages/contracts` (`allDayToInstants`, `instantsToAllDayDates`, `validateEventTimes`) and `apps/web/src/lib/tz.ts` (Intl-based, DST-tested). A database `CHECK` guarantees `end > start`, and projects can't have a target before the start.

### Project progress

Never stored and never produced by AI: `percent = completed / (total − cancelled)`, computed per request from task rows with one grouped query (`ProjectsService.withProgress`); the dashboard uses the same code.

### Completed tasks are locked

A completed task is immutable except for an explicit **reopen**. The rule is one pure function shared by API and web
(`classifyPatchForCompletedTask` in `packages/contracts/src/tasks.ts`): for a completed task a PATCH is a `reopen` (a lone `status` of `TODO`/`IN_PROGRESS`),
a harmless `noop` (a lone `COMPLETED`), or `locked` (anything else, including cancelling, moving project, or reopening _and_ editing in one request).

- **API:** `locked` → **409 Conflict**. The write is _conditional on the status that was validated_ (`updateMany ... where status = <read status>`), so a request racing the completion can't slip an edit in after it; the loser gets a 409 "changed elsewhere".
- **UI:** the list checkbox for a completed task is disabled with an explanation; opening it shows a read-only view whose only mutations are _Reopen task…_ (confirmation step) and _Delete_ (confirmation step).
- Reopening lowers project progress by design; completing again raises it. Cancelled tasks are **excluded** from the progress denominator (2 done of 5, one cancelled = 2/4 = 50%), and the UI says so.

### Calendar deadlines

`GET /api/calendar-deadlines?from&to` (inclusive dates, ≤100 days) returns full task and project objects, scoped to the caller's workspace:
tasks with a due date in range (open **and** completed; cancelled excluded) and projects with a target date in range (archived excluded). Dates are floating, matched by date key.
Returning full objects lets the calendar open the real task/project editors in place. In month cells, events are listed first, then project deadlines, then task deadlines, so deadline markers never crowd out events ("+N more" opens the day view).

### M2 decisions

| Decision                                                                 | Why                                                                                                   |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Task → project is a nullable FK (`ON DELETE SET NULL`), not a join table | One project per task is enough for M2; deleting a project keeps its tasks. Easy to widen later        |
| Tags are a `text[]` on the task, lower-cased and de-duplicated           | Simplest thing that supports filtering; a tag table can come later if tags need metadata              |
| Enum declaration order = sort order                                      | `ORDER BY priority` works natively (LOW < MEDIUM < HIGH < URGENT)                                     |
| `GET /api/dashboard` aggregates in one call                              | One round trip; all metrics computed server-side                                                      |
| Saved time zone is `null` until chosen                                   | Lets the UI fall back to the browser's zone instead of silently assuming UTC                          |
| Web component tests use jsdom + a fake API                               | No browser was available; they catch runtime errors and verify exact request payloads, but not layout |

## M3: AI (Hana)

```text
 Web (HanaAI chat, Settings)            API: modules/ai
   │                                      ├─ AiController (thin, rate-limited)
   └── POST /api/ai/chat ───────────────> ├─ AiService (orchestrator: context → model → tools → persistence)
                                          ├─ AiToolsService (the fixed 14 tools; Zod-validated; workspace-scoped services)
                                          ├─ AiProvidersService (credentials, planning, fallback rules)
                                          └─ AiConversationsService (transcript, audit, locks)
                                                     │
                                          packages/ai-core: AIProvider interface
                                          ├─ GeminiProvider  ├─ GroqProvider  └─ OllamaProvider
```

### Layers and boundaries

- **`packages/ai-core`** knows nothing about HanaBrew: the `AIProvider` interface, three adapters, schema conversion (Zod → the small JSON Schema all providers accept), error taxonomy, and Hana's persona (separate file, separate from business logic).
  Adding a provider means implementing `generateResponse` and `listModels` (see docs/development/ai.md).
- **Provider state** is stored per assistant message and replayed verbatim to the same provider (Gemini 3+ _requires_ its thought signatures back). A tool exchange that came from a different provider is flattened to plain text for Gemini instead of sending unsigned function calls.
- **Credentials**: per user, encrypted with AES-256-GCM (key derived from `APP_ENCRYPTION_KEY`, ciphertext bound to `userId:provider` so it can't be moved between rows), write-only (only the last 4 characters are ever returned), redacted from every error message. Server-level env keys are an optional default.
- **Endpoints**: a user-chosen Ollama URL makes the _server_ send requests, so it is off unless `AI_ALLOW_CUSTOM_OLLAMA_URL=true`, and even then cloud-metadata/link-local addresses (including the hex form of IPv4-mapped IPv6) are refused. This is a guard rail, not a sandbox (it doesn't resolve DNS).

### The tool loop

1. The identity comes from the session (never from the model). The provider plan is computed first, so a missing setup fails with a clear 422 **before anything is written**.
2. Context = persona + the user's local date/time/zone + a server-computed snapshot of task counts + a windowed history (starts at a user message so tool calls are never orphaned).
3. The model may request tool calls. Each is looked up in the fixed registry, its arguments are validated with Zod (invalid → the error goes back to the model to retry; the call never runs), then risk is decided:
   `requiresConfirmation = destructive || multiRecord || (strict mode && write)`.
4. Tools needing approval become `PENDING` actions with a **server-written summary built from the validated arguments** (the model can't dress up what an action does) and a 15-minute expiry. The turn stops and waits.
5. Approve claims the action atomically (`PENDING → RUNNING`), re-validates, executes through the normal services, answers the model's tool call, and resumes the loop. Decline/expiry/"user moved on" are also answered in the transcript so the provider never sees an unanswered call.
6. At most 6 model calls per request. If the very first model call fails, the user message is rolled back so a retry is clean; if it fails after an action already ran, the transcript keeps the action and says so.

### Safety properties (each has tests)

| Property                                      | Mechanism                                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| The model can't act on another user's data    | Tools take no user/workspace arguments; all go through workspace-scoped services; foreign ids are simply "not found"            |
| Hostile text in your data can't skip approval | Approval is decided in code from the tool's declared risk, not from anything the model says; summaries come from validated args |
| Hana can't undo your completions              | Tools refuse completed tasks (the same lock the API enforces)                                                                   |
| No silent cloud fallback                      | `planProviders`: preferred provider never swapped; cloud fallback only with explicit consent                                    |
| Approvals can't run twice or late             | Atomic claim; expiry; single-process lock per conversation                                                                      |
| Audit without retention of content            | Every call is an `AiToolAction` row; deleting a conversation wipes args/summary/result but keeps the skeleton                   |
| Keys never leave the server                   | Write-only API, encrypted at rest, redacted from errors; tested for absence in responses                                        |

### M3 decisions

| Decision                                                                                       | Why                                                                                                                             |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| No hard-coded model names; models are loaded live per provider                                 | Model ids change constantly (the docs themselves disagree between versions)                                                     |
| Replies are not streamed                                                                       | Tool calls and approvals dominate the interaction; the interface allows adding `streamResponse` later without changes elsewhere |
| Mood is derived by the server from what happened (and the UI adds thinking/listening/sleeping) | A mood is a presentation cue only and never claims anything about correctness                                                   |
| `bulk_update_tasks` is the only multi-record tool                                              | Keeps the "always confirm bulk changes" rule concrete without a large tool surface                                              |
| Provider failures use 422 (fix your setup) and 424 (provider down)                             | The global error filter hides 5xx messages; these statuses keep the actionable text                                             |
| Conversations are private to the user (not just the workspace)                                 | Chats may contain anything; a future shared workspace shouldn't expose them                                                     |
