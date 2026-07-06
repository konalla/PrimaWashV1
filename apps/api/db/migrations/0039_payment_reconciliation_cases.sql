create table if not exists payment_reconciliation_cases (
  id text primary key,
  case_type text not null check (
    case_type in ('payment_failed', 'stripe_dispute', 'invalid_transition', 'duplicate_event', 'provider_mismatch')
  ),
  status text not null check (status in ('open', 'waiting_customer', 'waiting_partner', 'resolved', 'written_off')),
  booking_id text not null references bookings(id) on delete restrict,
  owner_id text not null references users(id),
  payment_intent_id text references payment_intents(id) on delete restrict,
  payment_operation_id text references payment_operations(id) on delete restrict,
  provider_reference text,
  provider_event_type text,
  assigned_to_user_id text references users(id),
  summary text not null,
  resolution_notes text,
  opened_by_user_id text not null references users(id),
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists payment_reconciliation_case_events (
  id text primary key,
  case_id text not null references payment_reconciliation_cases(id) on delete restrict,
  event_type text not null check (event_type in ('created', 'note_added', 'status_changed', 'assigned', 'resolved')),
  actor_user_id text not null references users(id),
  from_status text check (from_status in ('open', 'waiting_customer', 'waiting_partner', 'resolved', 'written_off')),
  to_status text check (to_status in ('open', 'waiting_customer', 'waiting_partner', 'resolved', 'written_off')),
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payment_reconciliation_cases_status_updated_idx
  on payment_reconciliation_cases(status, updated_at desc);

create index if not exists payment_reconciliation_cases_booking_updated_idx
  on payment_reconciliation_cases(booking_id, updated_at desc);

create index if not exists payment_reconciliation_cases_payment_operation_idx
  on payment_reconciliation_cases(payment_operation_id);

create index if not exists payment_reconciliation_case_events_case_created_idx
  on payment_reconciliation_case_events(case_id, created_at desc);
