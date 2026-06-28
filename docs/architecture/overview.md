# Architecture overview

Prima Wash begins as a modular monolith. The modules are identity, organizations, markets, residences/properties, vehicles, catalog/availability, condo operations, bookings, fulfilment, payments, memberships, communications, notifications, and audit/support. Each owns its rules and persistence access.

PostgreSQL is the system of record. Redis is reserved for expiring holds, caching, coordination, and rate limiting. Durable queues handle asynchronous work. Managed AWS containers precede Kubernetes.

Non-negotiable invariants: bookings record accepted price/policy versions; payment handlers are idempotent; state transitions are auditable; money uses integer minor units and an ISO currency; tenant records carry an organization identifier; market-scoped records carry a country or market identifier; instants use UTC and locations retain an IANA time zone; local residence labels are market configuration rather than hardcoded domain concepts.

The API uses versioned REST resources, OpenAPI, opaque identifiers, cursor pagination, structured errors, correlation identifiers, and idempotency keys for booking/payment mutations.

## Market architecture

Prima Wash launches in Singapore but must be architected for global expansion. Market-specific vocabulary, payment providers, service catalogs, policies, residence labels, tax rules, and GTM modes should be configuration or market-scoped data.

Supported market modes:

- `residence_partnership`
- `open_marketplace`
- `mobile_dispatch`
- `fleet_or_corporate`

Singapore uses `residence_partnership` as the primary GTM mode, with open marketplace fallback for HDB, landed-property, and inactive-condo customers.

## Residential and property architecture

Core product concepts should be global:

- `market`
- `residence`
- `residenceType`
- `property`
- `serviceArea`
- `operatingWindow`

Singapore labels such as Condo, HDB, and Landed are market-specific labels over global residence types.

Condos need operational profiles because Prima Wash coordinates temporary, management-approved vehicle care operations inside existing property infrastructure. Property-scoped availability is distinct from ordinary partner availability.

## Fulfilment architecture

Bookings should support explicit fulfilment modes:

- `onsite_property_service`
- `pickup_return_service`
- `customer_dropoff`
- `mobile_dispatch`

Pickup/return is a high-trust flow and requires explicit consent, vehicle condition capture, handover events, movement policy capture, and auditability.

## Communications architecture

Communications are separate from notifications. Conversations and messages are durable product records. Notifications are delivery attempts over push, SMS, email, or later channels. Internal notes are operational records visible only to authorized Prima Wash users.
