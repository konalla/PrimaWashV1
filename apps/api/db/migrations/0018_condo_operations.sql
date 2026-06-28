create table if not exists condo_operational_profiles (
  property_id text primary key references properties(id),
  approved_service_areas text[] not null default '{}',
  operating_instructions text,
  water_policy text not null default 'rinseless_required',
  vehicle_movement_policy text not null default 'not_allowed',
  onsite_service_allowed boolean not null default true,
  pickup_return_allowed boolean not null default false,
  simultaneous_vehicle_capacity integer not null default 1 check (simultaneous_vehicle_capacity > 0),
  available_service_codes text[] not null default '{wash_basic,wash_premium}',
  safety_requirements text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists prima_wash_days (
  id text primary key,
  property_id text not null references properties(id),
  partner_location_id text references partner_locations(id),
  approved_service_area text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null check (capacity > 0),
  service_codes text[] not null,
  status text not null default 'planned',
  operating_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists prima_wash_days_property_starts_at_idx
  on prima_wash_days (property_id, starts_at);

insert into condo_operational_profiles (
  property_id, approved_service_areas, operating_instructions, water_policy, vehicle_movement_policy,
  onsite_service_allowed, pickup_return_allowed, simultaneous_vehicle_capacity, available_service_codes, safety_requirements
)
values
  (
    'prop_sg_marina_one',
    array['Basement visitor lots B1 near lift lobby'],
    'Technicians must check in with security and keep equipment within the approved visitor-lot bay.',
    'rinseless_required',
    'not_allowed',
    true,
    true,
    3,
    array['wash_basic', 'wash_premium', 'detail_interior'],
    'Use cones around service area. Keep pedestrian walkways clear.'
  )
on conflict (property_id) do nothing;

insert into prima_wash_days (
  id, property_id, partner_location_id, approved_service_area, starts_at, ends_at, capacity, service_codes, status, operating_notes
)
values
  (
    'pwd_sg_marina_one_20260704',
    'prop_sg_marina_one',
    'loc_demo_001',
    'Basement visitor lots B1 near lift lobby',
    '2026-07-04T01:00:00.000Z',
    '2026-07-04T05:00:00.000Z',
    12,
    array['wash_basic', 'wash_premium'],
    'planned',
    'First pilot Prima Wash Day. Rinseless service only.'
  )
on conflict (id) do nothing;
