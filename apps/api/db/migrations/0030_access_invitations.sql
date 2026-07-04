create table access_invitations (
  id text primary key,
  identifier text not null,
  display_name text not null,
  role text not null check (role in ('internal', 'partner', 'property_manager')),
  organization_id text references organizations(id),
  partner_location_id text references partner_locations(id),
  property_id text references properties(id),
  permissions text[] not null default '{}',
  code_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  invited_by_user_id text not null references users(id),
  created_at timestamptz not null default now()
);

create index access_invitations_identifier_created_idx
  on access_invitations(identifier, created_at desc);

create index access_invitations_expires_at_idx
  on access_invitations(expires_at);

create index access_invitations_open_idx
  on access_invitations(role, expires_at)
  where accepted_at is null and revoked_at is null;
