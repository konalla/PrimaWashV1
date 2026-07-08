# Prima Wash Launch Freeze Checklist

Last updated: 2026-07-07

This is the active finish-line document. The product is now in launch-freeze mode: no new feature work unless it removes a launch blocker below.

## Launch Target

Launch a controlled Singapore pilot, not a broad public launch.

Pilot constraints:

- Small number of invited customers.
- Small number of trusted partners.
- Small number of configured properties/condos.
- Manual support coverage by Prima Wash.
- Stripe-backed payment flow.
- Postgres-backed production-like persistence.
- No realtime chat and no production push notifications.

## Definition of Done for Pilot

Prima Wash is pilot-ready when:

1. A customer can sign in, manage vehicle, choose service mode, book, authorize payment, track status, message, cancel where allowed, and see completed service history.
2. A partner can sign in, see only its bookings, accept/request clarification/reject mode, check in, record handover/evidence, complete service, and message the owner.
3. Prima Wash admin can see operations, manage bookings, manage access, create/track property/condo work, and review payment exceptions.
4. Property management can access only its property dashboard, operating profile, Prima Wash Days, and office communication.
5. Payments are auditable: authorize, capture, void, refund, Stripe webhook review, failed payment review, dispute review, and provider mismatch reconciliation.
6. Production-like config cannot start in unsafe modes: no memory persistence, no local payments, no local auth-code delivery, no exposed development codes, no broad CORS, no trusted dev headers.
7. Vehicle evidence and operational records are durable enough for pilot dispute/support needs.
8. The team has an explicit manual SOP for the situations the product does not automate yet.

## Must Fix Before Pilot

These are the only implementation buckets that should remain before pilot.

### 1. Remove or Gate Demo/Login Switchers From Real Deployments

Why: the current web portal still has local testing affordances such as partner-location switching, internal permission profile switching, and hardcoded local demo identifiers. These are useful locally but unacceptable in a real partner/admin/property environment.

Status: implemented on 2026-07-07 for the web portal shell. Demo auth-code login, partner-location switching, and internal permission switching are now available only on localhost/127.0.0.1 unless explicitly disabled with `?demo=false`. Non-local web origins require an issued bearer access token in `sessionStorage.primaWebAccessToken`, `localStorage.primaWebAccessToken`, or a one-time `accessToken` query parameter that is immediately removed from the URL.

Done when:

- Real deployments do not auto-login demo users.
- Real deployments do not show partner-location switchers to partners.
- Real deployments do not show internal permission profile switchers.
- Partner, property-manager, and internal users land in role-appropriate views based on their bearer session.
- Local/demo switchers are available only in an explicit development mode.

### 2. Configure Production-Like Auth Delivery

Why: the platform has a webhook delivery boundary, but no selected email/SMS sender is wired for real OTP/invitation delivery.

Status: backend webhook delivery was hardened on 2026-07-07 with timeout, retry, delivery-id/idempotency headers, channel metadata, and tests proving codes are not exposed to clients. A deployable `@prima-wash/delivery-relay` service now receives that webhook, sends email through SMTP, and can hand SMS traffic to an external SMS webhook. `compose.staging-auth.yaml` now rehearses this path locally with Mailpit while `SHOW_DEV_AUTH_CODE=false` and `ALLOW_DEV_HEADER_AUTH=false`. `npm run auth:delivery:rehearse` automates customer login plus partner invitation delivery/acceptance through Mailpit. It still needs staging SMTP/SMS secrets and a live staging rehearsal for final signoff.

Done when:

- `AUTH_CODE_DELIVERY_PROVIDER=webhook` works in staging.
- The webhook provider sends real verification/invitation codes to the intended recipient channel.
- `SHOW_DEV_AUTH_CODE=false`.
- `ALLOW_DEV_HEADER_AUTH=false`.
- Staff, partner, and property-manager invitations can be created, delivered, accepted, and revoked in staging.

### 3. Run a Stripe Test-Mode Payment Rehearsal

Why: Stripe provider code and webhooks exist, but the pilot must prove the real provider path end to end before taking real bookings.

Status: an automated rehearsal command was added on 2026-07-08. `npm run payments:stripe:rehearse` exercises auth delivery, partner availability, customer booking, Stripe PaymentIntent creation/confirmation, API authorization, operational completion capture, internal refund, authorization voiding on cancellation, and partner queue scope checks. It still must be run successfully in staging with Stripe test-mode secrets and production-like auth delivery before this item is complete.

Done when:

