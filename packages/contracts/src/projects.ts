import { z } from "zod";
import { isoDateSchema, isoInstantSchema, uuidSchema, csvEnum } from "./common.js";

export const PROJECT_STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

const nameSchema = z.string().trim().min(1, "Name is required.").max(120);
const descriptionSchema = z.string().max(5000);

export const projectProgressSchema = z.object({
  total: z.number().int().nonnegative(),
  todo: z.number().int().nonnegative(),
  inProgress: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  /** completed / (total - cancelled), whole percent, calculated by the API from task records. */
  percent: z.number().int().min(0).max(100),
});
export type ProjectProgress = z.infer<typeof projectProgressSchema>;

export const projectSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(PROJECT_STATUSES),
  startDate: isoDateSchema.nullable(),
  targetDate: isoDateSchema.nullable(),
  progress: projectProgressSchema,
  createdAt: isoInstantSchema,
  updatedAt: isoInstantSchema,
});
export type Project = z.infer<typeof projectSchema>;

/** Returns an error message when the target date precedes the start date. */
export function validateProjectDates(
  startDate?: string | null,
  targetDate?: string | null,
): string | null {
  return startDate && targetDate && targetDate < startDate
    ? "The target date can't be before the start date."
    : null;
}

export const createProjectSchema = z
  .strictObject({
    name: nameSchema,
    description: descriptionSchema.nullish(),
    status: z.enum(PROJECT_STATUSES).optional(),
    startDate: isoDateSchema.nullish(),
    targetDate: isoDateSchema.nullish(),
  })
  .superRefine((value, ctx) => {
    const message = validateProjectDates(value.startDate, value.targetDate);
    if (message) ctx.addIssue({ code: "custom", path: ["targetDate"], message });
  });
export type CreateProjectInput = z.input<typeof createProjectSchema>;

export const updateProjectSchema = z
  .strictObject({
    name: nameSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
    startDate: isoDateSchema.nullable().optional(),
    targetDate: isoDateSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.")
  .superRefine((value, ctx) => {
    const message = validateProjectDates(value.startDate, value.targetDate);
    if (message) ctx.addIssue({ code: "custom", path: ["targetDate"], message });
  });
export type UpdateProjectInput = z.input<typeof updateProjectSchema>;

export const listProjectsQuerySchema = z.object({
  status: csvEnum(PROJECT_STATUSES).optional(),
  /** Archived projects are hidden unless asked for (or filtered by status). */
  includeArchived: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});
export type ListProjectsQuery = z.input<typeof listProjectsQuerySchema>;
