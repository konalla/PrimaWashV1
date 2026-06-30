alter table customer_profiles
  add column if not exists billing_profile jsonb;
