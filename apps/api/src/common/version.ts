import { readFileSync } from "node:fs";

/** Read once from apps/api/package.json (the same relative path works from src/ and dist/). */
export const APP_VERSION: string = (
  JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;
