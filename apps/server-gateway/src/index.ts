import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { RawData } from 'ws';
import { env } from '@ripcord/config';
import { GatewayOpcode } from '@ripcord/types';
import type { GatewayMessage, AuthPayload, SubscribePayload, TypingPayload, VoiceStatePayload, CallSignalPayload } from '@ripcord/types';

import { log } from './logger.js';
import { connectRedis, disconnectRedis, redisSub, redisPub, redis } from './redis.js';
import { ClientConnection } from './connection.js';
import { ConnectionManager } from './connection-manager.js';
import { handleAuth, handleSubscribe, handleUnsubscribe, handleHeartbeat, handleTypingStart, handleVoiceStateUpdate, handleCallSignal } from './handlers.js';
import { setPresence } from './presence.js';
import { cleanupUserVoiceStates } from './voice-state.js';
import { scheduleOffline } from './presence-grace.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEARTBEAT_INTERVAL_MS = 30_000;
const AUTH_TIMEOUT_MS = 10_000;
const MAX_MISSED_HEARTBEATS = 2;

/** Per-connection rate limit: max messages within the sliding window. */
const RATE_LIMIT_MAX = 500;
/** Sliding window duration in milliseconds (60 seconds). */
const RATE_LIMIT_WINDOW_MS = 60_000;

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

const manager = new ConnectionManager();

// ---------------------------------------------------------------------------
// HTTP Server (used only for the WebSocket upgrade)
// ---------------------------------------------------------------------------

const httpServer = createServer(async (req, res) => {
  if (req.url === '/health/deep') {
    const results: Record<string, string> = {};

    try { await redisPub.ping(); results.pub = 'ok'; } catch { results.pub = 'error'; }
    try { await redisSub.ping(); results.sub = 'ok'; } catch { results.sub = 'error'; }
    try { await redis.ping(); results.cmd = 'ok'; } catch { results.cmd = 'error'; }

    const allOk = Object.values(results).every((v) => v === 'ok');
    res.writeHead(allOk ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: allOk, services: { redis: results }, timestamp: new Date().toISOString() }));
    return;
  }

  // Simple liveness check
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, service: 'gateway' }));
});

// ---------------------------------------------------------------------------
// WebSocket Server
// ---------------------------------------------------------------------------

const MAX_PAYLOAD_BYTES = 64 * 1024; // 64 KB per message

/** Allowed origins parsed from the comma-separated env var. */
const ALLOWED_ORIGINS = new Set(
  env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
);

/**
 * Check whether a WebSocket origin should be permitted.
 *
 * Allows:
 *  - No origin (non-browser clients, curl, etc.)
 *  - Tauri desktop origins (`https://tauri.localhost`, `tauri://localhost`)
 *  - Localhost on any port (development)
 *  - Explicitly listed origins in CORS_ALLOWED_ORIGINS
 */
function isOriginAllowed(origin: string): boolean {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Tauri desktop app origins (Windows = https://tauri.localhost, macOS/Linux = tauri://localhost)
  if (origin === 'https://tauri.localhost' || origin === 'tauri://localhost') return true;
  // Localhost on any port (development)
  try {
    const url = new URL(origin);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
  } catch {
    // malformed origin — reject
  }
  return false;
}

const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: MAX_PAYLOAD_BYTES,
  verifyClient: ({ req }, done) => {
    const origin = req.headers.origin ?? '';
    if (isOriginAllowed(origin)) {
      done(true);
    } else {
      log.warn({ origin }, 'WebSocket connection rejected — origin not allowed');
      done(false, 403, 'Origin not allowed');
    }
  },
});

