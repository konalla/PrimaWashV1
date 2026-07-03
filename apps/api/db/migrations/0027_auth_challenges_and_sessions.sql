create table auth_challenges (
  id text primary key,
  identifier text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

create index auth_challenges_identifier_created_idx
  on auth_challenges(identifier, created_at desc);

create index auth_challenges_expires_at_idx
  on auth_challenges(expires_at);

create table auth_sessions (
  id text primary key,
  user_id text not null,
  role text not null check (role in ('customer', 'partner', 'fleet', 'internal', 'property_manager')),
  identifier text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index auth_sessions_user_active_idx
  on auth_sessions(user_id, expires_at)
  where revoked_at is null;

create index auth_sessions_expires_at_idx
  on auth_sessions(expires_at);
