create table organizations (
  id text primary key,
  name text not null,
  organization_type text not null check (organization_type in ('platform', 'partner', 'fleet')),
  created_at timestamptz not null default now()
);

create table users (
  id text primary key,
  organization_id text references organizations(id),
  email text not null unique,
  full_name text not null,
  created_at timestamptz not null default now()
);

create table vehicles (
  id text primary key,
  owner_id text not null references users(id),
  nickname text,
  plate_number text not null,
  make text,
  model text,
  year integer check (year between 1900 and 2100),
  created_at timestamptz not null default now(),
  unique (owner_id, plate_number)
);

create table partner_locations (
  id text primary key,
  organization_id text not null references organizations(id),
  name text not null,
  timezone text not null,
  address_line_1 text not null,
  city text not null,
  region text not null,
  country_code char(2) not null,
  created_at timestamptz not null default now()
);

create table service_offerings (
  code text primary key,
  name text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  price_amount_minor integer not null check (price_amount_minor >= 0),
  price_currency char(3) not null,
  active boolean not null default true
);

create table availability_slots (
  id text primary key,
  partner_location_id text not null references partner_locations(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null default 1 check (capacity > 0),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table availability_slot_services (
  availability_slot_id text not null references availability_slots(id) on delete cascade,
  service_code text not null references service_offerings(code),
  primary key (availability_slot_id, service_code)
);

create table bookings (
  id text primary key,
  owner_id text not null references users(id),
  vehicle_id text not null references vehicles(id),
  partner_location_id text not null references partner_locations(id),
  service_code text not null references service_offerings(code),
  status text not null check (
    status in ('pending_payment', 'confirmed', 'checked_in', 'in_service', 'completed', 'cancelled')
  ),
  scheduled_start_at timestamptz not null,
  scheduled_end_at timestamptz not null,
  accepted_price_amount_minor integer not null check (accepted_price_amount_minor >= 0),
  accepted_price_currency char(3) not null,
  created_at timestamptz not null default now(),
  check (scheduled_end_at > scheduled_start_at)
);

create index bookings_owner_id_created_at_idx on bookings(owner_id, created_at desc);
create index bookings_partner_location_schedule_idx on bookings(partner_location_id, scheduled_start_at);
create index availability_slots_location_starts_at_idx on availability_slots(partner_location_id, starts_at);
