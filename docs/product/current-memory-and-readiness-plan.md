# Prima Wash Current Memory and Readiness Plan

Last updated: 2026-07-07

This document is the current working memory for Prima Wash. It consolidates the product direction, what has already been built, what remains, and the phased path to pilot and launch readiness.

Latest finance operations runbook work on 2026-07-07:

- Payment reconciliation cases now include derived runbook guidance in the shared contract and API responses.
- Guidance includes recommended action, owner team, severity, SLA, customer impact, and next step.
- The internal Finance dashboard now shows case guidance and a resolution-action selector inside the case workflow.
- Resolving or writing off a case from the dashboard can reuse the recommended action as resolution context.
- `docs/delivery/payment-reconciliation.md` now includes operational runbooks for payment failures, Stripe disputes, invalid transitions, duplicate provider events, provider mismatches, customer follow-up, and partner evidence requests.

Latest finance evidence-pack work on 2026-07-07:

- Added a shared `PaymentReconciliationEvidencePack` contract.
- Added `GET /v1/internal/payment-reconciliation-cases/:id/evidence-pack` for internal finance users with `finance_read`.
- Evidence packs are assembled from existing operational records: case timeline, booking, vehicle, partner location, payment intent, payment operation ledger, booking evidence, handovers, consents, service record, communications, and recent linked audit events.
- Evidence packs include a present/missing/not-applicable checklist for finance readiness.
- The internal Finance dashboard can now load and show the evidence pack from a linked reconciliation case.

Latest local environment hardening on 2026-07-07:

- API CORS origins are now configurable through `CORS_ALLOWED_ORIGINS`.
- Local development defaults include the standard web and Expo preview ports, including fallback web ports `3020` and `3021`.
- Production config now requires explicit `CORS_ALLOWED_ORIGINS` instead of relying on local defaults.
- Unknown browser origins are no longer echoed by the API CORS response.
- Added `npm run dev:api:local` to start the API on port `3011` with local Postgres, exposed development auth code, and local preview CORS origins.
- `docs/delivery/deployment.md` now documents the safer local preview restart flow.

Latest payment reconciliation scheduling hardening on 2026-07-07:

- Added `0042_payment_provider_reconciliation_run_lock.sql`.
- Postgres now enforces one running provider reconciliation run per provider with a partial unique index.
- In-memory reconciliation-run storage enforces the same overlap rule for tests and local fallback.
- Manual API reconciliation attempts now return `409` when a run is already active for that provider.
- `npm run reconcile:payments` now supports scheduler-safe structured logs, `--mode=once`, `--mode=loop`, `--interval-ms`, provider selection, and exit codes.
- Added `npm run reconcile:payments:loop` for long-running scheduler deployments.
- Added `docs/delivery/payment-reconciliation.md` with schedule, exit-code, overlap, alert, and backfill guidance.

Latest Phase 0 verification on 2026-07-03:

- `npm run check` passed.
- `npm run test --workspace @prima-wash/api` passed with 79 API tests.
- `npm run db:up` started the local Postgres container successfully.
- `npm run db:migrate` applied `0026_internal_permission_users.sql`.
- `npm run db:smoke` passed with 26 applied migrations.
- `npm run test:postgres` passed with 6 Postgres repository integration tests.

Latest Phase 1 auth verification on 2026-07-03:

- Added `0027_auth_challenges_and_sessions.sql`.
- Auth challenges are persisted with hashed codes, attempt counts, and expiry.
- Auth sessions are persisted with expiry and `revoked_at`.
- `/v1/auth/logout` now revokes the current bearer session.
- Protected bearer-token routes now reject revoked or missing persisted sessions.
- Added `0028_auth_rate_limits.sql`.
- Verification-code requests are rate limited by normalized identifier and request source.
- Expired auth challenges, expired sessions, old revoked sessions, and old auth rate-limit events can be pruned with `npm run auth:cleanup --workspace @prima-wash/api`.
- Added an auth-code delivery provider boundary with local development delivery and webhook delivery for production integration.
- Production config now rejects exposed development codes and rejects local auth-code delivery.
- `npm run check` passed.
- `npm run test --workspace @prima-wash/api` passed with 90 API tests.
- `npm run db:migrate` applied `0028_auth_rate_limits.sql`.
- `npm run db:smoke` passed with 28 applied migrations.
- `npm run test:postgres` passed with 8 Postgres repository integration tests.
- `npm run auth:cleanup --workspace @prima-wash/api` passed.

Latest Phase 1 refresh-session verification on 2026-07-04:

- Added `0029_auth_refresh_tokens.sql`.
- Auth sessions now return opaque refresh tokens on verification and refresh.
- Refresh tokens are stored only as hashes, expire separately from access tokens, and rotate on every refresh.
- Refresh-token reuse revokes the full refresh family and linked access sessions.
- `/v1/auth/session/refresh` issues a new access token and rotated refresh token.
- Mobile session restore now refreshes when a stored refresh token exists.
- `npm run check` passed.
- `npm run test --workspace @prima-wash/api` passed with 92 API tests.
- `npm run db:migrate` applied `0029_auth_refresh_tokens.sql`.
- `npm run db:smoke` passed with 29 applied migrations.
- `npm run test:postgres` passed with 8 Postgres repository integration tests.
- `npm run auth:cleanup --workspace @prima-wash/api` passed.

