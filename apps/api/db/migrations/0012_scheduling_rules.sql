create table if not exists operating_schedule_rules (
  id text primary key,
  partner_location_id text not null references partner_locations(id),
  weekday integer not null check (weekday between 0 and 6),
  open_time text not null,
  close_time text not null,
  enabled boolean not null default true
);

create index if not exists idx_operating_schedule_rules_partner_location_id
  on operating_schedule_rules(partner_location_id);

create table if not exists calendar_exceptions (
  id text primary key,
  partner_location_id text not null references partner_locations(id),
  date date not null,
  type text not null check (type in ('closed', 'special_hours')),
  reason text not null,
  open_time text,
  close_time text
);

create index if not exists idx_calendar_exceptions_partner_location_id_date
  on calendar_exceptions(partner_location_id, date);

create table if not exists resource_pools (
  id text primary key,
  partner_location_id text not null references partner_locations(id),
  resource_type text not null check (resource_type in ('staff', 'wash_bay', 'detail_bay', 'interior_station')),
  name text not null,
  quantity integer not null check (quantity > 0),
  enabled boolean not null default true
);

create index if not exists idx_resource_pools_partner_location_id
  on resource_pools(partner_location_id);

create table if not exists service_capacity_rules (
  id text primary key,
  partner_location_id text not null references partner_locations(id),
  service_code text not null references service_offerings(code),
  duration_minutes integer not null check (duration_minutes >= 15),
  pre_buffer_minutes integer not null default 0 check (pre_buffer_minutes >= 0),
  post_buffer_minutes integer not null default 0 check (post_buffer_minutes >= 0),
  required_staff integer not null default 1 check (required_staff > 0),
  required_resource_type text not null check (required_resource_type in ('staff', 'wash_bay', 'detail_bay', 'interior_station')),
  required_resource_quantity integer not null default 1 check (required_resource_quantity > 0),
  max_concurrent integer not null default 1 check (max_concurrent > 0),
  max_daily_bookings integer not null default 1 check (max_daily_bookings > 0),
  enabled boolean not null default true
);

create index if not exists idx_service_capacity_rules_partner_location_id
  on service_capacity_rules(partner_location_id);

insert into operating_schedule_rules (id, partner_location_id, weekday, open_time, close_time, enabled)
values
  ('schedule_demo_1', 'loc_demo_001', 1, '08:00', '19:00', true),
  ('schedule_demo_2', 'loc_demo_001', 2, '08:00', '19:00', true),
  ('schedule_demo_3', 'loc_demo_001', 3, '08:00', '19:00', true),
  ('schedule_demo_4', 'loc_demo_001', 4, '08:00', '19:00', true),
  ('schedule_demo_5', 'loc_demo_001', 5, '08:00', '19:00', true),
  ('schedule_demo_6', 'loc_demo_001', 6, '08:00', '19:00', true)
on conflict (id) do nothing;

insert into resource_pools (id, partner_location_id, resource_type, name, quantity, enabled)
values
  ('res_demo_staff', 'loc_demo_001', 'staff', 'Care team', 3, true),
  ('res_demo_bay', 'loc_demo_001', 'wash_bay', 'Wash bays', 2, true),
  ('res_demo_detail', 'loc_demo_001', 'detail_bay', 'Detail bays', 1, true),
  ('res_demo_interior', 'loc_demo_001', 'interior_station', 'Interior stations', 1, true)
on conflict (id) do nothing;

insert into service_capacity_rules (
  id, partner_location_id, service_code, duration_minutes, pre_buffer_minutes, post_buffer_minutes,
  required_staff, required_resource_type, required_resource_quantity, max_concurrent, max_daily_bookings, enabled
)
values
  ('svc_rule_demo_wash_basic', 'loc_demo_001', 'wash_basic', 30, 5, 10, 1, 'wash_bay', 1, 2, 20, true),
  ('svc_rule_demo_wash_premium', 'loc_demo_001', 'wash_premium', 60, 5, 10, 1, 'wash_bay', 1, 2, 14, true),
  ('svc_rule_demo_detail_interior', 'loc_demo_001', 'detail_interior', 90, 5, 10, 1, 'interior_station', 1, 1, 8, true)
on conflict (id) do nothing;
