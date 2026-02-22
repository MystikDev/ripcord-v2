// Ripcord service endpoints — configured at app startup via setAppConfig()

export interface AppConfig {
  apiBaseUrl: string;
  authBaseUrl: string;
  gatewayUrl: string;
}

const config: AppConfig = {
  apiBaseUrl: 'http://localhost:4000',
  authBaseUrl: 'http://localhost:4002',
  gatewayUrl: 'ws://localhost:4001',
};

/** Called once at app startup to set service URLs from env vars */
export function setAppConfig(overrides: Partial<AppConfig>): void {
  Object.assign(config, overrides);
}

export function getApiBaseUrl(): string {
  return config.apiBaseUrl;
}

export function getAuthBaseUrl(): string {
  return config.authBaseUrl;
}

export function getGatewayUrl(): string {
  return config.gatewayUrl;
}

// WebAuthn Relying Party
export const RP_NAME = 'Ripcord';

// Gateway heartbeat interval (ms)
export const HEARTBEAT_INTERVAL = 30_000;

// Gateway reconnect config
export const RECONNECT_BASE_DELAY = 1_000;
export const RECONNECT_MAX_DELAY = 30_000;

// Token refresh threshold (ms before expiry)
export const TOKEN_REFRESH_THRESHOLD = 60_000;