Latest Phase 1 access-invitation verification on 2026-07-04:

- Added `0030_access_invitations.sql`.
- Added `0031_partner_manage_internal_user.sql`.
- Added persisted access invitations for internal, partner, and property-manager users.
- Invitation codes are hashed at rest and expire after seven days.
- Accepted invitations create scoped access memberships and issue bearer/refresh sessions.
- Partner invitations require `partner_manage`, property-manager invitations require `property_manage`, and internal staff invitations require `super_admin`.
- Accepted invitations cannot be reused.
- Added a web admin Access section for creating scoped staff, partner, and property-manager invitations.
- Added invitation list, resend, and revoke actions in the API and web admin Access section.
- Added active access membership management: scoped membership listing, internal permission updates, access deactivation/reactivation, and session/refresh-token revocation on deactivation.
- Access records are deactivated rather than deleted so audit history remains intact.
- Added safeguards so internal memberships keep at least one permission and super admins cannot accidentally remove their own `super_admin` permission.
- Added active access UI affordances for readable scope labels, explicit confirmations, reactivation, and recent access lifecycle activity.
- Added a Partner manager internal profile for browser testing and partner-management invite boundaries.
- Revoked invitations cannot be accepted, and accepted invitations cannot be resent or revoked.
- `npm run check` passed.
- `npm run test --workspace @prima-wash/api` passed with 103 API tests.
- `npm run db:migrate` applied `0031_partner_manage_internal_user.sql`.
- `npm run db:smoke` passed with 31 applied migrations.
- `npm run test:postgres` passed with 9 Postgres repository integration tests.

Latest booking-operations verification on 2026-07-04:

- Added `0032_booking_operational_exceptions.sql`.
- Bookings can now persist active operational exceptions for customer no-show, partner late arrival, access denial, vehicle not found, payment authorization failure, pickup/return issue, property-rule conflict, and weather/safety hold.
- Partner-scoped and internal operators can report/update/resolve booking exceptions through the API with existing partner/internal access boundaries.
- Reporting an exception creates an owner communication thread, audit event, and dashboard-visible booking blocker.
- Resolving an exception clears the active blocker while retaining resolved timestamp history.
- Web operations drawers now show exception chips, exception notes, exception reporting controls, and explicit resolution controls.
- `npm run check` passed.
- `npm run test --workspace @prima-wash/api` passed with 104 API tests.
- `npm run db:migrate` applied `0032_booking_operational_exceptions.sql`.
- `npm run db:smoke` passed with 32 applied migrations.
- `npm run test:postgres` passed with 9 Postgres repository integration tests.

Latest booking lifecycle productionization on 2026-07-05:

- Booking status movement now enforces the operational sequence through the API.
- Active operational exceptions block forward booking movement until resolved.
- Moving a confirmed booking to checked-in automatically records technician check-in when missing.
- Completion now requires technician checkout before payment capture and service-record creation.
- Direct payment capture now requires booking access and a completed booking.
- Partner acceptance also respects active operational exception blockers.
- Web operations queue and drawer controls now show disabled blockers for unresolved exceptions, payment authorization, and missing checkout instead of offering unsafe actions.
- `npm run check` passed.
- `npm run test --workspace @prima-wash/api` passed with 107 API tests.

Latest work-order accountability productionization on 2026-07-05:

- Added `0033_booking_work_order_accountability.sql`.
- Bookings now persist assigned technician name, completion notes, before-service evidence URLs, and after-service evidence URLs.
- Completion now requires technician check-in, technician checkout, assigned technician, completion notes, before evidence, after evidence, no active operational exception, and authorized payment.
- Execution updates validate assignment length, completion-note length, and evidence URL list size/entry length.
- Partner and internal dashboards now receive the work-order accountability fields in queue items.
- Web operations drawer now includes assigned technician, before/after evidence placeholders, completion notes, and checklist gates.
- `npm run check` passed.
- `npm run test --workspace @prima-wash/api` passed with 108 API tests.
- `npm run db:migrate` applied `0033_booking_work_order_accountability.sql`.
- `npm run db:smoke` passed with 33 applied migrations.
- `npm run test:postgres` passed with 9 Postgres repository integration tests.

Latest booking evidence productionization on 2026-07-05:

