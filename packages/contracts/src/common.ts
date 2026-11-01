import { z } from "zod";

/** "YYYY-MM-DD": a calendar date with no time and no zone. */
export const isoDateSchema = z.iso.date();
/** An exact instant with an explicit offset, e.g. 2026-11-02T09:00:00+08:00 or ...Z. */
export const isoInstantSchema = z.iso.datetime({ offset: true });
export const uuidSchema = z.uuid();

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** IANA time zone name such as "Asia/Manila". */
export const timeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(isValidTimeZone, "Unknown time zone.");

export const MS_PER_DAY = 86_400_000;

/** Comma-separated query value -> validated enum list. */
export function csvEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z
    .string()
    .transform((raw) =>
      raw
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(values)).min(1));
}
