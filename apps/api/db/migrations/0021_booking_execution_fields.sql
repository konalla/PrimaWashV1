alter table bookings
  add column onsite_service_mode text check (onsite_service_mode in ('onsite', 'pickup_return')),
  add column valet_requested boolean not null default false,
  add column execution_notes text,
  add column technician_checked_in_at timestamptz,
  add column technician_checked_out_at timestamptz;

