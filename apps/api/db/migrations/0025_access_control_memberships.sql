create table access_memberships (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  role text not null check (role in ('partner', 'fleet', 'internal', 'property_manager')),
  organization_id text references organizations(id),
  partner_location_id text references partner_locations(id),
  property_id text references properties(id),
  permissions text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index access_memberships_user_active_idx on access_memberships(user_id, active);
create index access_memberships_organization_idx on access_memberships(organization_id) where organization_id is not null;
create index access_memberships_partner_location_idx on access_memberships(partner_location_id) where partner_location_id is not null;
create index access_memberships_property_idx on access_memberships(property_id) where property_id is not null;

insert into users (id, organization_id, email, full_name)
values
  ('usr_internal_001', 'org_platform_001', 'internal.demo@primawash.local', 'Prima Wash Admin'),
  ('partner_demo_001', 'org_partner_001', 'partner.demo@primawash.local', 'Prima Wash Central Partner'),
  ('partner_harbour_001', 'org_partner_002', 'partner.harbour@primawash.local', 'Harbour Auto Spa Partner'),
  ('partner_orchard_001', 'org_partner_003', 'partner.orchard@primawash.local', 'Orchard Detail Lab Partner'),
  ('mgr_marina_001', null, 'manager.marina@primawash.local', 'Marina One Management')
on conflict (id) do update set
  organization_id = excluded.organization_id,
  email = excluded.email,
  full_name = excluded.full_name;

insert into access_memberships (
  id, user_id, role, organization_id, partner_location_id, property_id, permissions
)
values
  (
    'access_internal_admin_001',
    'usr_internal_001',
    'internal',
    'org_platform_001',
    null,
    null,
    array['super_admin']::text[]
  ),
  (
    'access_partner_demo_001',
    'partner_demo_001',
    'partner',
    'org_partner_001',
    'loc_demo_001',
    null,
    array[]::text[]
  ),
  (
    'access_partner_harbour_001',
    'partner_harbour_001',
    'partner',
    'org_partner_002',
    'loc_harbour_001',
    null,
    array[]::text[]
  ),
  (
    'access_partner_orchard_001',
    'partner_orchard_001',
    'partner',
    'org_partner_003',
    'loc_orchard_001',
    null,
    array[]::text[]
  ),
  (
    'access_property_marina_001',
    'mgr_marina_001',
    'property_manager',
    null,
    null,
    'prop_sg_marina_one',
    array[]::text[]
  )
on conflict (id) do update set
  organization_id = excluded.organization_id,
  partner_location_id = excluded.partner_location_id,
  property_id = excluded.property_id,
  permissions = excluded.permissions,
  active = true,
  updated_at = now();
