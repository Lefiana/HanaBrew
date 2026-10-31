import { AllowAnonymous } from "@thallesp/nestjs-better-auth";

/**
 * Marks a route (or controller) as reachable without a session.
 * Every route is private by default because the auth guard is registered globally.
 */
export const Public = AllowAnonymous;
