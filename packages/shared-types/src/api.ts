// ---------------------------------------------------------------------------
// API Response Wrapper
// ---------------------------------------------------------------------------

/**
 * Standardised JSON envelope returned by every Ripcord REST endpoint.
 *
 * Successful responses set `ok: true` with `data` populated.
 * Error responses set `ok: false` with `error` populated.
 *
 * @typeParam T - Shape of the `data` payload on success.
 */
export interface ApiResponse<T = unknown> {
  /** Whether the request completed successfully. */
  ok: boolean;
  /** Payload on success. */
  data?: T;
  /** Error details on failure. */
  error?: {
    /** Machine-readable error code (e.g. "INVALID_HANDLE"). */
    code: string;
    /** Human-readable description of what went wrong. */
    message: string;
    /** Arbitrary additional context (validation errors, etc.). */
    details?: unknown;
  };
}

// ---------------------------------------------------------------------------
// API Error Class
// ---------------------------------------------------------------------------

/**
 * Typed error class thrown by API route handlers.
 *
 * Includes an HTTP status code and a machine-readable error code so
 * middleware can serialise it into an {@link ApiResponse} automatically.
 */
export class ApiError extends Error {
  /** Machine-readable error code. */
  readonly code: string;
  /** HTTP status code to send in the response. */
  readonly statusCode: number;
  /** Optional additional context. */
  readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    statusCode: number,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  // -----------------------------------------------------------------------
  // Static factory helpers
  // -----------------------------------------------------------------------

  /** 400 Bad Request. */
  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError("BAD_REQUEST", message, 400, details);
  }

  /** 401 Unauthorized. */
  static unauthorized(message = "Authentication required"): ApiError {
    return new ApiError("UNAUTHORIZED", message, 401);
  }

  /** 403 Forbidden. */
  static forbidden(message = "Insufficient permissions"): ApiError {
    return new ApiError("FORBIDDEN", message, 403);
  }

  /** 404 Not Found. */
  static notFound(message = "Resource not found"): ApiError {
    return new ApiError("NOT_FOUND", message, 404);
  }

  /** 409 Conflict. */
  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError("CONFLICT", message, 409, details);
  }

  /** 429 Too Many Requests. */
  static tooManyRequests(message = "Rate limit exceeded"): ApiError {
    return new ApiError("TOO_MANY_REQUESTS", message, 429);
  }

  /** 500 Internal Server Error. */
  static internal(message = "Internal server error"): ApiError {
    return new ApiError("INTERNAL_ERROR", message, 500);
  }
}
