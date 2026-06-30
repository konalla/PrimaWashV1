alter table payment_intents
  add column if not exists provider text,
  add column if not exists provider_reference text,
  add column if not exists client_secret text;

create index if not exists payment_intents_provider_reference_idx on payment_intents(provider_reference);
