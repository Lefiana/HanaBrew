import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence in depth for cookie-authenticated, state-changing requests. Browsers always send
 * `Origin` on cross-origin and same-origin unsafe requests, so a request whose Origin is not on the
 * allow-list is refused. Requests without an Origin (curl, server-to-server) carry no browser cookies
 * and pass. Better Auth's own routes (/api/auth/*) perform their own origin check.
 */
export function createOriginCheck(allowedOrigins: readonly string[]) {
  const allowed = new Set(allowedOrigins);
  return (req: Request, res: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(req.method) || req.path.startsWith("/api/auth")) return next();
    const origin = req.header("origin");
    if (origin && !allowed.has(origin)) {
      res.status(403).json({
        statusCode: 403,
        error: "FORBIDDEN",
        message: "Origin not allowed.",
        requestId: res.locals.requestId,
      });
      return;
    }
    next();
  };
}
