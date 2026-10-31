import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;
const logger = new Logger("HTTP");

export const REQUEST_ID_HEADER = "x-request-id";

/** Assigns a request id and logs one line per request. Never logs bodies, headers or cookies. */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const requestId = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.locals.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const path = req.originalUrl.split("?")[0];
    const line = `${req.method} ${path} ${res.statusCode} ${ms.toFixed(1)}ms rid=${requestId}`;
    if (res.statusCode >= 500) logger.error(line);
    else if (res.statusCode >= 400) logger.warn(line);
    else logger.log(line);
  });
  next();
}
