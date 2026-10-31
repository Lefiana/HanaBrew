# Docker deployment (single host)

Status: files are written but **not yet run** by the author. Treat the first `docker compose up --build` as a test.

## Services

`postgres` (pgvector image, named volume `hanabrew-pgdata`) → `migrate` (one-shot, exits) → `api` (:4000, health-checked) → `web` (:3000).
Data lives in the named volume: `docker compose down` and `up` keep it. **Never run `docker compose down -v` unless you intend to delete the database.**

## First run

```bash
cp .env.example .env     # set POSTGRES_PASSWORD, BETTER_AUTH_SECRET, and the *_URL values for your host
docker compose up --build -d
docker compose logs -f api
```

`NEXT_PUBLIC_API_URL` is baked into the web image at build time: rebuild `web` if it changes.

## Migrations

Migrations are a controlled step, never run by API replicas on startup. `docker compose up` runs the `migrate` job before the API starts.
To run manually: `docker compose run --rm migrate`. Status: `docker compose run --rm migrate pnpm db:status`.

## Backup and restore

```bash
# backup (plain SQL, portable)
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > hanabrew-$(date +%F).sql

# restore into an EMPTY database (stop the api first; this does not drop anything for you)
docker compose stop api web
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < hanabrew-YYYY-MM-DD.sql
docker compose start api web
```

Test restores on a scratch database before you rely on them. Automate backups with cron on the host and copy them off the machine.

## HTTPS and reverse proxy

Put a TLS-terminating proxy (Caddy, Traefik or nginx) in front. Serve web and API on **the same registrable domain**
(e.g. `app.example.com` and `api.example.com`) so `SameSite=Lax` session cookies work. Then set:
`API_PUBLIC_URL=https://api.example.com`, `WEB_PUBLIC_URL=https://app.example.com`, `CORS_ALLOWED_ORIGINS=https://app.example.com`,
`NEXT_PUBLIC_API_URL=https://api.example.com`, and `TRUST_PROXY_HOPS=1` on the API so rate limiting sees client IPs.
Cookies become `Secure` automatically when `API_PUBLIC_URL` is https. Do not publish port 5432.

## Cloud notes

Same images. Use a managed PostgreSQL, run `migrate` once per deploy as a release step, and keep secrets in the platform's secret store.
