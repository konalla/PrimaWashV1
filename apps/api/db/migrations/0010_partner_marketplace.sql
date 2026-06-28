alter table partner_locations
  add column if not exists short_description text not null default 'Trusted vehicle care from a verified Prima Wash partner',
  add column if not exists latitude double precision not null default 0,
  add column if not exists longitude double precision not null default 0,
  add column if not exists rating numeric(2,1) not null default 4.8,
  add column if not exists review_count integer not null default 0,
  add column if not exists opening_hours text not null default '08:00-18:00',
  add column if not exists verified boolean not null default true;

update partner_locations
set name = 'Prima Wash Central',
    short_description = 'Premium hand wash and detailing in the heart of the city',
    latitude = 1.290270,
    longitude = 103.851959,
    rating = 4.9,
    review_count = 428,
    opening_hours = '08:00-19:00'
where id = 'loc_demo_001';

insert into organizations (id, name, organization_type)
values
  ('org_partner_002', 'Harbour Auto Spa', 'partner'),
  ('org_partner_003', 'Orchard Detail Lab', 'partner')
on conflict (id) do nothing;

insert into partner_locations (
  id, organization_id, name, short_description, timezone, address_line_1, city, region, country_code,
  latitude, longitude, rating, review_count, opening_hours, verified
)
values
  ('loc_harbour_001', 'org_partner_002', 'Harbour Auto Spa',
   'Fast, careful exterior and interior care near the waterfront', 'Asia/Singapore',
   '12 Harbour Drive', 'Singapore', 'Central Region', 'SG', 1.2655, 103.8201, 4.8, 316, '07:30-20:00', true),
  ('loc_orchard_001', 'org_partner_003', 'Orchard Detail Lab',
   'Specialist detailing and finish protection for premium vehicles', 'Asia/Singapore',
   '88 Orchard Road', 'Singapore', 'Central Region', 'SG', 1.3048, 103.8318, 4.9, 207, '09:00-18:30', true)
on conflict (id) do update set
  name = excluded.name,
  short_description = excluded.short_description,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  rating = excluded.rating,
  review_count = excluded.review_count,
  opening_hours = excluded.opening_hours,
  verified = excluded.verified;

insert into availability_slots (id, partner_location_id, starts_at, ends_at, capacity)
values
  ('slot_harbour_0900', 'loc_harbour_001', '2026-07-02T09:00:00.000Z', '2026-07-02T10:30:00.000Z', 8),
  ('slot_harbour_1300', 'loc_harbour_001', '2026-07-02T13:00:00.000Z', '2026-07-02T14:30:00.000Z', 8),
  ('slot_orchard_1000', 'loc_orchard_001', '2026-07-03T10:00:00.000Z', '2026-07-03T11:30:00.000Z', 5),
  ('slot_orchard_1500', 'loc_orchard_001', '2026-07-03T15:00:00.000Z', '2026-07-03T16:30:00.000Z', 5)
on conflict (id) do nothing;

insert into availability_slot_services (availability_slot_id, service_code)
values
  ('slot_harbour_0900', 'wash_basic'),
  ('slot_harbour_0900', 'detail_interior'),
  ('slot_harbour_1300', 'wash_basic'),
  ('slot_harbour_1300', 'wash_premium'),
  ('slot_orchard_1000', 'wash_premium'),
  ('slot_orchard_1000', 'detail_interior'),
  ('slot_orchard_1500', 'wash_premium'),
  ('slot_orchard_1500', 'detail_interior')
on conflict (availability_slot_id, service_code) do nothing;
