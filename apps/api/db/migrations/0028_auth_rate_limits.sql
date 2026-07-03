create table auth_rate_limit_events (
  id text primary key,
  identifier text not null,
  source text not null,
  event_type text not null check (event_type in ('code_request')),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index auth_rate_limit_events_scope_idx
  on auth_rate_limit_events(identifier, source, event_type, occurred_at desc);

create index auth_rate_limit_events_occurred_at_idx
  on auth_rate_limit_events(occurred_at);
