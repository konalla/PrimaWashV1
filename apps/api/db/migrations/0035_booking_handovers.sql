create table if not exists booking_handovers (
  id text primary key,
  booking_id text not null references bookings(id) on delete restrict,
  handover_type text not null check (handover_type in ('pickup', 'return', 'onsite_receipt', 'onsite_release')),
  contact_name text not null,
  location_notes text not null,
  key_handover_method text,
  odometer_reading text,
  fuel_or_charge_level text,
  condition_notes text,
  acknowledged_by text,
  recorded_by_user_id text,
  recorded_by_role text not null check (recorded_by_role in ('customer', 'partner', 'fleet', 'internal', 'property_manager')),
  created_at timestamptz not null default now()
);

create index if not exists booking_handovers_booking_created_idx on booking_handovers(booking_id, created_at desc);
create index if not exists booking_handovers_booking_type_idx on booking_handovers(booking_id, handover_type);
