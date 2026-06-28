create table if not exists payment_intents (
  id text primary key,
  booking_id text not null unique references bookings(id) on delete cascade,
  owner_id text not null references users(id),
  amount_minor integer not null check (amount_minor >= 0),
  currency text not null default 'USD',
  status text not null check (
    status in ('requires_authorization', 'authorized', 'captured', 'refunded', 'voided')
  ),
  authorized_at timestamptz,
  captured_at timestamptz,
  refunded_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists payment_intents_owner_id_idx on payment_intents(owner_id);
create index if not exists payment_intents_status_idx on payment_intents(status);
