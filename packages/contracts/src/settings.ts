import { z } from "zod";
import { timeZoneSchema } from "./common.js";

/** `timeZone` is null until the user picks one; clients then fall back to the browser's zone. */
export const userSettingsSchema = z.object({ timeZone: z.string().nullable() });
export type UserSettings = z.infer<typeof userSettingsSchema>;

export const updateUserSettingsSchema = z
  .strictObject({ timeZone: timeZoneSchema.optional() })
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");
export type UpdateUserSettingsInput = z.input<typeof updateUserSettingsSchema>;
