insert into users (id, organization_id, email, full_name)
values
  ('usr_internal_ops_read_001', 'org_platform_001', 'ops.read@primawash.local', 'Prima Wash Ops Read'),
  ('usr_internal_ops_write_001', 'org_platform_001', 'ops.coordinator@primawash.local', 'Prima Wash Ops Coordinator'),
  ('usr_internal_finance_001', 'org_platform_001', 'finance@primawash.local', 'Prima Wash Finance'),
  ('usr_internal_property_001', 'org_platform_001', 'property.ops@primawash.local', 'Prima Wash Property Ops')
on conflict (id) do update set
  organization_id = excluded.organization_id,
  email = excluded.email,
  full_name = excluded.full_name;

insert into access_memberships (
  id, user_id, role, organization_id, partner_location_id, property_id, permissions
)
values
  (
    'access_internal_ops_read_001',
    'usr_internal_ops_read_001',
    'internal',
    'org_platform_001',
    null,
    null,
    array['operations_read', 'finance_read']::text[]
  ),
  (
    'access_internal_ops_write_001',
    'usr_internal_ops_write_001',
    'internal',
    'org_platform_001',
    null,
    null,
    array['operations_read', 'operations_write', 'finance_read']::text[]
  ),
  (
    'access_internal_finance_001',
    'usr_internal_finance_001',
    'internal',
    'org_platform_001',
    null,
    null,
    array['operations_read', 'finance_read', 'finance_write']::text[]
  ),
  (
    'access_internal_property_001',
    'usr_internal_property_001',
    'internal',
    'org_platform_001',
    null,
    null,
    array['operations_read', 'property_manage']::text[]
  )
on conflict (id) do update set
  permissions = excluded.permissions,
  active = true,
  updated_at = now();
