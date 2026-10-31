import { z } from "zod";

/** Lowercase letters, digits, underscore and dot. Matches Better Auth's username normalisation. */
export const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * M0 accounts are username-based. Better Auth still requires an email column, so every
 * account gets a reserved placeholder address on a non-routable domain (RFC 2606 `.invalid`).
 * The server derives it itself and ignores whatever email a client sends; a real, verified
 * email will be attached to the account in a later milestone.
 */
export const PLACEHOLDER_EMAIL_DOMAIN = "users.hanabrew.invalid";

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function placeholderEmailFor(username: string): string {
  return `${normalizeUsername(username)}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

export function isPlaceholderEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_PATTERN, "Use 3-30 characters: letters, numbers, underscore or dot.");

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH);

export const signUpFormSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(1).max(60).optional(),
  password: passwordSchema,
});
export type SignUpForm = z.infer<typeof signUpFormSchema>;

export const signInFormSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type SignInForm = z.infer<typeof signInFormSchema>;
