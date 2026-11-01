import { Injectable } from "@nestjs/common";
import {
  isValidTimeZone,
  type UserSettings,
  type updateUserSettingsSchema,
} from "@hanabrew/contracts";
import type { z } from "zod";
import { PrismaService } from "../../infrastructure/database/prisma.service.js";

const DEFAULT_TIME_ZONE = "UTC";

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<UserSettings> {
    const row = await this.prisma.client.userSettings.findUnique({ where: { userId } });
    return { timeZone: row?.timeZone ?? null };
  }

  async update(
    userId: string,
    input: z.output<typeof updateUserSettingsSchema>,
  ): Promise<UserSettings> {
    const row = await this.prisma.client.userSettings.upsert({
      where: { userId },
      create: { userId, timeZone: input.timeZone ?? DEFAULT_TIME_ZONE },
      update: { ...(input.timeZone ? { timeZone: input.timeZone } : {}) },
    });
    return { timeZone: row.timeZone };
  }

  /** A valid caller-supplied zone wins (clients send their effective zone); otherwise the saved one, else UTC. */
  async resolveTimeZone(userId: string, requested?: string): Promise<string> {
    if (requested && isValidTimeZone(requested)) return requested;
    return (await this.get(userId)).timeZone ?? DEFAULT_TIME_ZONE;
  }
}
