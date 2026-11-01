import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { getAuthenticatedUser } from "../auth/index.js";
import { WorkspacesService } from "./workspaces.service.js";

export interface WorkspaceContext {
  workspaceId: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
}

interface RequestWithContext {
  session?: { user?: { id: string; name: string; username?: string | null } };
  workspaceContext?: WorkspaceContext;
}

/**
 * Resolves the caller's workspace from the verified session. The client never supplies a workspace
 * or user id, so there is nothing to forge. Every data query then filters by this workspaceId.
 * Runs after the global auth guard.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(private readonly workspaces: WorkspacesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const user = getAuthenticatedUser(request);
    const workspace = await this.workspaces.ensurePersonalWorkspace(user.userId, user.displayName);
    request.workspaceContext = {
      workspaceId: workspace.id,
      userId: user.userId,
      role: workspace.role,
    };
    return true;
  }
}

export const CurrentWorkspace = createParamDecorator(
  (_data: unknown, context: ExecutionContext): WorkspaceContext => {
    const found = context.switchToHttp().getRequest<RequestWithContext>().workspaceContext;
    if (!found) throw new UnauthorizedException();
    return found;
  },
);
