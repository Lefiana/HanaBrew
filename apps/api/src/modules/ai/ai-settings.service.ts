import { BadRequestException, Injectable } from "@nestjs/common";
import type { AiSettings, updateAiSettingsSchema } from "@hanabrew/contracts";
import type { z } from "zod";
import { PrismaService } from "../../infrastructure/database/prisma.service.js";

@Injectable()
export class AiSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<AiSettings> {
    const row = await this.prisma.client.aiSettings.findUnique({ where: { userId } });
    return {
      preferredProvider: row?.preferredProvider ?? null,
      fallbackProvider: row?.fallbackProvider ?? null,
      allowCloudFallback: row?.allowCloudFallback ?? false,
      confirmationPolicy: row?.confirmationPolicy ?? "DESTRUCTIVE_ONLY",
    };
  }

  async update(
    userId: string,
    input: z.output<typeof updateAiSettingsSchema>,
  ): Promise<AiSettings> {
    const current = await this.get(userId);
    const next = { ...current, ...input };
    if (next.preferredProvider && next.preferredProvider === next.fallbackProvider) {
      throw new BadRequestException({
        message: "Validation failed.",
        issues: [
          { path: "fallbackProvider", message: "The fallback must be a different provider." },
        ],
      });
    }
    await this.prisma.client.aiSettings.upsert({
      where: { userId },
      create: { userId, ...next },
      update: next,
    });
    return next;
  }
}