wss.on('connection', (ws: WebSocket) => {
  const conn = new ClientConnection(ws);
  manager.addConnection(conn);

  log.info({ connId: conn.id }, 'New WebSocket connection');

  // Send HELLO with heartbeat interval
  conn.send(GatewayOpcode.HELLO, { heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS });

  // Auth timeout — client must authenticate within AUTH_TIMEOUT_MS
  const authTimer = setTimeout(() => {
    if (!conn.authenticated) {
      log.warn({ connId: conn.id }, 'Auth timeout — disconnecting');
      conn.send(GatewayOpcode.AUTH_FAIL, { reason: 'Authentication timeout' });
      conn.close(4000, 'Authentication timeout');
    }
  }, AUTH_TIMEOUT_MS);

  // Per-connection sliding-window rate limiter
  const messageTimestamps: number[] = [];

  // Message handler
  ws.on('message', (raw: RawData) => {
    // Rate limit check (sliding window)
    const now = Date.now();
    messageTimestamps.push(now);
    // Evict expired timestamps
    while (messageTimestamps.length > 0 && messageTimestamps[0]! <= now - RATE_LIMIT_WINDOW_MS) {
      messageTimestamps.shift();
    }
    if (messageTimestamps.length > RATE_LIMIT_MAX) {
      log.warn({ connId: conn.id, userId: conn.userId }, 'Rate limit exceeded — disconnecting');
      conn.send(GatewayOpcode.ERROR, { message: 'Rate limit exceeded' });
      conn.close(4029, 'Rate limit exceeded');
      return;
    }

    let msg: GatewayMessage;

    try {
      msg = JSON.parse(raw.toString()) as GatewayMessage;
    } catch {
      conn.send(GatewayOpcode.ERROR, { message: 'Invalid JSON' });
      conn.close(4002, 'Invalid JSON');
      return;
    }

    // Validate basic message shape
    if (typeof msg.op !== 'number') {
      conn.send(GatewayOpcode.ERROR, { message: 'Missing or invalid opcode' });
      conn.close(4002, 'Invalid message');
      return;
    }

    // Route by opcode
    switch (msg.op) {
      case GatewayOpcode.AUTH:
        clearTimeout(authTimer);
        void handleAuth(conn, msg.d as AuthPayload, manager);
        break;

      case GatewayOpcode.HEARTBEAT:
        void handleHeartbeat(conn);
        break;

      case GatewayOpcode.SUBSCRIBE:
        void handleSubscribe(conn, msg.d as SubscribePayload, manager);
        break;

      case GatewayOpcode.UNSUBSCRIBE:
        handleUnsubscribe(conn, msg.d as SubscribePayload, manager);
        break;

      case GatewayOpcode.TYPING_START:
        handleTypingStart(conn, msg.d as TypingPayload, manager);
        break;

      case GatewayOpcode.VOICE_STATE_UPDATE:
        void handleVoiceStateUpdate(conn, msg.d as VoiceStatePayload, manager);
        break;

      case GatewayOpcode.CALL_INVITE:
      case GatewayOpcode.CALL_ACCEPT:
      case GatewayOpcode.CALL_DECLINE:
      case GatewayOpcode.CALL_END:
        handleCallSignal(conn, msg.op, msg.d as CallSignalPayload, manager);
        break;

      default:
        // Unknown or server-only opcode received from client
        conn.send(GatewayOpcode.ERROR, {
          message: `Unknown or unsupported opcode: ${msg.op}`,
        });
        break;
    }
  });

  // Connection closed
  ws.on('close', () => {
    clearTimeout(authTimer);
    const removed = manager.removeConnection(conn.id);

    // Clean up voice states for this user (remove from all voice channels)
    if (removed?.userId) {
      void cleanupUserVoiceStates(removed.userId, removed.subscribedChannels, manager).catch((err) => {
        log.error({ userId: removed.userId, err }, 'Failed to clean up voice states');
      });
    }

    if (removed?.userId && !manager.hasUserConnections(removed.userId)) {
      // Last connection for this user — schedule offline after a grace period.
      // If the user reconnects quickly (token refresh, network blip), the
      // pending offline is cancelled in handleAuth(), preventing presence flap.
      const userId = removed.userId;
      scheduleOffline(userId, () => {
        // Re-check: user may have reconnected during the grace window
        if (!manager.hasUserConnections(userId)) {
          void setPresence(userId, 'offline', manager).catch((err) => {
            log.error({ userId, err }, 'Failed to set offline presence');
          });
        }
      });
    }

    log.info({ connId: conn.id, userId: conn.userId }, 'WebSocket disconnected');
  });

  // Connection error
  ws.on('error', (err) => {
    log.error({ connId: conn.id, err }, 'WebSocket error');
  });
});

// ---------------------------------------------------------------------------
// Redis pub/sub message handler
// ---------------------------------------------------------------------------

