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

/** Resolves the verified identity placed on the request by the global auth guard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<{ session?: { user?: SessionUserLike } }>();
    const user = request.session?.user;
    if (!user) throw new UnauthorizedException();
    return toAuthenticatedUser(user);
  },
);
