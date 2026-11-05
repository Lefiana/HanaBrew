import { z } from "zod";
import type { JsonObject } from "./types.js";

/** Keywords every provider accepts. Everything else (format, pattern, default, $schema, ...) is removed;
 *  the API validates every argument with Zod anyway, so the schema only has to guide the model. */
const ALLOWED = new Set([
  "type",
  "description",
  "properties",
  "required",
  "items",
  "enum",
  "minimum",
  "maximum",
  "minItems",
  "maxItems",
]);

function simplify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(simplify);
  if (!node || typeof node !== "object") return node;
  const source = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === "properties" && value && typeof value === "object") {
      // property NAMES are free-form: keep them all, simplify each property's schema
      out.properties = Object.fromEntries(
        Object.entries(value as object).map(([name, schema]) => [name, simplify(schema)]),
      );
    } else if (ALLOWED.has(key)) {
      out[key] = simplify(value);
    }
  }
  return out;
}

/** Zod schema -> a small JSON Schema object that Gemini, Groq and Ollama all accept. */
export function toolParameters(schema: z.ZodType): JsonObject {
  const json = z.toJSONSchema(schema, { target: "draft-7", io: "input", unrepresentable: "any" });
  const simplified = simplify(json) as JsonObject;
  return { type: "object", properties: {}, ...simplified };
}

export const hasParameters = (parameters: JsonObject): boolean =>
  Object.keys((parameters.properties as object | undefined) ?? {}).length > 0;
