create table service_records (
  id text primary key,
  booking_id text not null references bookings(id),
  owner_id text not null references users(id),
  vehicle_id text not null references vehicles(id),
  partner_location_id text not null references partner_locations(id),
  service_code text not null references service_offerings(code),
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (booking_id)
);

create index service_records_owner_completed_at_idx on service_records(owner_id, completed_at desc);
create index service_records_vehicle_completed_at_idx on service_records(vehicle_id, completed_at desc);
