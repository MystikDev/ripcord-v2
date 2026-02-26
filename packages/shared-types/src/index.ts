/**
 * @ripcord/types -- Shared type definitions for the Ripcord platform.
 *
 * This package is the single source of truth for all domain types,
 * Zod validation schemas, and protocol definitions used across the
 * server services, gateway, and client applications.
 *
 * @packageDocumentation
 */

// User, Device, Session
export {
  type User,
  type UserStatus,
  type Device,
  type Session,
  CreateUserSchema,
  type CreateUserInput,
} from "./user.js";

// Hub, Channel, Role, MemberRole
export {
  type Hub,
  type Channel,
  ChannelType,
  type Role,
  type MemberRole,
  CreateHubSchema,
  type CreateHubInput,
  CreateChannelSchema,
  type CreateChannelInput,
} from "./server.js";

// Encrypted message envelope
export {
  EncryptedEnvelopeSchema,
  type EncryptedEnvelope,
} from "./message.js";

// WebSocket gateway protocol
export {
  GatewayOpcode,
  type GatewayMessage,
  type AuthPayload,
  type SubscribePayload,
  type HelloPayload,
  type PresenceStatus,
  type PresencePayload,
  type TypingPayload,
  type ReadStatePayload,
  type VoiceStatePayload,
  type VoiceParticipant,
  type MessagePinPayload,
  type CallSignalPayload,
} from "./gateway.js";

// Authentication request / response types
export {
  type TokenPair,
  type SessionInfo,
  type AuthResponse,
  RefreshRequestSchema,
  type RefreshRequest,
  LogoutRequestSchema,
  type LogoutRequest,
  PasswordRegisterSchema,
  type PasswordRegisterInput,
  PasswordLoginSchema,
  type PasswordLoginInput,
  VerifyEmailSchema,
  type VerifyEmailInput,
  ResendCodeSchema,
  type ResendCodeInput,
  type PendingVerificationResponse,
} from "./auth.js";

// E2EE key management
export {
  type KeyBundle,
  UploadBundleSchema,
  type UploadBundleInput,
  ClaimPrekeySchema,
  type ClaimPrekeyInput,
  type PrekeyCount,
} from "./keys.js";

// Permission bitfield
export {
  Permission,
  hasPermission,
  computePermissions,
} from "./permissions.js";

// API response envelope
export { type ApiResponse, ApiError } from "./api.js";

// Attachment types
export {
  type Attachment,
  type PresignedUploadResponse,
  type PresignedDownloadResponse,
} from "./attachment.js";

// Audit logging
export {
  AuditAction,
  type AuditEvent,
} from "./audit.js";

// Ban types
export { type BannedMember } from "./ban.js";
