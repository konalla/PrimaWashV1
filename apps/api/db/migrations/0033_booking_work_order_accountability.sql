alter table bookings
  add column assigned_technician_name text,
  add column completion_notes text,
  add column before_service_photo_urls text[] not null default '{}',
  add column after_service_photo_urls text[] not null default '{}';
