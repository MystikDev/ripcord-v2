// Ripcord service endpoints
// In production these come from environment variables

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export const AUTH_BASE_URL =
  process.env.NEXT_PUBLIC_AUTH_URL ?? 'http://localhost:4002';

export const GATEWAY_URL =
  process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'ws://localhost:4001';

// WebAuthn Relying Party
export const RP_NAME = 'Ripcord';

// Gateway heartbeat interval (ms)
export const HEARTBEAT_INTERVAL = 30_000;

// Gateway reconnect config
export const RECONNECT_BASE_DELAY = 1_000;
export const RECONNECT_MAX_DELAY = 30_000;

// Token refresh threshold (ms before expiry)
export const TOKEN_REFRESH_THRESHOLD = 60_000;
