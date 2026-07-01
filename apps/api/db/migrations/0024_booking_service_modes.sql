alter table bookings
  drop constraint if exists bookings_onsite_service_mode_check;

alter table bookings
  add constraint bookings_onsite_service_mode_check
    check (onsite_service_mode in ('onsite', 'partner_location', 'customer_property', 'pickup_return'));
