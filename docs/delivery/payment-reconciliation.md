# Payment Reconciliation Operations

Prima Wash has two provider reconciliation modes:

- Manual run from the Finance dashboard.
- Scheduled run from `npm run reconcile:payments` or `npm run reconcile:payments:loop`.

The scheduled job compares local payment records with provider payment state, writes an append-only payment-operation ledger row for mismatches or provider read failures, and opens or updates finance reconciliation cases.

## Commands

Single run:

```powershell
npm run reconcile:payments -- --provider=stripe --limit=200
```

Long-running scheduler loop:

```powershell
npm run reconcile:payments:loop -- --provider=stripe --limit=200 --interval-ms=900000
```

Equivalent environment variables:

- `PAYMENT_RECONCILIATION_PROVIDER`: provider to scan, normally `stripe`.
- `PAYMENT_RECONCILIATION_LIMIT`: maximum payment intents scanned per run. Default `200`.
- `PAYMENT_RECONCILIATION_MODE`: `once` or `loop`. Default `once`.
- `PAYMENT_RECONCILIATION_INTERVAL_MS`: loop interval. Minimum `60000`; default `900000`.

## Exit Codes

- `0`: run completed or scheduler stopped cleanly.
- `1`: run failed or crashed.
- `2`: run skipped because another run for the same provider is already running.

## Overlap Protection

Only one running reconciliation is allowed per provider. The API/repository layer enforces this, and Postgres has a partial unique index on running provider runs. This protects against two dashboard clicks, two cron jobs, or a dashboard run and scheduled job happening at the same time.

If a scheduler receives exit code `2`, check the Finance dashboard recent run list. If a run remains `running` far beyond the normal interval, treat it as an operational incident and inspect API/job logs before starting another run.

## Recommended Schedule

For staging and pilot production:

- Run every 15 minutes.
- Limit each run to 200 recent provider-backed payment intents.
- Alert on any `failed` run.
- Alert if the newest successful run is older than 60 minutes.
- Alert if the same provider has a `running` run older than the expected interval plus 10 minutes.

## Manual Backfill

Use a larger limit during supervised finance review:

```powershell
npm run reconcile:payments -- --provider=stripe --limit=500
```

Backfills should be run by finance/operations staff only. They are safe to replay because provider-event finance cases are deduplicated while new evidence is appended as case events.

## Case Guidance

Every finance reconciliation case carries derived guidance in the API and Finance dashboard. Guidance is not stored as mutable case data; it is computed from case type and status so the runbook can improve without rewriting historical records.

Standard guidance fields:

- `runbookKey`: stable key for the active procedure.
- `recommendedAction`: machine-readable action for the Finance dashboard.
- `actionLabel`: user-facing action label.
- `ownerTeam`: finance, support, partner operations, or engineering.
- `severity`: low, medium, high, or critical.
- `slaHours`: target time for first meaningful action.
- `customerImpact`: plain-language risk to the customer or booking.
- `nextStep`: first action expected from the case owner.

## Evidence Packs

Finance users can load an evidence pack for a reconciliation case from:

```text
GET /v1/internal/payment-reconciliation-cases/:id/evidence-pack
```

The endpoint requires `finance_read` and assembles the pack at read time from existing operational records. It does not create mutable evidence-pack records.

Pack contents:

- Reconciliation case and case event timeline.
- Booking, vehicle, partner location, and payment intent records when available.
- Payment operation ledger rows for the booking.
- Booking evidence records.
- Booking handover records.
- Booking consent records.
- Completed service record when available.
- Booking and owner communication threads with messages.
- Recent audit events linked to the case, booking, payment operation, payment intent, vehicle, or partner location.
- Checklist showing present, missing, and not-applicable evidence items.

The Finance dashboard exposes the pack from the selected ledger row when a reconciliation case is linked. Use the checklist to decide whether the case is ready for dispute evidence, customer follow-up, partner escalation, refund, write-off, or engineering escalation.

The dashboard evidence-pack view also shows the underlying booking, vehicle, partner, payment, operational proof, communication, and linked audit records. Finance can download a text summary from the loaded pack for internal review or Stripe dispute preparation.

Missing checklist items that can be supplied externally can be requested from the pack view:

```text
POST /v1/internal/payment-reconciliation-cases/:id/evidence-requests
```

The endpoint requires `finance_write`. It does not delete or mutate evidence records. It appends a booking-scoped communication thread/message, adds a reconciliation case event, writes an audit event, and moves the case to `waiting_partner` or `waiting_customer` depending on the request target. PDF export and direct Stripe evidence submission are future hardening steps.

Evidence packs also include a requested-evidence status section. Each finance request is derived from append-only communication messages and marked `open` until matching proof is present in booking evidence, handover, consent, or service-record data. This lets Finance decide whether a case can move out of `waiting_partner` or `waiting_customer` without manually cross-checking every operational record.

## Operational Runbooks

Payment failed:

- Owner: support, with finance available for provider checks.
- SLA: 4 hours during operating hours.
- Action: verify provider failure reason, ask the customer to retry or use a different payment method, and do not confirm service until payment is authorized.
- Resolution notes must include the provider reason, customer instruction sent, final payment outcome, and whether the booking remained active.

Stripe dispute:

- Owner: finance.
- SLA: 4 hours for first evidence review.
- Action: collect booking, payment, vehicle, service, partner, and message records before deciding evidence submission, refund, or write-off.
- Do not refund, capture, or write off manually until the evidence bundle and Stripe dispute deadline are checked.
- Resolution notes must include dispute reference, evidence decision, customer impact, and final money movement.

Invalid payment transition:

- Owner: engineering, with finance review.
- SLA: 8 hours.
- Action: compare local payment status, provider event type, request id, idempotency key, and previous ledger operations.
- Do not manually mutate payment state before engineering confirms whether the event is stale, out of order, malformed, or a real integration defect.
- Resolution notes must include root cause, affected booking/payment ids, and whether a code or data correction was required.

Duplicate provider event:

- Owner: finance.
- SLA: 48 hours.
- Action: confirm the original provider event was already processed once and no second customer charge, refund, capture, or status transition occurred.
- Resolution notes must include duplicate event id, original processed operation id, and a no-customer-impact confirmation.

Provider mismatch:

- Owner: finance.
- SLA: 8 hours.
- Action: compare provider status against local booking and payment state, then choose the approved path: capture, void, refund, retry, write-off, or engineering escalation.
- Resolution notes must include provider status, local status, final action, and whether the customer or partner was contacted.

Waiting customer:

- Owner: support.
- SLA: 24 hours.
- Action: contact the customer with the booking reference and requested action.
- Resolution notes must include the customer message channel, time sent, and customer outcome.

Waiting partner:

- Owner: partner operations.
- SLA: 24 hours.
- Action: request service proof, check-in/check-out evidence, and any terminal/provider receipt from the partner.
- Resolution notes must include partner response, evidence received, and operational decision.
