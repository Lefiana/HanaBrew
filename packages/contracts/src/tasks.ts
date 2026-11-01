import { z } from "zod";
import { csvEnum, isoDateSchema, isoInstantSchema, uuidSchema } from "./common.js";

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

const titleSchema = z.string().trim().min(1, "Title is required.").max(200);
const descriptionSchema = z.string().max(5000);
const tagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(30)
  .regex(/^[\p{L}\p{N}_-]+$/u, "Tags may contain letters, numbers, - and _.");
/** Lower-cased, de-duplicated, at most 10. */
export const tagsSchema = z
  .array(tagSchema)
  .max(10, "Use at most 10 tags.")
  .transform((tags) => [...new Set(tags)]);

export const taskSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema.nullable(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  dueDate: isoDateSchema.nullable(),
  completedAt: isoInstantSchema.nullable(),
  tags: z.array(z.string()),
  createdAt: isoInstantSchema,
  updatedAt: isoInstantSchema,
});
export type Task = z.infer<typeof taskSchema>;

export const createTaskSchema = z.strictObject({
  title: titleSchema,
  description: descriptionSchema.nullish(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueDate: isoDateSchema.nullish(),
  projectId: uuidSchema.nullish(),
  tags: tagsSchema.optional(),
});
export type CreateTaskInput = z.input<typeof createTaskSchema>;

/** PATCH semantics: only the fields present are changed; `null` clears an optional field. */
export const updateTaskSchema = z
  .strictObject({
    title: titleSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    dueDate: isoDateSchema.nullable().optional(),
    projectId: uuidSchema.nullable().optional(),
    tags: tagsSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;

export const TASK_SORT_FIELDS = ["createdAt", "updatedAt", "dueDate", "priority", "title"] as const;

export const listTasksQuerySchema = z.object({
  status: csvEnum(TASK_STATUSES).optional(),
  priority: csvEnum(TASK_PRIORITIES).optional(),
  /** A project id, or "none" for tasks that belong to no project. */
  projectId: z.union([uuidSchema, z.literal("none")]).optional(),
  tag: tagSchema.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  dueFrom: isoDateSchema.optional(),
  dueTo: isoDateSchema.optional(),
  sort: z.enum(TASK_SORT_FIELDS).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type ListTasksQuery = z.input<typeof listTasksQuerySchema>;

/** Counts are computed by the API from real records. */
export const taskSummarySchema = z.object({
  todo: z.number().int().nonnegative(),
  inProgress: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  /** Open tasks (to do / in progress) whose due date is before today. */
  overdue: z.number().int().nonnegative(),
  /** completed / (total - cancelled), as a whole percent; 0 when there is nothing to do. */
  completionPercent: z.number().int().min(0).max(100),
});
export type TaskSummary = z.infer<typeof taskSummarySchema>;
