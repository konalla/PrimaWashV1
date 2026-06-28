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

## Docker compose

```bash
docker compose up --build
```

Compose starts PostgreSQL, runs migrations, starts the API on `3001`, and starts the web dashboard on `3000`.

Docker Desktop must be running for compose builds on Windows.

The Compose API uses PostgreSQL and persists data in the `postgres-data` Docker volume. Normal shutdown preserves that data:

```bash
docker compose down
```

Do not add `--volumes` unless you intentionally want to erase the local database.

When new migrations are added, rebuild the migration image before running it:

```bash
docker compose build migrate
docker compose run --rm migrate
```

Verify the stack with:

```bash
docker compose ps
curl http://127.0.0.1:3001/health
```

By default, `npm run dev:api` uses in-memory persistence. To run the local TypeScript API against PostgreSQL while leaving the Compose web/API ports free:

```bash
$env:PORT="3101"
$env:DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/prima_wash"
$env:AUTH_SESSION_SECRET="replace-with-at-least-32-random-characters"
npm run db:migrate
npm run dev:api
```

The API will then be available at `http://127.0.0.1:3101`. Set `EXPO_PUBLIC_API_URL` to that address before starting Expo if the mobile app should use this process.

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

Phase 0 foundation with MVP domain contracts, PostgreSQL schema migrations, in-memory and Postgres API adapters, an Expo customer application, bearer authentication, persistent customer profiles, multi-vehicle garage management, verified partner discovery, partner-specific availability, payment authorization/capture/void flow, partner availability controls, and the partner dashboard. Production OTP delivery, refresh-token rotation, payment provider, tax, payout, dispute, and marketplace-settlement decisions remain open before production processing.
