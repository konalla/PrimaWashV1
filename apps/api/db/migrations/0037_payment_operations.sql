create table if not exists payment_operations (
  id text primary key,
  payment_intent_id text references payment_intents(id) on delete restrict,
  booking_id text not null references bookings(id) on delete restrict,
  owner_id text not null references users(id),
  operation text not null check (operation in ('create', 'authorize', 'capture', 'void', 'refund', 'reconcile')),
  status text not null check (status in ('started', 'succeeded', 'failed', 'skipped')),
  provider text,
  provider_operation text,
  provider_reference text,
  provider_status text,
  provider_processed_at timestamptz,
  idempotency_key text,
  actor_user_id text,
  actor_role text check (actor_role in ('customer', 'partner', 'fleet', 'internal', 'property_manager')),
  request_id text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payment_operations_booking_created_idx on payment_operations(booking_id, created_at desc);
create index if not exists payment_operations_payment_created_idx on payment_operations(payment_intent_id, created_at desc);
create index if not exists payment_operations_provider_reference_idx on payment_operations(provider_reference);
create unique index if not exists payment_operations_create_idempotency_idx
  on payment_operations(operation, booking_id, idempotency_key)
  where idempotency_key is not null and operation = 'create' and status = 'succeeded';
