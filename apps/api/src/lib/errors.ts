/**
 * Typed application errors. Routes can `throw new AppError(...)` and the global
 * error handler will format them into the unified response envelope:
 *
 *   { error: "human message", code: "MACHINE_CODE", requestId: "req_..." }
 *
 * Non-AppError throws still work — they are treated as 500s with code INTERNAL_ERROR.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(opts: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  }) {
    super(opts.message);
    this.name = "AppError";
    this.status = opts.status;
    this.code = opts.code;
    this.details = opts.details;
  }

  static badRequest(message: string, code = "BAD_REQUEST", details?: unknown) {
    return new AppError({ status: 400, code, message, details });
  }

  static unauthorized(message = "Unauthorized", code = "UNAUTHORIZED") {
    return new AppError({ status: 401, code, message });
  }

  static forbidden(message = "Forbidden", code = "FORBIDDEN") {
    return new AppError({ status: 403, code, message });
  }

  static notFound(message = "Not found", code = "NOT_FOUND") {
    return new AppError({ status: 404, code, message });
  }

  static conflict(message: string, code = "CONFLICT") {
    return new AppError({ status: 409, code, message });
  }

  static tooManyRequests(message: string, code = "RATE_LIMITED", details?: unknown) {
    return new AppError({ status: 429, code, message, details });
  }

  static internal(message = "Internal server error", code = "INTERNAL_ERROR") {
    return new AppError({ status: 500, code, message });
  }
}

/**
 * Map a plain `Error` / unknown throw to an AppError. Preserves AppError as-is.
 */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Error) {
    return AppError.internal(err.message || "Internal server error");
  }
  return AppError.internal("Internal server error");
}