/**
 * Maps Redis pub/sub event types to gateway opcodes.
 */
const EVENT_TYPE_TO_OPCODE: Record<string, GatewayOpcode> = {
  MESSAGE_CREATE: GatewayOpcode.MESSAGE_CREATED,
  MESSAGE_EDIT: GatewayOpcode.MESSAGE_EDITED,
  MESSAGE_DELETE: GatewayOpcode.MESSAGE_DELETED,
  PRESENCE_UPDATE: GatewayOpcode.PRESENCE_UPDATED,
  MEMBER_UPDATE: GatewayOpcode.MEMBER_UPDATED,
  TYPING_START: GatewayOpcode.TYPING_START,
  VOICE_STATE_UPDATE: GatewayOpcode.VOICE_STATE_UPDATE,
  MESSAGE_PINNED: GatewayOpcode.MESSAGE_PINNED,
  MESSAGE_UNPINNED: GatewayOpcode.MESSAGE_UNPINNED,
};

/**
 * Maps Redis pub/sub event types to client event names (the `t` field).
 */
const EVENT_TYPE_TO_NAME: Record<string, string> = {
  MESSAGE_CREATE: 'MESSAGE_CREATED',
  MESSAGE_EDIT: 'MESSAGE_UPDATED',
  MESSAGE_DELETE: 'MESSAGE_DELETED',
  PRESENCE_UPDATE: 'PRESENCE_UPDATED',
  MEMBER_UPDATE: 'MEMBER_UPDATED',
  TYPING_START: 'TYPING_START',
  VOICE_STATE_UPDATE: 'VOICE_STATE_UPDATE',
  MESSAGE_PINNED: 'MESSAGE_PINNED',
  MESSAGE_UNPINNED: 'MESSAGE_UNPINNED',
};

redisSub.on('message', (redisChannel: string, message: string) => {
  if (!redisChannel.startsWith('ch:')) return;
  const channelId = redisChannel.slice(3);

  try {
    const parsed = JSON.parse(message) as { type: string; data: unknown };
    const opcode = EVENT_TYPE_TO_OPCODE[parsed.type];
    const eventName = EVENT_TYPE_TO_NAME[parsed.type];

    if (opcode !== undefined) {
      manager.broadcastToChannel(channelId, opcode, parsed.data, eventName);
    } else {
      log.warn({ redisChannel, type: parsed.type }, 'Unknown event type from Redis');
    }
  } catch (err) {
    log.error({ redisChannel, err }, 'Failed to parse Redis pub/sub message');
  }
});

// ---------------------------------------------------------------------------
// Heartbeat sweep
// ---------------------------------------------------------------------------

const heartbeatInterval = setInterval(() => {
  for (const conn of manager.allConnections()) {
    if (!conn.authenticated) continue;

    conn.missedHeartbeats += 1;

    if (conn.missedHeartbeats > MAX_MISSED_HEARTBEATS) {
      log.warn(
        { connId: conn.id, userId: conn.userId, missed: conn.missedHeartbeats },
        'Too many missed heartbeats — disconnecting',
      );
      conn.close(4009, 'Heartbeat timeout');
      // The 'close' event handler will clean up the connection
    }
  }
}, HEARTBEAT_INTERVAL_MS);

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function start(): Promise<void> {
  await connectRedis();

  const port = env.GATEWAY_PORT;
  httpServer.listen(port, () => {
    log.info({ port }, 'Ripcord Gateway listening');
  });
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function shutdown(signal: string): void {
  log.info({ signal }, 'Shutdown signal received');

  clearInterval(heartbeatInterval);

  // Close all WebSocket connections gracefully
  for (const conn of manager.allConnections()) {
    conn.close(1001, 'Server shutting down');
  }

  wss.close(() => {
    log.info('WebSocket server closed');
  });

  httpServer.close(() => {
    log.info('HTTP server closed');

    void disconnectRedis().then(() => {
      log.info('Shutdown complete');
      process.exit(0);
    });
  });

  // Force exit after 10s if graceful shutdown stalls
  setTimeout(() => {
    log.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

start().catch((err) => {
  log.fatal({ err }, 'Failed to start gateway');
  process.exit(1);
});
