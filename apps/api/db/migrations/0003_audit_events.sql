create table audit_events (
  id text primary key,
  actor_user_id text,
  actor_organization_id text,
  action text not null,
  resource_type text not null,
  resource_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create index audit_events_resource_idx on audit_events(resource_type, resource_id, created_at desc);
create index audit_events_actor_idx on audit_events(actor_user_id, created_at desc);
