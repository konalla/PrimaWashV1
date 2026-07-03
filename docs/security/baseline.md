# Security baseline

- Customer mobile sessions use signed, expiring bearer tokens.
- Native session tokens are stored with Expo SecureStore.
- Verification challenges are persisted, expire after ten minutes, and lock after five failed attempts.
- Session records are persisted and logout revokes the current bearer session.
- Development identity headers are rejected automatically when `NODE_ENV=production`.
- Production requires `AUTH_SESSION_SECRET` to contain at least 32 characters.
- Server-side access memberships resolve partner, property-manager, and internal scopes.
- Internal users are permissioned by capability, including operations, finance, property, partner, and super-admin permissions.
- Production OTP delivery, refresh rotation or equivalent session renewal, and MFA for privileged roles remain required before launch.
- Server-side role, organization, property, and partner-location authorization with deny-by-default behavior
- Provider-hosted card collection; encryption in transit and at rest
- Managed secrets and documented personal-data retention/deletion
- Immutable audit coverage for security, payment, refund, and privileged actions
- CI scanning for dependencies, secrets, source, and containers
- Explicit tenant-isolation, privilege-escalation, and webhook-replay tests
- Rate limits on authentication, search, booking, and payment
- Restoration and incident-response exercises before launch

Current implementation:

- Mobile and web clients use signed bearer sessions from `/v1/auth/code/verify`.
- Development actor headers remain available only for local/dev paths and are rejected automatically in production.
- Auth challenges and auth sessions are persisted in Postgres when the API runs with Postgres repositories.
- Production still needs delivery provider integration, authentication rate limiting, and privileged-role MFA.
- Customer actors can only access their own owner scope; cross-owner reads/writes return 403.
- Partner actors are hydrated from persisted access memberships and scoped to their partner location.
- Property-manager actors are hydrated from persisted access memberships and scoped to their property.
- Internal actors require explicit permissions for sensitive operations.
- Request logs are structured JSON and include request id, method, path, status code, and duration.
- `x-request-id` is accepted from clients and returned on responses for correlation.
- Vehicle and booking mutations write application-level audit events.
- Booking status changes and cancellations write application-level audit events.
- Payment authorization, capture, refund, and void operations write application-level audit events.
- Communication threads and messages are durable append-only product records. Delete-message behavior is not implemented.
- Service-record creation writes application-level audit events.
- Product analytics are stored separately from audit events.
- Recent audit events are readable only by internal actors.

No release may contain a known critical vulnerability, tenant-data exposure, unresolved payment inconsistency, or unaudited administrative action.