- `PAYMENT_PROVIDER=stripe` is used in staging.
- Stripe secret key and webhook secret are configured via secrets.
- Customer can authorize a real Stripe test payment.
- Completion captures payment.
- Cancellation before service voids authorization.
- Refund can be issued from internal flow.
- Stripe webhook events create/update payment operation records.
- Finance dashboard shows payment ledger, reconciliation cases, evidence packs, and requested evidence status.

### 4. Make Evidence Storage Durable for Pilot

Why: partner proof, handover proof, and finance evidence are trust records. Local container filesystem storage is not enough unless it is backed by a durable mounted volume and backup.

Done when:

- Pilot evidence uploads persist across API restarts/redeploys.
- Evidence storage location is backed up or otherwise recoverable.
- `EVIDENCE_STORAGE_DIRECTORY` and `EVIDENCE_PUBLIC_BASE_URL` are set intentionally.
- The team confirms who can access uploaded evidence files.

### 5. Staging Deployment and Database Release Runbook

Why: the app has Dockerfiles, migrations, and compose, but pilot needs a repeatable release path.

Done when:

- Staging API and web are deployed from the current repo.
- Managed or durable Postgres is configured.
- `npm run db:migrate` is part of the release procedure.
- `npm run db:smoke` passes against staging database.
- Backup and restore procedure is documented, even if manual for pilot.
- Payment reconciliation scheduler is either running or deliberately operated manually with a schedule.

### 6. Golden Path QA Signoff

Why: the codebase has broad tests, but pilot needs browser/mobile behavior confirmed by role.

Done when these flows are manually verified in staging:

- Customer mobile: login, residence, garage, partner/property service options, booking, consent, payment authorization, booking detail, support message, cancellation.
- Partner web: login, scoped queue, accept booking, upload before/after evidence, record handover when required, complete booking, owner message, finance evidence task.
- Admin web: operations queue, finance ledger, reconciliation case, evidence pack, access invitation, property/condo lead, Prima Wash Day.
- Property manager web: scoped property dashboard, operational profile update, office communication.
- RBAC negative checks: partner cannot access competitor booking; property manager cannot access another property; customer cannot access another owner booking; non-finance user cannot use finance write actions.

### 7. Pilot SOP Pack

Why: some launch risks are business/operations, not code.

Done when the team has written pilot SOPs for:

- Customer cancellation/refund.
- Failed payment authorization.
- Partner late/no-show.
- Customer no-show.
- Property access denied.
- Vehicle damage or dispute.
- Pickup/return issue.
- Stripe dispute.
- Manual partner payout/settlement.
- Daily pilot review.

## Can Pilot With Manual Workaround

These are acceptable for controlled pilot if the manual owner is explicit.

- No realtime messaging. Use persisted messages plus manual refresh.
- No production push notifications. Use email/SMS/manual support outside the app if urgent.
- No partner payout automation. Track settlements manually.
- No tax/receipt automation beyond payment records. Issue any formal invoice/receipt manually if needed.
- No full MFA. Limit pilot admin users and keep strong operational controls.
- No advanced analytics. Use finance ledger, audit logs, and manual daily review.
- No automated charge-ID-only Stripe dispute mapping. Use Stripe dashboard plus finance case notes manually.
- No fully polished role-specific web shells. Accept if demo switchers are hidden/gated from real users.
- No App Store/Public Play Store launch. Use Expo/dev/internal distribution or a limited web/mobile preview path suitable for pilot.

## Post-Pilot Only

Do not work on these until the pilot is live and stable:

- Realtime chat.
- Push notifications.
- Subscriptions/memberships.
- Partner payout automation.
- Advanced finance reporting.
- Automated Stripe evidence submission.
- Full multi-market configuration UI.
- HDB authority workflow automation.
- ML/AI partner matching or optimization.
- Public marketing site polish beyond what pilot requires.
- Large UI redesigns that do not unblock pilot usage.

## Fixed Implementation Order

1. Gate demo/local web controls from staging/production.
2. Wire production-like OTP/invitation delivery.
3. Prove Stripe test-mode golden payment path.
4. Make evidence storage durable for pilot.
5. Deploy staging and run migration/smoke/reconciliation jobs.
6. Run cross-role QA and fix only launch-blocking defects.
7. Write/confirm pilot SOP pack.
8. Freeze, tag pilot build, and onboard the first controlled users.

## Stop Rule

If a proposed task does not directly complete one of the Must Fix items, it is post-pilot by default.
