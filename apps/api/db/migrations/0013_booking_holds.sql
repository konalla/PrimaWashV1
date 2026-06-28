create table if not exists booking_holds (
  id text primary key,
  owner_id text not null,
  vehicle_id text not null,
  partner_location_id text not null references partner_locations(id),
  service_code text not null references service_offerings(code),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null check (status in ('active', 'consumed', 'expired', 'released')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_booking_holds_active_capacity
  on booking_holds(partner_location_id, service_code, starts_at, ends_at)
  where status = 'active';

create index if not exists idx_booking_holds_owner
  on booking_holds(owner_id, created_at desc);