- Added `0034_booking_evidence.sql`.
- Added append-only `booking_evidence` records with type, URL/storage key, notes, uploader role, uploader user, and timestamp.
- Added memory and Postgres booking-evidence repositories with list, create, and count-by-booking summary support.
- Added `GET /v1/bookings/:id/evidence` and `POST /v1/bookings/:id/evidence` for partner/internal operators with existing booking ownership and internal permission checks.
- Customers and competitor partners cannot write evidence records for a booking.
- Completion now requires persisted before and after evidence records instead of relying on mutable booking URL arrays.
- Partner/internal dashboards now include evidence summaries for queue completion gates.
- Web operations drawer now includes append-only evidence listing and evidence-add controls.
- `npm run check` passed.
- `npm run test --workspace @prima-wash/api` passed with 110 API tests.
- `npm run db:migrate` applied `0034_booking_evidence.sql`.
- `npm run db:smoke` passed with 34 applied migrations.
- `npm run test:postgres` passed with 9 Postgres repository integration tests.

Latest evidence file upload productionization on 2026-07-05:

- Added an evidence-storage provider boundary with in-memory test storage and local development file storage.
- Local/dev API runs now write uploaded evidence files under `var/uploads` by default, configurable with `EVIDENCE_STORAGE_DIRECTORY`.
- Added `POST /v1/bookings/:id/evidence-file` for partner/internal operators to upload image/PDF evidence directly.
- Evidence file uploads enforce booking access, evidence type, allowed content type, non-empty body, and 5 MB max size.
- Successful uploads create append-only booking evidence records with storage keys and audit events.
- Web operations drawer now uses a real file input for evidence uploads instead of asking operators to paste placeholder URLs.
- `npm run check` passed.
- `npm run test --workspace @prima-wash/api` passed with 112 API tests.

Latest booking handover productionization on 2026-07-05:

- Added `0035_booking_handovers.sql`.
- Added append-only `booking_handovers` records for pickup, return, onsite receipt, and onsite release.
- Added memory and Postgres booking-handover repositories with list, create, and count-by-booking summary support.
- Added `GET /v1/bookings/:id/handovers` and `POST /v1/bookings/:id/handovers` for partner/internal operators with existing booking ownership and internal permission checks.
- Customers and competitor partners cannot write handover records for a booking.
- Completion now requires pickup and return records for pickup-return bookings.
- Completion now requires onsite receipt and onsite release records for customer-property and onsite bookings.
- Partner/internal dashboards now include handover summaries for queue completion gates.
- Web operations drawer now includes append-only handover listing and handover-add controls.
- `npm run check` passed.
- `npm run test --workspace @prima-wash/api` passed with 115 API tests.
- `npm run db:migrate` applied `0035_booking_handovers.sql`.
- `npm run db:smoke` passed with 35 applied migrations.
- `npm run test:postgres` passed with 9 Postgres repository integration tests.

Latest customer consent productionization on 2026-07-05:

- Added `0036_booking_consents.sql`.
- Added append-only booking consent records for pickup-return terms and property-service terms.
- Added memory and Postgres booking-consent repositories with list, create, and summary support.
- Added `GET /v1/bookings/:id/consents` and `POST /v1/bookings/:id/consents` for customer-owned bookings.
- Payment intent creation now requires pickup-return consent before payment authorization for pickup-return bookings.
- Payment intent creation now requires property-service consent before payment authorization for customer-property and onsite bookings.
- Customers can now read handover records for their own bookings, while only partner/internal operators can write handover records.
- Mobile review now requires visible consent acknowledgement before checkout for pickup-return and property-service modes.
- Mobile booking detail now shows accepted consents and handover records with a service-mode-specific timeline.
- `npm run check` passed.
- `npm run test --workspace @prima-wash/api` passed with 116 API tests.
- `npm run db:migrate` applied `0036_booking_consents.sql`.
- `npm run db:smoke` passed with 36 applied migrations.
- `npm run test:postgres` passed with 9 Postgres repository integration tests.

Latest payment operation hardening on 2026-07-05:

- Added `0037_payment_operations.sql`.
- Added append-only payment operation records for create, authorize, capture, void, refund, and Stripe webhook reconciliation.
- Added memory and Postgres payment-operation repositories with list and idempotency lookup support.
- Added `GET /v1/internal/payment-operations` for internal finance review with `finance_read` permission.
- Payment intent creation now honors `Idempotency-Key` and `X-Idempotency-Key` for replay protection before creating provider-side intent work.
- Payment operation rows capture actor, request id, provider result details, provider reference, operation source metadata, and idempotency key where applicable.
- `npm run check` passed.
- `npm run test --workspace @prima-wash/api` passed with 118 API tests.
- `npm run db:migrate` applied `0037_payment_operations.sql`.
- `npm run db:smoke` passed with 37 applied migrations.
- `npm run test:postgres` passed with 9 Postgres repository integration tests.

Latest payment idempotency hardening on 2026-07-05:

