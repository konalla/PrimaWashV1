# MVP REST surface

The first API slice supports the customer booking loop: register a vehicle, inspect services and availability, then create a booking in `pending_payment`.

Authentication:

- `POST /v1/auth/code/request`
- `POST /v1/auth/code/verify`
- `GET /v1/auth/session`
- `POST /v1/auth/logout`

Mobile requests use `Authorization: Bearer <access-token>`. The local verifier returns development code `123456`
outside production. Production still requires an external email/SMS delivery provider and refresh-token rotation.

Routes:

- `GET /health`
- `GET /v1/profile`
- `PATCH /v1/profile`
- `GET /v1/partners`
- `GET /v1/partners/{partnerLocationId}`
- `GET /v1/services`
- `GET /v1/availability`
- `GET /v1/partner/availability?partnerLocationId={partnerLocationId}`
- `POST /v1/partner/availability`
- `PATCH /v1/partner/availability/{slotId}`
- `GET /v1/vehicles?ownerId={ownerId}`
- `POST /v1/vehicles`
- `PATCH /v1/vehicles/{vehicleId}`
- `DELETE /v1/vehicles/{vehicleId}`
- `GET /v1/bookings?ownerId={ownerId}`
- `POST /v1/bookings`
- `GET /v1/payments?bookingId={bookingId}`
- `POST /v1/payments/intents`
- `POST /v1/payments/{paymentIntentId}/authorize`
- `POST /v1/payments/{paymentIntentId}/capture`
- `POST /v1/payments/{paymentIntentId}/refund`
- `POST /v1/bookings/{bookingId}/cancel`
- `PATCH /v1/bookings/{bookingId}/status`
- `GET /v1/service-records?ownerId={ownerId}`
- `GET /v1/audit-events?limit={limit}`
- `GET /v1/partner/dashboard?partnerLocationId={partnerLocationId}`
- `GET /v1/analytics/mavo?month=YYYY-MM`

Customer vehicle and booking routes require `x-prima-user-id`. The API derives ownership from this actor header by default. If an `ownerId` is supplied in a query string or body, it must match the actor unless the actor has `x-prima-role: internal`.

Audit-event reads require `x-prima-role: internal`.

Partner dashboard reads require `x-prima-role: partner` or `x-prima-role: internal`.

Partner availability writes require `x-prima-role: partner` or `x-prima-role: internal`. Partner slots include `capacity`, `bookedCount`, `availableCount`, `serviceCodes`, and optional `closedAt`. Customer-facing `GET /v1/availability` only returns open slots with remaining capacity.

Booking creation rejects:

- closed slots with `availability_slot_closed`
- full slots with `availability_slot_full`
- service/slot mismatches with `service_not_available_for_slot`

Payment intent creation is scoped to the booking owner for customer actors and is also available to partner/internal actors. This MVP uses a mock payment boundary:

- booking creation starts in `pending_payment`
- `POST /v1/payments/intents` creates a `requires_authorization` hold for the booking price
- `POST /v1/payments/{paymentIntentId}/authorize` moves the hold to `authorized`
- partner confirmation from `pending_payment` to `confirmed` requires an authorized payment
- booking completion automatically captures the authorized payment
- cancellation before service starts automatically voids an authorized payment
- refunds are internal-only through `POST /v1/payments/{paymentIntentId}/refund`

Booking status updates require `x-prima-role: partner` or `x-prima-role: internal`. Valid transitions:

- `pending_payment` → `confirmed` or `cancelled`
- `confirmed` → `checked_in` or `cancelled`
- `checked_in` → `in_service` or `cancelled`
- `in_service` → `completed`

Booking cancellation uses `POST /v1/bookings/{bookingId}/cancel`. Customers can cancel their own bookings before service starts. Partners and internal actors can cancel operationally before service starts. Cancellation from `in_service`, `completed`, or `cancelled` is rejected.

Service records are created automatically when a booking reaches `completed`. Customer actors can read their own records through `GET /v1/service-records`.

MAVO analytics require `x-prima-role: internal`. Qualifying events are `vehicle_created`, `booking_created`, and `service_completed`.

Development auth headers:

- `x-prima-user-id: usr_demo_001`
- `x-prima-role: customer`
- `x-request-id: optional-client-correlation-id`

Implementation note: this slice uses in-memory persistence by default for local development. When `DATABASE_URL` is set, the API uses the Postgres repositories. Run `npm run db:migrate` before starting the API against a new database.
