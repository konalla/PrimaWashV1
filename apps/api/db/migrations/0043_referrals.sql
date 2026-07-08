create table if not exists referral_codes (
  owner_id text primary key,
  code text not null unique,
  created_at timestamptz not null
);

create table if not exists referral_relationships (
  id text primary key,
  referrer_owner_id text not null,
  referred_owner_id text not null unique,
  referral_code text not null,
  status text not null check (status in ('claimed', 'credited')),
  qualifying_booking_id text,
  credited_at timestamptz,
  created_at timestamptz not null,
  constraint referral_relationship_no_self_referral check (referrer_owner_id <> referred_owner_id)
);

create index if not exists referral_relationships_referrer_idx
  on referral_relationships(referrer_owner_id, created_at desc);

create index if not exists referral_relationships_referred_idx
  on referral_relationships(referred_owner_id);

create table if not exists referral_credits (
  id text primary key,
  owner_id text not null,
  referral_relationship_id text not null unique references referral_relationships(id),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null,
  status text not null check (status in ('available', 'redeemed', 'voided')),
  reason text not null,
  booking_id text,
  created_at timestamptz not null,
  available_at timestamptz,
  redeemed_at timestamptz,
  voided_at timestamptz
);

create index if not exists referral_credits_owner_idx
  on referral_credits(owner_id, created_at desc);