- Added `0038_payment_operation_idempotency.sql`.
- Added a generic successful-operation idempotency uniqueness guard across payment operations with an idempotency key.
- Payment authorization, direct capture, and refund now honor `Idempotency-Key` and `X-Idempotency-Key` replay protection.
- Failed authorization, capture, and refund attempts after payment access checks now create failed payment-operation ledger records with error message, actor, request id, idempotency key, and source metadata.
- API tests now verify replay protection for create, authorize, direct capture, and refund, plus failed refund ledger visibility.
- `npm run check` passed.
- `npm run test --workspace @prima-wash/api` passed with 121 API tests.
- `npm run db:migrate` applied `0038_payment_operation_idempotency.sql`.
- `npm run db:smoke` passed with 38 applied migrations.
- `npm run test:postgres` passed with 9 Postgres repository integration tests.

Latest payment void idempotency hardening on 2026-07-06:

- Booking cancellation now passes idempotency metadata into the payment void operation path.
- Replayed customer cancellation requests with the same idempotency key now return the already-cancelled booking instead of a false cancellation conflict.
- Payment void operations now write successful payment-operation records from the centralized void helper.
- Failed void attempts after access checks now write failed payment-operation records with actor, request id, idempotency key, provider result where available, source metadata, and error message.
- API tests now verify cancellation replay protection and single-provider-call behavior for payment voids.
- `npm run check` passed.
- `npm run test --workspace @prima-wash/api` passed with 122 API tests.

Latest Stripe production guardrails on 2026-07-06:

- Production config now rejects `PAYMENT_PROVIDER=local`.
- Stripe mode now requires `STRIPE_SECRET_KEY`.
- Production config now requires `STRIPE_WEBHOOK_SECRET`.
- Payment provider config is now typed as `local` or `stripe`.
- API config tests now verify local-payment rejection, missing Stripe secret rejection, missing Stripe webhook secret rejection, and valid production Stripe config.
- `npm run check` passed.
- `npm run test --workspace @prima-wash/api` passed with 125 API tests.

Latest Stripe webhook reconciliation hardening on 2026-07-06:

- Stripe `payment_intent.payment_failed` webhooks now produce a `review_required` reconciliation outcome instead of silently ignoring the failed payment signal.
- Stripe dispute events with a `payment_intent` now produce a `review_required` reconciliation outcome for finance/operations follow-up.
- Stripe `refund.updated` now reconciles captured payments to `refunded`, matching the existing `refund.created` and `charge.refunded` coverage.
- Duplicate webhook deliveries and invalid status-transition webhooks now create skipped payment-operation ledger rows, so finance can see why a provider event did not mutate payment state.
- Review-required webhook outcomes create skipped payment-operation ledger rows with Stripe event id, event type, provider reference, reason, and review code.
- `npm run check` passed.
- `npm run test --workspace @prima-wash/api` passed with 128 API tests.

Latest finance reconciliation dashboard on 2026-07-06:

- Added a read-only Finance section to the web portal for internal users with `finance_read`.
- Finance users can review recent payment-operation ledger rows, filter by search/status/operation/provider, and inspect booking id, payment intent, provider reference, request id, idempotency key, actor, metadata, and recommended follow-up.
- Review-required Stripe webhook outcomes and failed/skipped operations are surfaced as finance work instead of being hidden in backend-only records.
- Partner portal mode does not show the Finance section, and internal profiles without `finance_read` see a restricted state.
- `npm run check --workspace @prima-wash/web` passed.
- `npm run check` passed.
- Inline web script parse check passed with `node -e`.

Latest payment reconciliation case workflow on 2026-07-06:

- Added `0039_payment_reconciliation_cases.sql`.
- Added payment reconciliation cases and append-only case events for payment failed, Stripe dispute, invalid transition, duplicate event, and provider mismatch workflows.
- Added memory and Postgres payment-reconciliation-case repositories.
- Added internal finance API endpoints to list, create, read, and update reconciliation cases.
- Case writes require `finance_write`; case reads require `finance_read`.
- Web Finance users can now open a case from a payment-operation ledger row and update case status/notes from the ledger detail panel.
- `npm run check` passed.
- `npm run test --workspace @prima-wash/api` passed with 130 API tests.
- Inline web script parse check passed with `node -e`.

Latest automated payment reconciliation case workflow on 2026-07-06:

- Added `0040_payment_reconciliation_case_uniqueness.sql`.
- Stripe payment failures, Stripe disputes, duplicate webhook deliveries, and invalid payment status transitions now automatically open finance reconciliation cases from the webhook reconciliation path.
- Automated cases are attributed to the seeded finance account `usr_internal_finance_001` and link back to the payment-operation ledger row, booking, payment intent, provider reference, and Stripe event type.
- Repeated provider events reuse the existing open case and append a note instead of creating duplicate active finance work.
- Postgres now has a partial unique index preventing more than one open provider-event case for the same case type, provider reference, and provider event type.
- `npm run check` passed.
- `npm run test --workspace @prima-wash/api` passed with 131 API tests.

Latest provider mismatch reconciliation automation on 2026-07-06:

