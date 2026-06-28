# Phase 0 execution plan

Product work: resolve launch decisions, interview at least ten owners, five partners, and three condo/property-management stakeholders, map booking through reconciliation, test customer/partner/property prototypes, define unit economics, and validate the no-dedicated-wash-bay operating model.

Engineering work: establish CI and environments, implement identity and organization boundaries, then deliver the first vertical slice: create vehicle, list availability, create booking, and capture the audit trail with PostgreSQL migrations, API contracts, structured logging, and audit events.

Current implementation status: the first vertical slice exists with shared TypeScript contracts, PostgreSQL migrations, dependency-light API routes, in-memory local persistence, a Postgres adapter selected by `DATABASE_URL`, development actor headers, customer owner-scope enforcement, structured request logging, audit-event schema, product-event analytics, MAVO endpoint, partner availability controls with capacity/closure enforcement, mock payment intents with authorization/capture/void/refund states, audit writes for vehicle/booking/payment/availability/status changes/cancellations/service records, automated API tests, an elevated browser preview, a partner dashboard, CI typecheck/test/build workflow, Dockerfiles, and compose deployment foundation. Remaining engineering work for Phase 0 is deploying the staging environment.

Phase 0 strategy alignment now also includes the product roadmap in `docs/product/strategy-roadmap.md`.

Exit requires an approved geography/payment model, tested primary journeys, a staging vertical slice, reviewed threat model/data classification, defined analytics events, documented market/residence architecture, documented condo operations requirements, and documented pickup/return risk controls.
