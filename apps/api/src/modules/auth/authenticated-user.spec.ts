import { describe, expect, it } from "vitest";
import { toAuthenticatedUser } from "./authenticated-user.js";

describe("toAuthenticatedUser", () => {
  it("maps the session user to the controller-facing identity", () => {
    expect(toAuthenticatedUser({ id: "u1", name: "Hana", username: "hana" })).toEqual({
      userId: "u1",
      username: "hana",
      displayName: "Hana",
    });
  });
  it("tolerates a missing username", () => {
    expect(toAuthenticatedUser({ id: "u1", name: "Hana" }).username).toBe("");
  });
});