- Payment providers can now expose provider payment state through `retrieveState`.
- Payment repositories can now list provider-backed payment intents for bounded reconciliation scans.
- Added `POST /v1/internal/payment-provider-reconciliation-runs` for internal finance users with `finance_write`.
- The reconciliation run compares local payment status with provider-normalized status, records skipped `reconcile` ledger rows for mismatches, and opens/reuses `provider_mismatch` finance cases.
- Provider state read failures create failed reconciliation ledger rows instead of silently disappearing.
- The scan does not mutate local payment status automatically; finance review remains required for mismatches.
- `npm run check` passed.
- `npm run test --workspace @prima-wash/api` passed with 133 API tests.

Latest provider reconciliation dashboard control on 2026-07-06:

- The web Finance dashboard now exposes a finance-write-only provider reconciliation run control.
- Finance users can choose a provider, run the reconciliation scan, see checked/matched/mismatched/failed/cases-opened summary metrics, and immediately refresh into the generated ledger rows/cases.
- Internal profiles without `finance_write` can still read the ledger when allowed, but the provider reconciliation control is disabled.
- Inline web script parse check passed with `node -e`.
- `npm run check --workspace @prima-wash/web` passed.
- `npm run check` passed.

Latest operational provider reconciliation runs on 2026-07-06:

- Added `0041_payment_provider_reconciliation_runs.sql`.
- Provider reconciliation runs now persist run history with provider, status, actor, request id, checked/matched/mismatched/failed/cases-opened counts, error message, and timestamps.
- Added memory and Postgres repositories for provider reconciliation run history.
- Moved provider mismatch reconciliation into a reusable service used by both API and CLI entry points.
- Added `GET /v1/internal/payment-provider-reconciliation-runs` for finance-read history review.
- Added root and API package command `npm run reconcile:payments` for scheduled jobs/cron-style execution; later hardened with loop mode and overlap protection on 2026-07-07.
- The web Finance dashboard now shows recent provider reconciliation runs below the run summary.
- `npm run check` passed.
- `npm run test --workspace @prima-wash/api` passed with 133 API tests.
- Inline web script parse check passed with `node -e`.

## Product Direction

Prima Wash is not only a marketplace for car washing. The stronger product is a vehicle-care operating system that can support property-approved onsite care, customer drive-to-partner appointments, pickup-and-return service, and eventually market-specific models outside Singapore.

Singapore remains the first go-to-market wedge, with condo activation as the primary demand and operations strategy. That does not exclude HDB residents, landed-property owners, offices, fleets, or open-market customers.

The customer must always have more than one fulfilment path where available:

- Property-approved care: condo Prima Wash Days, HDB car park pilots if approved, landed-home care where operationally possible.
- Drive to a trusted partner nearby.
- Pickup and return, where partner capability, insurance, and handover policy allow it.

Prima Wash Days are temporary, management-approved vehicle-care operations inside existing property infrastructure. They are not a booking of a permanent wash bay. A property can have as many Prima Wash Days as needed; the platform must not enforce weekly or monthly caps. Prima Wash admins and property management offices should be able to configure those settings.

The long-term architecture should support multiple market modes:

- Residence partnership: Singapore condo/HDB-style property operations.
- Open marketplace: customer drives to verified partners.
- Mobile dispatch: onsite or home service without a property agreement.
- Fleet or corporate: scheduled care for businesses and managed lots.

## Non-Negotiable Memory

- No realtime messaging yet.
- No production push notifications yet.
- Current notifications are local-device reminders in the mobile app where supported.
- Communication messages are append-only product records. Neither party should be able to delete messages.
- Business partners must only see their own bookings, availability, messages, and operational data.
- Prima Wash internal users need role-based permissions; not every employee should see or modify everything.
- Condo, HDB, landed, and other residence types should not remove the drive-to-partner or pickup-and-return options.
- Condo operations must support no permanent wash bay, temporary visitor-lot/service-area use, site-specific instructions, water policy, vehicle movement permissions, and check-in/check-out.
- The platform should be global-ready from the start through market configuration, not a hard fork of the product.

## Current Implementation

The repository is a TypeScript monorepo with:

- `apps/api`: dependency-light Node HTTP API, modular repositories, Postgres migrations, in-memory repositories for tests/local fallback.
- `apps/mobile`: Expo Router customer app.
- `apps/web`: static internal/partner/property-management browser portal.
- `packages/contracts`: shared API and domain contracts.

Backend foundations now include:

