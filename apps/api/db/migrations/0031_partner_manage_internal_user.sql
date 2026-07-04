insert into users (id, organization_id, email, full_name)
values (
  'usr_internal_partner_001',
  'org_platform_001',
  'partner.ops@primawash.local',
  'Prima Wash Partner Ops'
)
on conflict (id) do update set
  organization_id = excluded.organization_id,
  email = excluded.email,
  full_name = excluded.full_name;

insert into access_memberships (
  id, user_id, role, organization_id, partner_location_id, property_id, permissions
)
values (
  'access_internal_partner_001',
  'usr_internal_partner_001',
  'internal',
  'org_platform_001',
  null,
  null,
  array['operations_read', 'partner_manage']::text[]
)
on conflict (id) do update set
  permissions = excluded.permissions,
  active = true,
  updated_at = now();
