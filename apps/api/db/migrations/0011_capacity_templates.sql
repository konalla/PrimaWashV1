create table if not exists capacity_templates (
  id text primary key,
  partner_location_id text not null references partner_locations(id),
  name text not null,
  open_time text not null,
  close_time text not null,
  staff_count integer not null check (staff_count > 0),
  bay_count integer not null check (bay_count > 0),
  service_codes text[] not null,
  slot_duration_minutes integer not null check (slot_duration_minutes >= 15),
  buffer_minutes integer not null check (buffer_minutes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_capacity_templates_partner_location_id
  on capacity_templates(partner_location_id);

insert into capacity_templates (
  id, partner_location_id, name, open_time, close_time, staff_count, bay_count,
  service_codes, slot_duration_minutes, buffer_minutes
)
values (
  'cap_tpl_demo_001', 'loc_demo_001', 'Weekday standard capacity', '08:00', '19:00', 3, 2,
  array['wash_basic', 'wash_premium'], 60, 15
)
on conflict (id) do nothing;
