create table if not exists booking_evidence (
  id text primary key,
  booking_id text not null references bookings(id) on delete restrict,
  evidence_type text not null check (evidence_type in ('before', 'after', 'damage', 'handover', 'other')),
  storage_key text,
  url text,
  notes text,
  uploaded_by_user_id text,
  uploaded_by_role text not null check (uploaded_by_role in ('customer', 'partner', 'fleet', 'internal', 'property_manager')),
  created_at timestamptz not null default now(),
  check (storage_key is not null or url is not null)
);

create index if not exists booking_evidence_booking_created_idx on booking_evidence(booking_id, created_at desc);
create index if not exists booking_evidence_booking_type_idx on booking_evidence(booking_id, evidence_type);
