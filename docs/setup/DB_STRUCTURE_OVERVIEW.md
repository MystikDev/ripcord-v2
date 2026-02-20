# Database Structure Overview (v1)

## Core Domains
- Identity/Auth
- Servers/Channels/Memberships
- Permissions
- Messages (ciphertext envelopes)
- Keys (E2EE bundles/prekeys)
- Billing/Entitlements
- Audit/Security events

## Principles
- Postgres is source of truth for durable state.
- Redis stores ephemeral state only (presence, typing, rate-limits).
- Message bodies stored as encrypted envelopes.
- Billing and chat concerns remain logically separated.

## Immediate Next Step
Add SQL migration files in `infra/db/migrations` with:
1) identity + sessions
2) org/channel/permissions
3) messaging
4) keys
5) billing + entitlements
6) audit + security events
