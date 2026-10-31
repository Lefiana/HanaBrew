-- Hand-written (Prisma cannot express partial indexes in schema.prisma and ignores them
-- when diffing). Guarantees a user can never end up with two PERSONAL workspaces, even
-- under concurrent sign-up / first-request races.
CREATE UNIQUE INDEX "workspaces_one_personal_per_owner"
  ON "workspaces"("ownerId")
  WHERE "kind" = 'PERSONAL';
