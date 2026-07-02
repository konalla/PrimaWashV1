# Prima Wash

Prima Wash is a vehicle-care booking and operations platform. The first release connects vehicle owners with service partners through a native mobile app, a partner web dashboard, and an internal operations console.

## Repository structure

- `apps/api` — backend API
- `apps/mobile` — customer mobile application boundary
- `apps/web` — partner and operations web application boundary
- `packages/contracts` — shared domain and API contracts
- `docs` — product, architecture, security, and delivery decisions

## Local development

```bash
npm install
npm run db:up
npm run db:migrate
npm run check
npm run dev:api
npm run dev:web
npm run dev:mobile
```

The native customer app lives in `apps/mobile` and uses Expo SDK 56 with Expo Router. Run `npm run dev:mobile`, then scan the Expo Go QR code or press `w` for the browser preview. You can also run `npm run dev:mobile:web` directly.

Set `EXPO_PUBLIC_API_URL` when a device cannot reach the default local API address. For a physical phone on the same network, use the development machine’s LAN address, for example:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.4:3001
```

The legacy customer HTML at `http://127.0.0.1:3001/` remains a lightweight API reference. The product mobile experience is now the Expo application.

Open `http://127.0.0.1:3000/` for the partner/business dashboard. It defaults to the Compose API at `http://127.0.0.1:3001`. If your API is on a different port, pass it as `?api=http://127.0.0.1:3101`. The API allows local dashboard CORS from `http://127.0.0.1:3000` and `http://localhost:3000`.

## Local PostgreSQL

```bash
npm run db:up
npm run db:migrate
```

Compose starts PostgreSQL on `127.0.0.1:5432` and stores data in the `postgres-data` Docker volume. `npm run db:migrate` applies the SQL migrations from `apps/api/db/migrations`.

Docker Desktop must be running on Windows.

Normal shutdown preserves local database data:

```bash
npm run db:down
```

Do not add `--volumes` unless you intentionally want to erase the local database.

When new migrations are added, run:

```bash
npm run db:migrate
```

Verify the stack with:

```bash
docker compose ps
```

By default, `npm run dev:api` now uses PostgreSQL. If `DATABASE_URL` is not set, the local default is:

```bash
postgres://postgres:postgres@127.0.0.1:5432/prima_wash
```

To run the local TypeScript API against PostgreSQL while leaving another API port free:

```bash
$env:PORT="3101"
$env:DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/prima_wash"
$env:AUTH_SESSION_SECRET="replace-with-at-least-32-random-characters"
npm run db:migrate
npm run dev:api
```

The API will then be available at `http://127.0.0.1:3101`. Set `EXPO_PUBLIC_API_URL` to that address before starting Expo if the mobile app should use this process.

Memory persistence is reserved for tests and deliberate local experiments. To opt into it manually:

```bash
$env:PERSISTENCE_MODE="memory"
npm run dev:api
```

The initial API is intentionally dependency-light. It exposes the first booking vertical slice:

- `GET /health`
- `GET /v1/services`
- `GET /v1/availability`
- `GET /v1/partner/availability`
- `POST /v1/partner/availability`
- `PATCH /v1/partner/availability/{slotId}`
- `GET /v1/vehicles?ownerId={ownerId}`
- `POST /v1/vehicles`
- `GET /v1/bookings?ownerId={ownerId}`
- `POST /v1/bookings`
- `POST /v1/payments/intents`
- `POST /v1/payments/{paymentIntentId}/authorize`
- `PATCH /v1/bookings/{bookingId}/status`

## Current status

Phase 0 foundation with MVP domain contracts, PostgreSQL schema migrations, Postgres-backed local API persistence, in-memory test adapters, an Expo customer application, bearer authentication, persistent customer profiles, multi-vehicle garage management, verified partner discovery, partner-specific availability, payment authorization/capture/void flow, partner availability controls, and the partner dashboard. Production OTP delivery, refresh-token rotation, payment provider, tax, payout, dispute, and marketplace-settlement decisions remain open before production processing.
