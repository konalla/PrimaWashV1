create table product_events (
  id text primary key,
  owner_id text not null references users(id),
  name text not null,
  resource_type text not null,
  resource_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null
);

create index product_events_owner_occurred_at_idx on product_events(owner_id, occurred_at desc);
create index product_events_name_occurred_at_idx on product_events(name, occurred_at desc);
