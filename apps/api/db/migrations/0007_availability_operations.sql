alter table availability_slots
  add column if not exists closed_at timestamptz;

create index if not exists availability_slots_closed_at_idx on availability_slots(closed_at);
