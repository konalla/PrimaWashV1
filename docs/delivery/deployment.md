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

Environment contract:

- `PORT`: API port. Default `3001`.
- `WEB_PORT`: web dashboard port. Default `3000`.
- `DATABASE_URL`: PostgreSQL connection string.
- `POSTGRES_USER`: compose database user.
- `POSTGRES_PASSWORD`: compose database password.
- `POSTGRES_DB`: compose database name.

Staging requirements before external users:

- Replace demo development actor headers with a real OIDC/JWT verifier.
- Move Postgres credentials to managed secrets.
- Restrict CORS to deployed web origins only.
- Add HTTPS termination and secure headers at the edge.
- Persist structured logs centrally.
- Run migrations as a controlled release step, not an always-on service.
