import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  uptimeSeconds: z.number().nonnegative(),
  version: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const readinessResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  checks: z.object({ database: z.enum(["up", "down"]) }),
});
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;

export const workspaceSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(["PERSONAL"]),
  role: z.enum(["OWNER", "ADMIN", "MEMBER"]),
});
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;

export const meResponseSchema = z.object({
  user: z.object({
    id: z.uuid(),
    username: z.string(),
    displayName: z.string(),
  }),
  workspace: workspaceSummarySchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  message: z.string(),
  requestId: z.string().optional(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
