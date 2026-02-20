# Security Architecture (v1)

## Core Planes
- Client Plane (web/desktop/mobile)
- API + Realtime Plane
- Data Plane (Postgres, Redis, object storage)
- Crypto/Key Plane
- Audit/Security Plane

## Controls
- TLS 1.3 externally, mTLS internally
- E2EE for DMs/private channels (Signal-style primitives)
- Ciphertext-only message storage
- KMS-backed secrets, key rotation, device revocation
- WAF, strict rate limits, replay protection, schema validation
- Immutable audit trail and security events

## Mandatory Rules
- No plaintext message body in logs
- No cross-server context access
- Step-up auth for sensitive actions
- Token rotation with reuse detection
