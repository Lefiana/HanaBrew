import { Injectable } from "@nestjs/common";
import type { WorkspaceSummary } from "@hanabrew/contracts";
import { WorkspaceKind, WorkspaceRole } from "@hanabrew/database";
import { PrismaService } from "../../infrastructure/database/prisma.service.js";

const UNIQUE_VIOLATION = "P2002";

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the user's personal workspace, creating it (with the OWNER membership, in one
   * atomic nested write) when missing. Safe to call concurrently: a partial unique index
   * allows only one PERSONAL workspace per owner, so a losing racer re-reads the winner's row.
   */
  async ensurePersonalWorkspace(userId: string, displayName: string): Promise<WorkspaceSummary> {
    const existing = await this.findPersonalWorkspace(userId);
    if (existing) return existing;

    try {
      const created = await this.prisma.client.workspace.create({
        data: {
          name: `${displayName}'s workspace`,
          kind: WorkspaceKind.PERSONAL,
          ownerId: userId,
          memberships: { create: { userId, role: WorkspaceRole.OWNER } },
        },
      });
      return { id: created.id, name: created.name, kind: created.kind, role: WorkspaceRole.OWNER };
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        const winner = await this.findPersonalWorkspace(userId);
        if (winner) return winner;
      }
      throw error;
    }
  }

  private async findPersonalWorkspace(userId: string): Promise<WorkspaceSummary | null> {
    const membership = await this.prisma.client.workspaceMembership.findFirst({
      where: { userId, workspace: { kind: WorkspaceKind.PERSONAL, ownerId: userId } },
      include: { workspace: true },
    });
    if (!membership) return null;
    const { workspace } = membership;
    return { id: workspace.id, name: workspace.name, kind: workspace.kind, role: membership.role };
  }
}
