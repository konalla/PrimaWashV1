# Prima Wash Current Memory and Readiness Plan

Last updated: 2026-07-04

This document is the current working memory for Prima Wash. It consolidates the product direction, what has already been built, what remains, and the phased path to pilot and launch readiness.

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

- Postgres migrations through `0031_partner_manage_internal_user.sql`.
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
- Payment intents with local and Stripe providers, manual authorization/capture/refund/void concepts, billing sessions, payment methods, and Stripe webhook reconciliation tests.
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

- Stripe provider code exists, but production operation still needs full webhook coverage, reconciliation, capture/refund runbooks, failure handling, receipt/tax logic, and finance visibility.
- Local payment mode is still the default development path.
- Partner payout, commission, settlement, and dispute handling are not implemented.

Operations:

- Booking lifecycle is mostly modeled, but the real-world service proof layer is still missing: photos, checklist completion, handover, pickup/return consent, issue reporting, technician assignment, and quality sign-off.
- Condo operations exist, but the standardized playbook/template system is still early.
- HDB and landed-property operations need policy and configuration maturity before launch.

Product and UX:

- The customer app has real API flows but still needs production polish, clearer state handling, stronger empty/error states, and route-level QA.
- The web portal is still a single static surface rather than a finished role-specific product shell.
- Internal admin, partner, property-management, and customer experiences need separate navigation and richer permission-management screens.
- Some older product docs may still need periodic review, but the active API, security, delivery, and current-memory docs now reflect the bearer-session, access-membership, Postgres-default baseline.

Platform readiness:

- Docker/compose exists for local services, but production deployment, managed database setup, backups, restore drills, secret management, CI gates, observability, and incident workflows are not launch-ready.
- The latest DB migration is applied and smoke-tested in the current local Postgres database as of 2026-07-04. Migrations must still be applied and smoke-tested whenever a local or staging Postgres database is refreshed.

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

- Make Stripe the production provider with environment-gated local mode.
- Complete webhook handling for payment succeeded, requires capture, failed, cancelled, refunded, and disputes where applicable.
- Add idempotency keys for payment operations.
- Add finance reconciliation views.
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
- Pickup-and-return requires explicit consent and handover notes.

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
npm run dev:api
npm run dev:web
npm run dev:mobile:web
```

Known local note: Docker/Postgres must be running before DB smoke and Postgres integration tests can pass.
