import { Injectable } from "@nestjs/common";
import type { ReadinessResponse } from "@hanabrew/contracts";
import { PrismaService } from "../../infrastructure/database/prisma.service.js";

const DATABASE_TIMEOUT_MS = 2_000;

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async readiness(): Promise<ReadinessResponse> {
    const database = await this.pingDatabase();
    return { status: database ? "ok" : "degraded", checks: { database: database ? "up" : "down" } };
  }

  private async pingDatabase(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("database ping timed out")), DATABASE_TIMEOUT_MS);
      });
      await Promise.race([this.prisma.client.$queryRaw`SELECT 1`, timeout]);
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
