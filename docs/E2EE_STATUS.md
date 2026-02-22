# E2EE Implementation Status

## Current State

Message encryption currently uses `btoa()` / `atob()` (base64 encoding) as a **development placeholder**. This is NOT real encryption — it provides no confidentiality.

File attachments use proper **AES-256-GCM** via the Web Crypto API, with client-side encryption before upload and client-side decryption after download.

## Planned Implementation

Real end-to-end encryption for messages will use the **Signal Protocol** (X3DH key exchange + Double Ratchet):

1. **X3DH Key Exchange** — already partially supported by the key service (identity keys, signed pre-keys, one-time pre-keys)
2. **Double Ratchet** — message-level ratcheting for forward secrecy
3. **Group Sessions** — Sender Keys protocol for channel encryption

## Timeline

Targeted for Sprint 4 (post-beta). The key service infrastructure is already in place.

## Security Note

Until real E2EE is implemented, message content is visible to the server in base64 form. The server treats message envelopes as opaque blobs and never inspects or logs content, but there is no cryptographic guarantee of confidentiality.
