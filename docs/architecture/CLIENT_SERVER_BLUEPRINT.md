# Client + Server Blueprint (v1)

## Product Split
Ripcord is split into two top-level products:

1) **Client Software**
- Web client (first)
- Desktop wrapper (next)
- Mobile client (later)

2) **Server Software**
- Auth service
- API service
- Gateway (realtime websocket)
- Key service (E2EE bundles/prekeys)
- Billing service
- Worker service (async jobs)

## Client Responsibilities
- Render UI and state transitions
- Perform local encryption/decryption for E2EE payloads
- Manage device keys and secure local key storage
- Connect to gateway for realtime updates
- Call API for CRUD and settings

## Server Responsibilities
- Authentication/session lifecycle
- Authorization and permissions resolution
- Ciphertext envelope persistence and retrieval
- Realtime fanout and presence state
- Billing, entitlements, and usage limits
- Auditing and security event logging

## Security Contract
- Server never requires plaintext message content for normal operation.
- Client only receives content for channels it is authorized to access.
- Entitlements and premium checks are always server-side.
