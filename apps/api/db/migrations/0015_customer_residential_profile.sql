alter table customer_profiles
  add column if not exists residential_profile jsonb;
