import { Request, Response, NextFunction } from "express";
import { nanoid } from "nanoid";

/**
 * Attaches a short, url-safe request id to every request and emits it as
 * `X-Request-ID` on the response. Honors an inbound `X-Request-ID` header if
 * provided and it matches a simple allow-list (alphanumerics, dash, underscore,
 * 8–64 chars) — otherwise a fresh `req_<nanoid>` is generated.
 *
 * The id is also exposed on `req.requestId` for use in downstream logging and
 * the global error handler's response envelope.
 */
const INBOUND_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export interface RequestIdRequest extends Request {
  requestId?: string;
}

export function requestId(req: RequestIdRequest, res: Response, next: NextFunction) {
  const inbound = req.headers["x-request-id"];
  const inboundStr = Array.isArray(inbound) ? inbound[0] : inbound;

  const id =
    typeof inboundStr === "string" && INBOUND_ID_PATTERN.test(inboundStr)
      ? inboundStr
      : `req_${nanoid(16)}`;

  req.requestId = id;
  res.setHeader("X-Request-ID", id);
  next();
}
