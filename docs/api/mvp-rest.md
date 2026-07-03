# MVP REST surface

The API now supports the customer booking loop, partner operations, property/condo operations, payments, communications, and internal dashboards. This document is a compact route map; the shared contracts in `packages/contracts` remain the source of truth for request and response shapes.

## Authentication

- `POST /v1/auth/code/request`
- `POST /v1/auth/code/verify`
- `GET /v1/auth/session`
- `POST /v1/auth/logout`

Mobile and web requests use `Authorization: Bearer <access-token>`. The local verifier returns development code `123456` when configured for development. Auth challenges and sessions are persisted in Postgres-backed environments, and logout revokes the current session. Verification-code requests are rate limited per normalized identifier and request source. Production still requires external email/SMS delivery, refresh-token rotation or another renewal model, and broader abuse controls beyond code-request throttling.

Development actor headers exist for local testing only. They are rejected automatically when `NODE_ENV=production` and must not be used by staging or production clients.

## Route Map

Customer and marketplace:

- `GET /health`
- `GET /v1/profile`
- `PATCH /v1/profile`
- `POST /v1/billing/session`
- `GET /v1/billing/payment-methods`
- `GET /v1/properties`
- `POST /v1/property-interests`
- `GET /v1/properties/{propertyId}/prima-wash-days`
- `GET /v1/partners`
- `GET /v1/partners/{partnerLocationId}`
- `GET /v1/services`
- `GET /v1/availability`
- `GET /v1/availability/search`
- `GET /v1/vehicles`
- `POST /v1/vehicles`
- `PATCH /v1/vehicles/{vehicleId}`
- `DELETE /v1/vehicles/{vehicleId}`
- `GET /v1/bookings`
- `GET /v1/bookings/{bookingId}`
- `POST /v1/bookings`
- `POST /v1/booking-holds`
- `DELETE /v1/booking-holds/{bookingHoldId}`
- `GET /v1/payments?bookingId={bookingId}`
- `GET /v1/payments/history`
- `POST /v1/payments/intents`
- `POST /v1/payments/{paymentIntentId}/authorize`
- `POST /v1/bookings/{bookingId}/cancel`
- `GET /v1/service-records`

Partner operations:

- `GET /v1/partner/availability?partnerLocationId={partnerLocationId}`
- `POST /v1/partner/availability`
- `PATCH /v1/partner/availability/{slotId}`
- `GET /v1/partner/scheduling/config`
- `PATCH /v1/partner/scheduling/config`
- `GET /v1/partner/capacity-templates`
- `POST /v1/partner/capacity-templates`
- `POST /v1/partner/capacity-templates/{templateId}/generate`
- `PATCH /v1/partner/capacity-templates/{templateId}`
- `GET /v1/partner/dashboard?partnerLocationId={partnerLocationId}`
- `POST /v1/bookings/{bookingId}/partner-decision`
- `PATCH /v1/bookings/{bookingId}/execution`
- `PATCH /v1/bookings/{bookingId}/status`

Property management:

- `GET /v1/management/property-dashboard?propertyId={propertyId}`
- `PATCH /v1/management/properties/{propertyId}/operational-profile`

Internal operations:

- `GET /v1/internal/property-leads`
- `GET /v1/internal/properties/{propertyId}/operational-profile`
- `PATCH /v1/internal/properties/{propertyId}/operational-profile`
- `GET /v1/internal/prima-wash-days`
- `GET /v1/internal/prima-wash-day-bookings`
- `POST /v1/internal/prima-wash-days`
- `PATCH /v1/internal/prima-wash-days/{primaWashDayId}`
- `PATCH /v1/internal/properties/{propertyId}/activation`
- `GET /v1/internal/operations-dashboard`
- `GET /v1/audit-events?limit={limit}`
- `GET /v1/analytics/mavo?month=YYYY-MM`
- `POST /v1/payments/{paymentIntentId}/capture`
- `POST /v1/payments/{paymentIntentId}/refund`

Communications:

- `GET /v1/communication/threads`
- `POST /v1/communication/threads`
- `GET /v1/communication/threads/{threadId}`
- `POST /v1/communication/threads/{threadId}/messages`

