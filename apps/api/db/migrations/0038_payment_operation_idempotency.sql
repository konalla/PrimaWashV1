create unique index if not exists payment_operations_succeeded_idempotency_idx
  on payment_operations(operation, booking_id, idempotency_key)
  where idempotency_key is not null and status = 'succeeded';
