create table if not exists booking_consents (
  id text primary key,
  booking_id text not null references bookings(id) on delete restrict,
  owner_id text not null,
  consent_type text not null check (consent_type in ('pickup_return_terms', 'property_service_terms')),
  terms_version text not null,
  accepted_text text,
  accepted_by_user_id text,
  accepted_at timestamptz not null default now()
);

create index if not exists booking_consents_booking_accepted_idx on booking_consents(booking_id, accepted_at desc);
create index if not exists booking_consents_booking_type_idx on booking_consents(booking_id, consent_type);