- Postgres migrations through `0042_payment_provider_reconciliation_run_lock.sql`.
- Repository adapters for memory and Postgres.
- OTP-style auth code request/verify.
- Persisted verification challenges and revocable auth sessions.
- Rotating refresh tokens with hashed storage, reuse detection, and refresh-family revocation.
- Verification-code request throttling and auth cleanup script.
- Auth-code delivery provider abstraction with local and webhook modes.
- Signed bearer access tokens.
- Access memberships for partner, internal, and property-manager scoping.
- Persisted access invitations for staff, partners, and property managers, with scoped membership creation on acceptance.
- Internal permissions including operations, finance, property, partner, and super-admin permissions.
- Customer profiles, residential profiles, garage vehicles, and service records.
- Property records, property interests, condo activation pipeline, condo operational profiles, and Prima Wash Days.
- Booking holds, bookings, service modes, partner decisions, execution fields, status transitions, cancellations, audit events, and product events.
- Booking operational exception reporting and resolution with scoped access checks, audit events, owner communication threads, and dashboard-visible blockers.
- Hardened booking lifecycle controls for payment authorization, partner acceptance, technician check-in/check-out, completion, capture, cancellation, and active exception blockers.
- Work-order accountability metadata for assigned technician, completion notes, legacy before/after URL placeholders, append-only booking evidence records, and completion quality gates.
- Payment intents with local and Stripe providers, manual authorization/capture/refund/void concepts, billing sessions, payment methods, Stripe webhook reconciliation tests for authorization, capture, cancel, refund, failed payment, and dispute review, append-only payment operation records, create/authorize/capture/refund/void idempotency-key replay protection, skipped webhook reconciliation ledger records, failed-operation ledger records, finance-owned reconciliation cases with append-only case events, automated finance case creation for payment failures, disputes, duplicate webhooks, and invalid payment transitions, and a finance-only provider mismatch reconciliation run.
- Communication threads/messages for Prima Wash, customers, partners, and property offices.
- Partner scheduling, capacity templates, resource pools, closure exceptions, dynamic availability, and capacity enforcement.

Customer mobile app currently includes:

- Login and verification code flow.
- Session storage and bearer API calls.
- Refresh-token session restoration and rotation.
- Residence setup for condo/HDB/landed-style profiles.
- Garage vehicle add/edit/delete.
- Partner discovery with manual/current location preference.
- Condo Prima Wash Day discovery.
- Service, time, review, checkout, confirmation, booking detail, cancellation, and service-history flows.
- Local notification preference screens and local appointment reminder scheduling.
- Payment-method and payment-history screens.

Web portal currently includes:

- Operator dashboard with internal and partner modes.
- Partner-location switching for local testing.
- Internal permission profile switching for local testing.
- Partner queue and scoped partner dashboard.
- Internal operations dashboard.
- Condo activation lead management.
- Condo operational profile and Prima Wash Day management.
- Property-management scoped dashboard.
- Internal finance reconciliation dashboard for payment-operation ledger review, finance case workflow, manual provider reconciliation runs, and recent provider reconciliation run history.
- Booking drawer, work-order instructions, partner decisions, status actions, and communications.

## Important Current Gaps

Auth and identity:

- Auth challenges are now persisted in Postgres-backed environments.
- Logout now revokes a persisted server-side session.
- Refresh-token rotation exists for customer, partner, property-manager, and internal bearer sessions.
- No direct email/SMS vendor adapter is connected yet. A webhook delivery boundary exists for production integration.
- Basic verification-code request rate limiting exists. Broader abuse prevention for search, booking, payment, account recovery, and privileged operations is still needed.
- No MFA or production identity provider.
- Staff, partner, and property-manager invite creation, listing, resend, and revocation now exist in the API and web admin UI. Expiry automation and deeper account-management screens still need to be built.
- Development header auth still exists for local/dev and must be disabled in production.

Payments and finance:

- Stripe provider code exists, and payment operation records now provide a structured internal finance ledger for payment lifecycle review.
- A first internal web finance dashboard now exposes ledger review, filters, detail metadata, recommended follow-up text, and finance-owned reconciliation case workflow.
- Production config now refuses to start with local payments, missing Stripe secret key, or missing Stripe webhook secret.
- Production operation still needs Stripe charge-ID-only dispute mapping, formal reconciliation runbooks, capture/refund runbooks, receipt/tax logic, and deeper finance reporting. Provider mismatch detection now exists, but still needs scheduled execution and finance reporting.
- Local payment mode is still the default development path, but is blocked in production.
- Partner payout, commission, settlement, and dispute handling are not implemented.

Operations:

- Booking lifecycle is mostly modeled, real evidence file intake exists, booking handover records now exist for pickup, return, onsite receipt, and onsite release, and customer consent records now gate payment authorization for sensitive service modes. Remaining proof-layer work includes legal text finalization, optional signature capture, richer issue reporting, quality sign-off, and production object storage integration.
- Condo operations exist, but the standardized playbook/template system is still early.
- HDB and landed-property operations need policy and configuration maturity before launch.

Product and UX:

- The customer app has real API flows but still needs production polish, clearer state handling, stronger empty/error states, and route-level QA.
- The web portal is still a single static surface rather than a finished role-specific product shell.
- Internal admin, partner, property-management, and customer experiences need separate navigation and richer permission-management screens.
- Some older product docs may still need periodic review, but the active API, security, delivery, and current-memory docs now reflect the bearer-session, access-membership, Postgres-default baseline.

Platform readiness:

