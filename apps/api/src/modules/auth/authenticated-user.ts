import { createParamDecorator, type ExecutionContext, UnauthorizedException } from "@nestjs/common";

/**
 * The identity every controller works with. Controllers depend on this shape only,
 * never on Better Auth types, so the auth library can be swapped behind this boundary.
 */
export interface AuthenticatedUser {
  userId: string;
  username: string;
  displayName: string;
}

interface SessionUserLike {
  id: string;
  name: string;
  username?: string | null;
}

export function toAuthenticatedUser(user: SessionUserLike): AuthenticatedUser {
  return { userId: user.id, username: user.username ?? "", displayName: user.name };
}

/** Reads the verified identity the global auth guard placed on the request. */
export function getAuthenticatedUser(request: {
  session?: { user?: SessionUserLike };
}): AuthenticatedUser {
  const user = request.session?.user;
  if (!user) throw new UnauthorizedException();
  return toAuthenticatedUser(user);
}

/** Resolves the verified identity for a controller parameter. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser =>
    getAuthenticatedUser(context.switchToHttp().getRequest()),
);
