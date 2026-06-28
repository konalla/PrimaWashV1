alter table bookings
  add column prima_wash_day_id text references prima_wash_days(id);

create index bookings_prima_wash_day_id_idx on bookings(prima_wash_day_id);
