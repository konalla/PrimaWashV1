alter table bookings
  add column operational_exception_code text check (
    operational_exception_code in (
      'customer_no_show',
      'partner_late',
      'access_denied',
      'vehicle_not_found',
      'payment_authorization_failed',
      'pickup_return_issue',
      'property_rule_conflict',
      'weather_or_safety_hold'
    )
  ),
  add column operational_exception_notes text,
  add column operational_exception_reported_at timestamptz,
  add column operational_exception_resolved_at timestamptz;
