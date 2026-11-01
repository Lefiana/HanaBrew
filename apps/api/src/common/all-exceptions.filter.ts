import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { ApiError } from "@hanabrew/contracts";
import type { Response } from "express";

/** One error shape for every failure; internal details are logged, never returned. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exceptions");

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const requestId = typeof res.locals?.requestId === "string" ? res.locals.requestId : undefined;

    let statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Something went wrong. Please try again.";
    let issues: ApiError["issues"];

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const response = exception.getResponse();
      const object =
        typeof response === "object" ? (response as Record<string, unknown>) : undefined;
      const raw =
        typeof response === "string"
          ? response
          : typeof object?.message === "string"
            ? object.message
            : exception.message;
      if (statusCode < 500) {
        message = raw;
        if (Array.isArray(object?.issues)) issues = object.issues as ApiError["issues"];
      }
    }

    if (statusCode >= 500) {
      this.logger.error(
        `rid=${requestId ?? "-"} ${exception instanceof Error ? (exception.stack ?? exception.message) : String(exception)}`,
      );
    }

    const body: ApiError = {
      statusCode,
      error: HttpStatus[statusCode] ?? "Error",
      message,
      requestId,
      ...(issues ? { issues } : {}),
    };
    res.status(statusCode).json(body);
  }
}
