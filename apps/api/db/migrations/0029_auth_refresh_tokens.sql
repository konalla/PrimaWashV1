create table auth_refresh_tokens (
  id text primary key,
  session_id text not null references auth_sessions(id) on delete cascade,
  user_id text not null,
  role text not null check (role in ('customer', 'partner', 'fleet', 'internal', 'property_manager')),
  identifier text not null,
  token_hash text not null unique,
  family_id text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  replaced_by_token_id text,
  created_at timestamptz not null default now()
);

create index auth_refresh_tokens_family_idx
  on auth_refresh_tokens(family_id);

create index auth_refresh_tokens_session_idx
  on auth_refresh_tokens(session_id);

create index auth_refresh_tokens_expires_at_idx
  on auth_refresh_tokens(expires_at);

create index auth_refresh_tokens_active_user_idx
  on auth_refresh_tokens(user_id, expires_at)
  where used_at is null and revoked_at is null;
