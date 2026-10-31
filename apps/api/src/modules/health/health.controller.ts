import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import type { HealthResponse, ReadinessResponse } from "@hanabrew/contracts";
import type { Response } from "express";
import { APP_VERSION } from "../../common/version.js";
import { Public } from "../auth/index.js";
import { HealthService } from "./health.service.js";

@ApiTags("health")
@Public()
@SkipThrottle()
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness: the process is up. Does not touch dependencies. */
  @Get()
  @ApiOkResponse({ description: "The API process is running." })
  live(): HealthResponse {
    return { status: "ok", uptimeSeconds: Math.round(process.uptime()), version: APP_VERSION };
  }

  /** Readiness: dependencies are reachable. Returns 503 when the database is down. */
  @Get("ready")
  @ApiOkResponse({ description: "All dependencies are reachable." })
  @ApiServiceUnavailableResponse({ description: "A dependency is unavailable." })
  async ready(@Res({ passthrough: true }) res: Response): Promise<ReadinessResponse> {
    const result = await this.health.readiness();
    if (result.status !== "ok") res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }
}
