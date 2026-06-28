insert into operating_schedule_rules (id, partner_location_id, weekday, open_time, close_time, enabled)
select
  concat('schedule_', p.id, '_', weekday),
  p.id,
  weekday,
  split_part(p.opening_hours, '-', 1),
  split_part(p.opening_hours, '-', 2),
  true
from partner_locations p
cross join generate_series(1, 6) as weekday
where split_part(p.opening_hours, '-', 1) ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  and split_part(p.opening_hours, '-', 2) ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
on conflict (id) do nothing;

insert into resource_pools (id, partner_location_id, resource_type, name, quantity, enabled)
select concat('res_', p.id, '_staff'), p.id, 'staff', 'Care team', 3, true
from partner_locations p
on conflict (id) do nothing;

insert into resource_pools (id, partner_location_id, resource_type, name, quantity, enabled)
select concat('res_', p.id, '_wash_bay'), p.id, 'wash_bay', 'Wash bays', 2, true
from partner_locations p
on conflict (id) do nothing;

insert into resource_pools (id, partner_location_id, resource_type, name, quantity, enabled)
select concat('res_', p.id, '_detail_bay'), p.id, 'detail_bay', 'Detail bays', 1, true
from partner_locations p
on conflict (id) do nothing;

insert into resource_pools (id, partner_location_id, resource_type, name, quantity, enabled)
select concat('res_', p.id, '_interior_station'), p.id, 'interior_station', 'Interior stations', 1, true
from partner_locations p
on conflict (id) do nothing;

insert into service_capacity_rules (
  id, partner_location_id, service_code, duration_minutes, pre_buffer_minutes, post_buffer_minutes,
  required_staff, required_resource_type, required_resource_quantity, max_concurrent, max_daily_bookings, enabled
)
select
  concat('svc_rule_', p.id, '_wash_basic'),
  p.id,
  'wash_basic',
  30,
  5,
  10,
  1,
  'wash_bay',
  1,
  2,
  20,
  true
from partner_locations p
where exists (
  select 1
  from availability_slots s
  join availability_slot_services ass on ass.availability_slot_id = s.id
  where s.partner_location_id = p.id and ass.service_code = 'wash_basic'
)
on conflict (id) do nothing;

insert into service_capacity_rules (
  id, partner_location_id, service_code, duration_minutes, pre_buffer_minutes, post_buffer_minutes,
  required_staff, required_resource_type, required_resource_quantity, max_concurrent, max_daily_bookings, enabled
)
select
  concat('svc_rule_', p.id, '_wash_premium'),
  p.id,
  'wash_premium',
  60,
  5,
  10,
  1,
  'wash_bay',
  1,
  2,
  14,
  true
from partner_locations p
where exists (
  select 1
  from availability_slots s
  join availability_slot_services ass on ass.availability_slot_id = s.id
  where s.partner_location_id = p.id and ass.service_code = 'wash_premium'
)
on conflict (id) do nothing;

insert into service_capacity_rules (
  id, partner_location_id, service_code, duration_minutes, pre_buffer_minutes, post_buffer_minutes,
  required_staff, required_resource_type, required_resource_quantity, max_concurrent, max_daily_bookings, enabled
)
select
  concat('svc_rule_', p.id, '_detail_interior'),
  p.id,
  'detail_interior',
  90,
  5,
  10,
  1,
  'interior_station',
  1,
  1,
  8,
  true
from partner_locations p
where exists (
  select 1
  from availability_slots s
  join availability_slot_services ass on ass.availability_slot_id = s.id
  where s.partner_location_id = p.id and ass.service_code = 'detail_interior'
)
on conflict (id) do nothing;
