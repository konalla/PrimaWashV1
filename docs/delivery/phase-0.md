# Phase 0 execution plan

Product work: resolve launch decisions, interview at least ten owners, five partners, and three condo/property-management stakeholders, map booking through reconciliation, test customer/partner/property prototypes, define unit economics, and validate the no-dedicated-wash-bay operating model.

Engineering work: establish CI and environments, implement identity and organization boundaries, then deliver the first vertical slice: create vehicle, list availability, create booking, and capture the audit trail with PostgreSQL migrations, API contracts, structured logging, and audit events.

Current implementation status: the first vertical slice has expanded into a database-backed booking and operations foundation. It includes shared TypeScript contracts, PostgreSQL migrations through the current auth rate-limit data, dependency-light API routes, Postgres-default local persistence, in-memory adapters for tests and deliberate experiments, signed bearer sessions, persisted auth challenges, revocable sessions, auth code-request throttling, auth-code delivery provider boundaries, persisted access memberships, customer owner-scope enforcement, partner-location scoping, property-manager scoping, internal permission checks, structured request logging, audit-event schema, product-event analytics, MAVO endpoint, partner availability controls with capacity/closure enforcement, booking holds, service modes, local and Stripe payment provider boundaries, payment authorization/capture/void/refund states, audit writes for vehicle/booking/payment/availability/status changes/cancellations/service records, automated API tests, an Expo customer app, a partner/internal/property-management browser portal, CI typecheck/test/build workflow, Dockerfiles, and compose deployment foundation.

Phase 0 remaining engineering work is stabilization rather than feature discovery:

- Apply and smoke-test the latest migrations against local Postgres.
- Keep API, security, delivery, and product memory docs aligned with the implementation.
- Verify `npm run check`, API unit tests, and Postgres integration tests.
- Make local demo users, roles, permissions, and URLs explicit.
- Keep production launch gaps visible: selected email/SMS vendor connection, refresh/session renewal, broader abuse controls, production Stripe configuration, managed secrets, observability, backups, and staging deployment.

Phase 0 strategy alignment now also includes the product roadmap in `docs/product/strategy-roadmap.md`.

Exit requires an approved geography/payment model, tested primary journeys, a staging vertical slice, reviewed threat model/data classification, defined analytics events, documented market/residence architecture, documented condo operations requirements, and documented pickup/return risk controls.
