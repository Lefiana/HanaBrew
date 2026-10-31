import { HttpException, HttpStatus, Logger, UnauthorizedException } from "@nestjs/common";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AllExceptionsFilter } from "./all-exceptions.filter.js";

function run(exception: unknown) {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { status, locals: { requestId: "req-1234abcd" } };
  const host = { switchToHttp: () => ({ getResponse: () => res }) };
  new AllExceptionsFilter().catch(exception, host as never);
  return { status, body: json.mock.calls[0]?.[0] };
}

describe("AllExceptionsFilter", () => {
  beforeAll(() => {
    Logger.overrideLogger(false); // keep expected 5xx logs out of test output
  });

  it("passes client errors through with the shared shape", () => {
    const { status, body } = run(new UnauthorizedException("nope"));
    expect(status).toHaveBeenCalledWith(401);
    expect(body).toMatchObject({
      statusCode: 401,
      error: "UNAUTHORIZED",
      message: "nope",
      requestId: "req-1234abcd",
    });
  });

  it("never leaks internal error details on 5xx", () => {
    const { status, body } = run(new Error("db password is hunter2"));
    expect(status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });

  it("hides the message of explicit 5xx HttpExceptions too", () => {
    const { body } = run(new HttpException("internal detail", HttpStatus.BAD_GATEWAY));
    expect(body.message).not.toContain("internal detail");
  });
});
