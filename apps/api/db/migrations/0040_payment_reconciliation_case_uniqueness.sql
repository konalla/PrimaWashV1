create unique index if not exists payment_reconciliation_cases_open_provider_event_unique_idx
  on payment_reconciliation_cases(case_type, provider_reference, provider_event_type)
  where provider_reference is not null
    and provider_event_type is not null
    and status not in ('resolved', 'written_off');
