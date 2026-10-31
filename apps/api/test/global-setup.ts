import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

/**
 * Rebuilds the e2e database from the committed migration SQL before the suite runs.
 * This is destructive (it drops the public schema), so it refuses to touch any database
 * whose name does not end in `_test`.
 */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Example: postgresql://hanabrew:<password>@localhost:5432/hanabrew_test",
    );
  }
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!dbName.endsWith("_test")) {
    throw new Error(
      `Refusing to reset database "${dbName}": e2e tests only run against *_test databases.`,
    );
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    const root = resolve(import.meta.dirname, "../../../packages/database/prisma/migrations");
    const folders = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const folder of folders) {
      await client.query(readFileSync(resolve(root, folder, "migration.sql"), "utf8"));
    }
  } finally {
    await client.end();
  }
}
