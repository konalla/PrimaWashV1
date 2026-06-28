# Security baseline

- Customer mobile sessions use signed, expiring bearer tokens.
- Native session tokens are stored with Expo SecureStore.
- Verification challenges expire after ten minutes and lock after five failed attempts.
- Development identity headers are rejected automatically when `NODE_ENV=production`.
- Production requires `AUTH_SESSION_SECRET` to contain at least 32 characters.
- OIDC, short-lived access tokens, refresh rotation, and MFA for privileged roles
- Server-side role, organization, and location authorization with deny-by-default behavior
- Provider-hosted card collection; encryption in transit and at rest
- Managed secrets and documented personal-data retention/deletion
- Immutable audit coverage for security, payment, refund, and privileged actions
- CI scanning for dependencies, secrets, source, and containers
- Explicit tenant-isolation, privilege-escalation, and webhook-replay tests
- Rate limits on authentication, search, booking, and payment
- Restoration and incident-response exercises before launch

Current implementation:

- Vehicle and booking routes require an actor header in development mode.
- Customer actors can only access their own owner scope; cross-owner reads/writes return 403.
- Request logs are structured JSON and include request id, method, path, status code, and duration.
- `x-request-id` is accepted from clients and returned on responses for correlation.
- Vehicle and booking mutations write application-level audit events.
- Booking status changes and cancellations write application-level audit events.
- Service-record creation writes application-level audit events.
- Product analytics are stored separately from audit events.
- Recent audit events are readable only by internal actors.

No release may contain a known critical vulnerability, tenant-data exposure, unresolved payment inconsistency, or unaudited administrative action.
