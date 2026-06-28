insert into organizations (id, name, organization_type)
values
  ('org_platform_001', 'Prima Wash', 'platform'),
  ('org_partner_001', 'Demo Partner Wash', 'partner')
on conflict (id) do nothing;

insert into users (id, organization_id, email, full_name)
values
  ('usr_demo_001', null, 'owner.demo@example.com', 'Demo Owner')
on conflict (id) do nothing;

insert into partner_locations (
  id, organization_id, name, timezone, address_line_1, city, region, country_code
)
values (
  'loc_demo_001',
  'org_partner_001',
  'Demo Partner Location',
  'America/New_York',
  '100 Demo Street',
  'New York',
  'NY',
  'US'
)
on conflict (id) do nothing;

insert into service_offerings (code, name, duration_minutes, price_amount_minor, price_currency, active)
values
  ('wash_basic', 'Basic Wash', 30, 2500, 'USD', true),
  ('wash_premium', 'Premium Wash', 45, 4500, 'USD', true),
  ('detail_interior', 'Interior Detail', 90, 9500, 'USD', true)
on conflict (code) do update set
  name = excluded.name,
  duration_minutes = excluded.duration_minutes,
  price_amount_minor = excluded.price_amount_minor,
  price_currency = excluded.price_currency,
  active = excluded.active;

insert into availability_slots (id, partner_location_id, starts_at, ends_at, capacity)
values
  ('slot_demo_0900', 'loc_demo_001', '2026-07-01T09:00:00.000Z', '2026-07-01T10:30:00.000Z', 50),
  ('slot_demo_1100', 'loc_demo_001', '2026-07-01T11:00:00.000Z', '2026-07-01T12:30:00.000Z', 50)
on conflict (id) do update set capacity = excluded.capacity;

insert into availability_slot_services (availability_slot_id, service_code)
values
  ('slot_demo_0900', 'wash_basic'),
  ('slot_demo_0900', 'wash_premium'),
  ('slot_demo_1100', 'wash_basic'),
  ('slot_demo_1100', 'wash_premium'),
  ('slot_demo_1100', 'detail_interior')
on conflict (availability_slot_id, service_code) do nothing;
