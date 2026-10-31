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

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const response = exception.getResponse();
      const raw =
        typeof response === "string"
          ? response
          : typeof (response as { message?: unknown }).message === "string"
            ? (response as { message: string }).message
            : exception.message;
      if (statusCode < 500) message = raw;
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
    };
    res.status(statusCode).json(body);
  }
}
