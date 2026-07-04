# Security baseline

- Customer mobile sessions use signed, expiring bearer tokens.
- Native session tokens are stored with Expo SecureStore.
- Verification challenges are persisted, expire after ten minutes, and lock after five failed attempts.
- Verification-code requests are rate limited per normalized identifier and request source.
- Auth-code delivery is routed through a provider boundary. Local development delivery is blocked by config in production.
- Session records are persisted and logout revokes the current bearer session.
- Refresh tokens are opaque, stored as hashes, rotated on use, and revoked as a family on reuse detection.
- Development identity headers are rejected automatically when `NODE_ENV=production`.
- Production requires `AUTH_SESSION_SECRET` to contain at least 32 characters.
- Server-side access memberships resolve partner, property-manager, and internal scopes.
- Internal users are permissioned by capability, including operations, finance, property, partner, and super-admin permissions.
- Production email/SMS vendor connection, broader abuse controls, and MFA for privileged roles remain required before launch.
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
- Verification-code request rate limits are persisted in Postgres when the API runs with Postgres repositories.
- Refresh tokens are persisted in Postgres as hashes and rotate through `/v1/auth/session/refresh`.
- Auth-code delivery supports local development and webhook provider modes. Production config rejects `SHOW_DEV_AUTH_CODE=true` and `AUTH_CODE_DELIVERY_PROVIDER=local`.
- `npm run auth:cleanup --workspace @prima-wash/api` prunes expired auth challenges, expired sessions, old revoked sessions, old auth rate-limit events, and old inactive refresh tokens.
- Production still needs the selected email/SMS vendor wired behind the webhook delivery boundary, broader authentication abuse controls, and privileged-role MFA.
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