- Docker/compose exists for local services, but production deployment, managed database setup, backups, restore drills, secret management, CI gates, observability, and incident workflows are not launch-ready.
- The latest DB migration is now `0042_payment_provider_reconciliation_run_lock.sql`; apply and smoke-test it whenever a local or staging Postgres database is refreshed.

## Readiness Assessment

Current practical readiness: 5 out of 10.

The product is no longer a simple mock. It has meaningful backend domain shape and API coverage. It is not ready for a public launch because the trust, money, production identity, operational proof, and deployment layers still need hardening.

With a focused team and AI acceleration, a controlled pilot can plausibly be reached quickly. A public launch should not be compressed until payments, identity, support, operations, and observability are reliable.

## Revised Roadmap

### Phase 0: Stabilize Current Baseline

Goal: make the current state reliable and explicit.

- Apply all migrations against local Postgres.
- Run DB smoke checks and Postgres integration tests.
- Update stale docs that still describe old auth and persistence assumptions.
- Keep this memory document current.
- Confirm dev startup commands and verification scripts.
- Make local demo users, roles, and URLs explicit.

Exit criteria:

- `npm run check` passes.
- API unit tests pass.
- Postgres migrations and smoke test pass.
- Known local limitations are documented.

### Phase 1: Production Identity and Access Control

Goal: replace temporary auth behavior with a production-grade identity foundation.

- Persist auth challenges in Postgres. Completed 2026-07-03.
- Persist revocable auth sessions and make logout revoke the current session. Completed 2026-07-03.
- Add auth attempt rate limiting and challenge/session expiry cleanup. Completed for verification-code requests and cleanup script on 2026-07-03.
- Add auth-code delivery abstraction and production safety gates. Completed 2026-07-03 with local and webhook provider modes.
- Add refresh-token rotation or another secure session renewal model. Completed 2026-07-04.
- Add broader abuse controls for search, booking, payment, account recovery, and privileged actions.
- Connect a real email/SMS provider behind the delivery boundary.
- Create staff, partner, and property-manager invite flows. Completed for API/repository and admin creation/list/resend/revoke UI on 2026-07-04; expiry automation and deeper account-management screens remain.
- Disable dev header auth in non-local environments.
- Add admin user management for roles and internal permissions.

Exit criteria:

- No production user depends on development codes or trusted headers.
- Partners cannot access competitor data through API or UI.
- Internal users can only perform actions allowed by their permission profile.

### Phase 2: Payment and Money Hardening

Goal: make booking payment safe enough for real customers.

- Make Stripe the production provider with environment-gated local mode. Completed production config guardrails on 2026-07-06.
- Complete webhook handling for payment succeeded, requires capture, failed, cancelled, refunded, and disputes where applicable. Completed first production-critical coverage on 2026-07-06 for authorization, capture, cancel, refund create/update, payment failure review, dispute review when Stripe provides `payment_intent`, duplicate replay, invalid transition auditability, and automated finance case creation for webhook review work. Charge-ID-only dispute mapping and operational runbooks remain.
- Add idempotency keys for payment operations. Completed for payment-intent creation, authorization, direct capture, refund, and cancellation-driven void replay protection by 2026-07-06.
- Add finance reconciliation views. Completed first internal API ledger endpoint on 2026-07-05, first web finance dashboard on 2026-07-06, manual finance reconciliation case workflow on 2026-07-06, automated webhook-triggered finance cases on 2026-07-06, provider mismatch reconciliation run on 2026-07-06, web run control on 2026-07-06, persisted run history on 2026-07-06, and CLI/scheduled-job entry point on 2026-07-06; deployment scheduler wiring and deeper finance reporting remain.
- Add receipt, refund, cancellation-fee, and tax policy placeholders.
- Document manual operational runbooks for failed authorization, expired authorization, capture failure, refund, and dispute.

Exit criteria:

- A booking can be authorized, accepted, completed, captured, cancelled, voided, and refunded with auditable records.
- Finance can reconcile customer-visible payments with provider state.

### Phase 3: One Golden Booking Lifecycle

Goal: make one complete workflow feel and behave like a real product.

- Customer selects residence, vehicle, service mode, partner/property, service, slot, and payment.
- Appointment hold prevents double booking.
- Partner accepts or requests clarification.
- Customer sees status changes.
- Technician/partner checks vehicle in, starts service, completes service.
- Payment captures on completion.
- Service record is generated.
- Cancellation before check-in releases/voids payment.
- Pickup-and-return requires handover records before completion. Completed for partner/internal API, dashboard queue summary, and operator drawer on 2026-07-05.
- On-property service requires onsite receipt and release records before completion. Completed for partner/internal API, dashboard queue summary, and operator drawer on 2026-07-05.
- Customer-visible consent records and mobile acknowledgement UX are implemented. Production legal text and optional signature capture still need policy finalization.

Exit criteria:

- One booking can be created and completed end to end without manual DB intervention.
- Both customer and operator views show the same source-of-truth state.

