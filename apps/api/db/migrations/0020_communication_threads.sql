create table communication_threads (
  id text primary key,
  thread_type text not null check (
    thread_type in ('prima_to_property', 'prima_to_owner', 'prima_to_partner', 'partner_to_owner')
  ),
  resource_type text not null check (resource_type in ('property', 'booking', 'partner_location', 'owner')),
  resource_id text not null,
  subject text not null,
  created_by_role text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (thread_type, resource_type, resource_id)
);

create table communication_messages (
  id text primary key,
  thread_id text not null references communication_threads(id) on delete cascade,
  sender_user_id text not null,
  sender_role text not null,
  body text not null,
  created_at timestamptz not null
);

create index communication_threads_resource_idx on communication_threads(resource_type, resource_id);
create index communication_messages_thread_created_idx on communication_messages(thread_id, created_at asc);