Webhooks:

- `POST /v1/webhooks/stripe`

## Authorization Model

- Customer routes use bearer sessions and derive the owner from the authenticated actor. Customer actors can only read/write their own vehicles, bookings, payments, service records, profile, and owner communication threads.
- Partner actors are resolved from persisted access memberships. A partner can only see or operate on its own partner-location data.
- Property-manager actors are resolved from persisted access memberships. A property manager can only see and configure its scoped property.
- Internal actors are resolved from persisted access memberships and require specific permissions for sensitive areas. `super_admin` grants all internal permissions.
- Development actor headers can be used for local test calls only when allowed by environment configuration.

Permission examples:

- Audit-event reads require internal access.
- MAVO analytics require internal access.
- Internal operations dashboard requires `operations_read`.
- Condo/property lead management requires `property_manage`.
- Payment refund requires an internal finance-capable path.
- Partner dashboard and availability writes require partner or internal access, scoped to the requested location.
- Property-management dashboard/profile writes require property-manager access for the property or internal access.

## Availability and Holds

Partner slots include `capacity`, `bookedCount`, `availableCount`, `serviceCodes`, and optional `closedAt`. Customer-facing `GET /v1/availability` only returns open slots with remaining capacity.

Dynamic availability search considers scheduling rules, service capacity rules, existing bookings, and active booking holds. Booking holds temporarily reserve dynamic capacity and are consumed by booking creation.

Booking creation rejects:

- closed slots with `availability_slot_closed`
- full slots with `availability_slot_full`
- service/slot mismatches with `service_not_available_for_slot`
- expired or mismatched booking holds
- Prima Wash Day requests that exceed the configured day capacity

## Payments

Payment intent creation is scoped to the booking owner for customer actors and is also available to authorized partner/internal actors.

Payment providers:

- `local`: development provider that simulates payment operations.
- `stripe`: Stripe-backed manual-capture provider for real payment authorization flows.

Payment lifecycle:

- booking creation starts in `pending_payment`
- `POST /v1/payments/intents` creates a `requires_authorization` hold for the booking price
- `POST /v1/payments/{paymentIntentId}/authorize` moves the hold to `authorized`
- partner confirmation from `pending_payment` to `confirmed` requires an authorized payment
- booking completion automatically captures the authorized payment
- cancellation before service starts automatically voids an authorized payment
- refunds are internal-only through `POST /v1/payments/{paymentIntentId}/refund`
- Stripe authorization webhooks are reconciled idempotently through `/v1/webhooks/stripe`

## Booking Workflow

Booking status updates require partner or internal access. Valid transitions:

- `pending_payment` to `confirmed` or `cancelled`
- `confirmed` to `checked_in` or `cancelled`
- `checked_in` to `in_service` or `cancelled`
- `in_service` to `completed`

Booking cancellation uses `POST /v1/bookings/{bookingId}/cancel`. Customers can cancel their own bookings before service starts. Partners and internal actors can cancel operationally before service starts. Cancellation from `in_service`, `completed`, or `cancelled` is rejected.

Service records are created automatically when a booking reaches `completed`. Customer actors can read their own records through `GET /v1/service-records`.

## Communications

- Thread resources include `property`, `booking`, `partner_location`, and `owner`.
- Thread types include Prima Wash to property office, Prima Wash to car owner, Prima Wash to partner, and partner to car owner.
- Messages are append-only. There is no delete-message route.
- No realtime delivery or production push notifications exist yet.

## Analytics

MAVO analytics require internal access. Qualifying events are `vehicle_created`, `booking_created`, and `service_completed`.

## Persistence

Local development defaults to Postgres unless `PERSISTENCE_MODE=memory` is deliberately set. Run `npm run db:migrate` before starting the API against a new database, and run `npm run db:smoke` after new migrations are added.

Auth maintenance:

- `npm run auth:cleanup --workspace @prima-wash/api` prunes expired auth challenges, expired sessions, old revoked sessions, and retained auth rate-limit events.
