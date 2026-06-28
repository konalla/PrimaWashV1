create table if not exists customer_profiles (
  user_id text primary key,
  identifier text not null,
  display_name text not null,
  phone_number text,
  email text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

alter table vehicles
  add column if not exists is_primary boolean not null default false;

create unique index if not exists vehicles_one_primary_per_owner
  on vehicles (owner_id)
  where is_primary;
