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
