# Deployment foundation

The current staging shape is three runtime services:

- API container
- Web dashboard container
- PostgreSQL database

Local compose flow:

```bash
docker compose up --build
```

Docker Desktop must be running before this command. On Windows, the Linux engine pipe must be available; if Docker reports `dockerDesktopLinuxEngine` is missing, start Docker Desktop and retry.

Then open:

- API health: `http://127.0.0.1:3001/health`
- Customer preview: `http://127.0.0.1:3001/`
- Partner dashboard: `http://127.0.0.1:3000/?api=http://127.0.0.1:3001`

Local manual preview flow:

```powershell
npm run db:migrate
npm run dev:api:local
npm run dev:web
npm run dev:mobile:web
```

When port `3000` is occupied, run the web app on `3020` and open:

- API health: `http://127.0.0.1:3011/health`
- Admin/web portal: `http://127.0.0.1:3020/?api=http://127.0.0.1:3011`
- Mobile web preview: `http://localhost:8082`

Environment contract:

- `PORT`: API port. Default `3001`.
- `WEB_PORT`: web dashboard port. Default `3000`.
- `PERSISTENCE_MODE`: `postgres` for normal local/staging/production operation. `memory` is reserved for tests and deliberate local experiments.
- `DATABASE_URL`: PostgreSQL connection string.
- `POSTGRES_USER`: compose database user.
- `POSTGRES_PASSWORD`: compose database password.
- `POSTGRES_DB`: compose database name.
- `CORS_ALLOWED_ORIGINS`: comma-separated browser origins allowed to call the API. Local development defaults include `127.0.0.1`/`localhost` web and Expo preview ports. Production must set this explicitly.
- `AUTH_SESSION_SECRET`: signing secret for bearer sessions. Required in production and must contain at least 32 characters.
- `AUTH_CODE_DELIVERY_PROVIDER`: `local` for development or `webhook` for generated-code delivery to an external email/SMS service. Production must not use `local`.
- `AUTH_CODE_DELIVERY_WEBHOOK_URL`: required when `AUTH_CODE_DELIVERY_PROVIDER=webhook`.
- `AUTH_CODE_DELIVERY_WEBHOOK_SECRET`: optional bearer secret sent to the auth-code delivery webhook.
- `AUTH_RATE_LIMIT_RETENTION_HOURS`: retention window for auth rate-limit events pruned by the cleanup job. Default `24`.
- `AUTH_REVOKED_SESSION_RETENTION_DAYS`: retention window for revoked auth sessions pruned by the cleanup job. Default `30`.
- `AUTH_REFRESH_TOKEN_RETENTION_DAYS`: retention window for old used/revoked refresh tokens pruned by the cleanup job. Default `30`.
- `ALLOW_DEV_HEADER_AUTH`: allows trusted development actor headers when set to `true`. Must be absent or `false` outside local development.
- `SHOW_DEV_AUTH_CODE`: exposes the local verification code in auth responses when set to `true`. Must be absent or `false` outside local development.
- `PAYMENT_PROVIDER`: `local` for development or `stripe` for Stripe-backed payment operations.
- `STRIPE_SECRET_KEY`: Stripe API secret key when `PAYMENT_PROVIDER=stripe`.
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook signing secret for `/v1/webhooks/stripe`.

Staging requirements before external users:

- Use bearer sessions only; disable demo development actor headers.
- Persist auth challenges, revocable sessions, rotating refresh tokens, and auth rate-limit events.
- Configure `AUTH_CODE_DELIVERY_PROVIDER=webhook` and connect the selected production email/SMS delivery service.
- Schedule `npm run auth:cleanup --workspace @prima-wash/api` or equivalent infrastructure job.
- Move Postgres credentials to managed secrets.
- Move payment and auth secrets to managed secrets.
- Restrict CORS to deployed web origins only.
- Add HTTPS termination and secure headers at the edge.
- Persist structured logs centrally.
- Run migrations as a controlled release step, not an always-on service.
- Add database backup, restore, and migration rollback procedures.
- Add Stripe webhook delivery monitoring and payment reconciliation runbooks.
