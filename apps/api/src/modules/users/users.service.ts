import { Injectable } from "@nestjs/common";
import type { MeResponse } from "@hanabrew/contracts";
import type { AuthenticatedUser } from "../auth/index.js";
import { WorkspacesService } from "../workspaces/workspaces.service.js";

@Injectable()
export class UsersService {
  constructor(private readonly workspaces: WorkspacesService) {}

  async getMe(user: AuthenticatedUser): Promise<MeResponse> {
    const workspace = await this.workspaces.ensurePersonalWorkspace(user.userId, user.displayName);
    return {
      user: { id: user.userId, username: user.username, displayName: user.displayName },
      workspace,
    };
  }
}
