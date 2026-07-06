create table if not exists payment_provider_reconciliation_runs (
  id text primary key,
  provider text not null,
  status text not null check (status in ('running', 'completed', 'failed')),
  actor_user_id text references users(id),
  request_id text,
  checked_count integer not null default 0,
  matched_count integer not null default 0,
  mismatched_count integer not null default 0,
  failed_count integer not null default 0,
  cases_opened_count integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists payment_provider_reconciliation_runs_started_idx
  on payment_provider_reconciliation_runs(started_at desc);

create index if not exists payment_provider_reconciliation_runs_provider_started_idx
  on payment_provider_reconciliation_runs(provider, started_at desc);
