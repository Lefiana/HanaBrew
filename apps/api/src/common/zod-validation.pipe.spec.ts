import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createOriginCheck } from "./origin-check.middleware.js";
import { ZodValidationPipe } from "./zod-validation.pipe.js";

describe("ZodValidationPipe", () => {
  const pipe = new ZodValidationPipe(z.object({ n: z.coerce.number().int().min(1) }));

  it("returns the parsed (coerced) value", () => {
    expect(pipe.transform({ n: "5" })).toEqual({ n: 5 });
  });

  it("throws a 400 carrying every issue with its path", () => {
    try {
      pipe.transform({ n: "0" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse() as {
        issues: Array<{ path: string }>;
      };
      expect(body.issues[0]?.path).toBe("n");
    }
  });
});

describe("origin check", () => {
  const check = createOriginCheck(["http://localhost:3000"]);
  function run(method: string, path: string, origin?: string) {
    let status = 0;
    let called = false;
    const req = {
      method,
      path,
      header: (name: string) => (name === "origin" ? origin : undefined),
    };
    const res = {
      locals: {},
      status: (code: number) => ((status = code), { json: () => undefined }),
    };
    check(req as never, res as never, () => (called = true));
    return { status, called };
  }

  it("lets safe methods through regardless of origin", () => {
    expect(run("GET", "/api/tasks", "http://evil.example").called).toBe(true);
  });
  it("blocks unsafe requests from unknown origins", () => {
    expect(run("POST", "/api/tasks", "http://evil.example")).toEqual({
      status: 403,
      called: false,
    });
    expect(run("DELETE", "/api/tasks/x", "null")).toEqual({ status: 403, called: false });
  });
  it("allows unsafe requests from the allow-list, or with no Origin header", () => {
    expect(run("POST", "/api/tasks", "http://localhost:3000").called).toBe(true);
    expect(run("POST", "/api/tasks").called).toBe(true);
  });
  it("leaves /api/auth to Better Auth's own check", () => {
    expect(run("POST", "/api/auth/sign-in/username", "http://evil.example").called).toBe(true);
  });
});
