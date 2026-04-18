import { NextFunction, Response } from "express";
import { toAppError } from "../lib/errors.js";
import type { RequestIdRequest } from "./requestId.js";

/**
 * Global Express error handler. Produces the unified response envelope:
 *
 *   { error: "human message", code: "MACHINE_CODE", requestId: "req_..." }
 *
 * Callers may still `res.status(400).json({ error: "string" })` directly — this
 * handler only fires when routes call `next(err)` or throw. For full
 * consistency, routes are encouraged to `throw new AppError(...)` instead.
 */
export function errorHandler(
  err: unknown,
  req: RequestIdRequest,
  res: Response,
  _next: NextFunction,
) {
  const appErr = toAppError(err);
  const requestId = req.requestId;

  // Still log 5xx with full stack; 4xx logs message only.
  if (appErr.status >= 500) {
    console.error(
      `[${requestId ?? "no-req-id"}] ${appErr.code} ${appErr.message}`,
      err instanceof Error ? err.stack : err,
    );
  } else {
    console.warn(`[${requestId ?? "no-req-id"}] ${appErr.code} ${appErr.message}`);
  }

  const body: Record<string, unknown> = {
    error: appErr.message,
    code: appErr.code,
  };
  if (requestId) body.requestId = requestId;
  if (appErr.details !== undefined) body.details = appErr.details;

  if (!res.headersSent) {
    res.status(appErr.status).json(body);
  }
}
