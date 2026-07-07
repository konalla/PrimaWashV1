create unique index if not exists payment_provider_reconciliation_runs_one_running_provider_idx
  on payment_provider_reconciliation_runs(provider)
  where status = 'running';
