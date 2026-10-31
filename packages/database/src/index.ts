import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client.js";

export { PrismaClient } from "./generated/client.js";
export { Prisma, WorkspaceKind, WorkspaceRole } from "./generated/client.js";
export type { User, Session, Workspace, WorkspaceMembership } from "./generated/client.js";

/** Creates a Prisma client backed by node-postgres. Callers own the lifecycle (`$disconnect`). */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}
