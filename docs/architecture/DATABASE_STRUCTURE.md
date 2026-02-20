# Database Structure (v1)

## Design goals
- Ciphertext-only message persistence
- Strong relational integrity for auth/org/permissions
- Easy migration path for sharding and analytics later

## Core entities
- Identity: users, devices, sessions
- Collaboration: servers, channels, roles, member_roles
- Messaging: messages (encrypted envelope JSONB)
- Crypto: key_bundles, one_time_prekeys
- Security: audit_events

## Index strategy
- `(channel_id, created_at DESC)` for message history pagination
- Add partial indexes for active sessions and unclaimed prekeys in v2

## Future evolution
- Split hot/cold message storage
- Add partitioning by channel or time for high-volume servers
- Add dedicated search index for encrypted metadata + client-side search strategy