### Phase 4: Role-Specific Product Shells

Goal: separate real product experiences from local testing controls.

- Customer mobile app remains customer-only.
- Partner portal shows only partner-owned bookings, availability, templates, messages, and finance summaries.
- Property-management portal shows only its property, operating profile, Prima Wash Days, resident demand, and office communication.
- Prima Wash admin portal is separated into operations, property, finance, partner management, and super-admin areas.
- Local demo switchers move behind a development-only panel.

Exit criteria:

- Users do not need to know query params or special URLs.
- Permission boundaries are visible in the UI and enforced by the API.

### Phase 5: Customer Mobile UX Hardening

Goal: make the customer app feel premium, trustworthy, and ready for real users.

- Polish onboarding for condo, HDB, landed, and open-market customers.
- Make service-mode selection explicit: property service, drive to partner, pickup and return.
- Improve booking review, payment, confirmation, cancellation, and support states.
- Add stronger garage UX for multiple vehicles.
- Improve booking detail and service timeline.
- Add better offline/loading/error states.
- Verify iOS, Android, and web preview layouts.

Exit criteria:

- A first-time user can understand what service mode they are choosing and why.
- No core flow feels like a demo or dead end.

### Phase 6: Condo and Property Operations Playbook

Goal: turn condo operations into a repeatable competitive advantage.

- Operational profile templates for common property types.
- Approved service areas, water policy, movement policy, safety notes, access notes, and management contacts.
- Multiple Prima Wash Days with no artificial cap.
- Partner/technician check-in and check-out.
- Site-specific technician instructions.
- Capacity per temporary service area.
- Office-management communication and change log.
- Playbook templates for new condos, HDB car parks, landed-home service, and commercial sites.

Exit criteria:

- A new property can be configured from a proven template in minutes.
- Technicians can operate onsite without relying on informal instructions.

### Phase 7: Deployment, Observability, and Data Safety

Goal: make the platform operable outside a laptop.

- Staging and production environments.
- Managed Postgres with migrations in release flow.
- Secret management.
- Structured logs, metrics, error tracking, and audit retention.
- Backup and restore drill.
- CI checks for typecheck, tests, migrations, and build.
- Environment-specific CORS and security configuration.

Exit criteria:

- A failed deploy can be detected and rolled back.
- A database restore can be performed and verified.

### Phase 8: Pilot Legal, Support, and SOPs

Goal: reduce business and operational risk before inviting real users.

- Terms, privacy, cancellation, refund, pickup/return, damage, liability, and insurance policy drafts.
- Support workflows for customer, partner, and property-office issues.
- Incident workflow for vehicle damage, missed appointment, access denial, late partner, and failed payment.
- Partner onboarding checklist.
- Property-management onboarding checklist.
- Pilot reporting dashboard.

Exit criteria:

- The team knows exactly what to do when a real booking goes wrong.

### Phase 9: Controlled Singapore Pilot

Goal: validate the model in the smallest real operating environment.

- 1-2 properties.
- 1-2 trusted partners.
- Limited service catalog.
- Limited service windows.
- Manual support coverage.
- Daily operational review.
- Track activation, booking conversion, completion rate, cancellation rate, payment issues, partner SLA, resident satisfaction, and property-management satisfaction.

Exit criteria:

- The operation can run repeatedly without heroic manual coordination.

### Phase 10: Expansion and Globalization

Goal: prepare for scale after the pilot proves the operating model.

- Market configuration for countries, currencies, taxes, policies, residence labels, service catalogs, and supported service modes.
- Partner payout and settlement model.
- Memberships/subscriptions if validated.
- Service proof and quality scoring.
- Partner performance management.
- HDB/commercial/property expansion.
- Open marketplace expansion outside Singapore.

Exit criteria:

- New markets can be configured rather than forked.

## Five-Day Intensive Focus

Another intense five days can create a major readiness jump, but it should not be treated as full public-launch completion. The best use of five days is:

Day 1: Stabilize DB, docs, migration verification, and local runbooks.

Day 2: Persist auth challenges/sessions, add logout revocation, and harden role-based access.

Day 3: Harden Stripe payment lifecycle and finance reconciliation basics.

Day 4: Finish the golden booking lifecycle with partner acceptance, execution, completion, capture, cancellation, and service record QA.

Day 5: Polish the role-specific operator/customer UX, deploy staging, and document pilot SOPs.

This can move readiness from roughly 5/10 toward 7/10 for a controlled pilot. It is unlikely to make the platform responsibly public-launch-ready without additional real-world testing, policy, support, and operations work.

## Verification Commands

From the repo root:

```powershell
npm run check
npm run test --workspace @prima-wash/api
npm run db:up
npm run db:migrate
npm run db:smoke
npm run test:postgres
```

Local app commands:

```powershell
npm run dev:api:local
npm run dev:web
npm run dev:mobile:web
```

Known local note: Docker/Postgres must be running before DB smoke and Postgres integration tests can pass.
