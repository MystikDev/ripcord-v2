import { z } from "zod";

// ---------------------------------------------------------------------------
// Token Pair
// ---------------------------------------------------------------------------

/** An access + refresh token pair returned after successful authentication. */
export interface TokenPair {
  /** Short-lived JWT access token. */
  accessToken: string;
  /** Long-lived opaque refresh token (rotated on each use). */
  refreshToken: string;
  /** Lifetime of the access token in seconds. */
  expiresIn: number;
}

// ---------------------------------------------------------------------------
// Session Info
// ---------------------------------------------------------------------------

/** Metadata about the session created or resumed during authentication. */
export interface SessionInfo {
  /** Session primary key (UUIDv4). */
  sessionId: string;
  /** Owning user id. */
  userId: string;
  /** Device the session is bound to. */
  deviceId: string;
  /** ISO-8601 timestamp of session creation. */
  createdAt: string;
  /** ISO-8601 timestamp of session expiry. */
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// Auth Response
// ---------------------------------------------------------------------------

/** Full response body returned to the client after login or token refresh. */
export interface AuthResponse {
  /** Fresh token pair. */
  tokenPair: TokenPair;
  /** Session metadata. */
  session: SessionInfo;
  /** Minimal user profile. */
  user: {
    /** User primary key (UUIDv4). */
    id: string;
    /** User's display handle. */
    handle: string;
    /** MinIO storage key for the user's avatar, if set. */
    avatarUrl?: string;
  };
}

// ---------------------------------------------------------------------------
// Zod Schemas (runtime validation)
// ---------------------------------------------------------------------------

/** Schema for a token-refresh request body. */
export const RefreshRequestSchema = z.object({
  /** The refresh token to exchange for a new token pair. */
  refreshToken: z.string().min(1, "Refresh token is required"),
});

/** Inferred input type for {@link RefreshRequestSchema}. */
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

/**
 * Schema for a logout request body.
 *
 * If `sessionId` is omitted the server revokes the caller's current session.
 */
export const LogoutRequestSchema = z.object({
  /** Session to revoke. Defaults to the current session when omitted. */
  sessionId: z.string().uuid().optional(),
});

/** Inferred input type for {@link LogoutRequestSchema}. */
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;

// ---------------------------------------------------------------------------
// Password Auth Schemas
// ---------------------------------------------------------------------------

/** Schema for password-based registration. */
export const PasswordRegisterSchema = z.object({
  handle: z
    .string()
    .min(3, "Handle must be at least 3 characters")
    .max(32, "Handle must be at most 32 characters")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Handle may only contain letters, digits, underscores, and hyphens",
    ),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
  pubIdentityKey: z.string().min(1, "Device identity key is required"),
  deviceName: z.string().optional(),
});

/** Inferred input type for {@link PasswordRegisterSchema}. */
export type PasswordRegisterInput = z.infer<typeof PasswordRegisterSchema>;

/** Schema for password-based login. */
export const PasswordLoginSchema = z.object({
  handle: z.string().min(1, "Handle is required"),
  password: z.string().min(1, "Password is required"),
  pubIdentityKey: z.string().min(1, "Device identity key is required"),
  deviceName: z.string().optional(),
});

/** Inferred input type for {@link PasswordLoginSchema}. */
export type PasswordLoginInput = z.infer<typeof PasswordLoginSchema>;

// ---------------------------------------------------------------------------
// Email Verification Schemas
// ---------------------------------------------------------------------------

/** Schema for verifying an email with a 6-digit code. */
export const VerifyEmailSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  code: z
    .string()
    .length(6, "Code must be 6 digits")
    .regex(/^\d{6}$/, "Code must be numeric"),
});

/** Inferred input type for {@link VerifyEmailSchema}. */
export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;

/** Schema for requesting a new verification code. */
export const ResendCodeSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
});

/** Inferred input type for {@link ResendCodeSchema}. */
export type ResendCodeInput = z.infer<typeof ResendCodeSchema>;

/** Response returned when registration is pending email verification. */
export interface PendingVerificationResponse {
  userId: string;
  handle: string;
  /** Masked email for display, e.g. "j***@gmail.com". */
  maskedEmail: string;
}

// ---------------------------------------------------------------------------
// Password Reset Schemas
// ---------------------------------------------------------------------------

/** Schema for requesting a password reset code. */
export const ForgotPasswordSchema = z.object({
  handle: z.string().min(1, "Handle is required"),
});

/** Inferred input type for {@link ForgotPasswordSchema}. */
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

/** Schema for confirming a password reset with a new password. */
export const ResetPasswordSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  code: z
    .string()
    .length(6, "Code must be 6 digits")
    .regex(/^\d{6}$/, "Code must be numeric"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
});

/** Inferred input type for {@link ResetPasswordSchema}. */
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

/** Schema for requesting a new password reset code. */
export const ResendResetCodeSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
});

/** Inferred input type for {@link ResendResetCodeSchema}. */
export type ResendResetCodeInput = z.infer<typeof ResendResetCodeSchema>;

/** Response returned when a password reset code has been sent. */
export interface ForgotPasswordResponse {
  userId: string;
  /** Masked email for display, e.g. "j***@gmail.com". */
  maskedEmail: string;
}
