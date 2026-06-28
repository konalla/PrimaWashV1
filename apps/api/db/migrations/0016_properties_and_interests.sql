create table if not exists properties (
  id text primary key,
  market_id text not null,
  residence_type text not null,
  name text not null,
  address_line_1 text,
  city text not null,
  region text not null,
  country_code char(2) not null,
  activation_status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists properties_market_name_address_unique
  on properties (market_id, lower(name), coalesce(address_line_1, ''));

create table if not exists property_interests (
  id text primary key,
  property_id text not null references properties(id),
  owner_id text not null references users(id),
  requested_service_codes text[] not null default '{}',
  preferred_time_windows text[] not null default '{}',
  parking_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, owner_id)
);

insert into properties (
  id, market_id, residence_type, name, address_line_1, city, region, country_code, activation_status
)
values
  ('prop_sg_reflections', 'sg', 'multi_unit_private', 'Reflections at Keppel Bay', '1 Keppel Bay View', 'Singapore', 'Central Region', 'SG', 'interest_gathering'),
  ('prop_sg_interlace', 'sg', 'multi_unit_private', 'The Interlace', '180 Depot Road', 'Singapore', 'Central Region', 'SG', 'interest_gathering'),
  ('prop_sg_marina_one', 'sg', 'multi_unit_private', 'Marina One Residences', '21 Marina Way', 'Singapore', 'Central Region', 'SG', 'contacted')
on conflict (id) do nothing;
