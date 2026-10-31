import { describe, expect, it } from "vitest";
import {
  isPlaceholderEmail,
  normalizeUsername,
  placeholderEmailFor,
  signUpFormSchema,
  usernameSchema,
} from "./auth.js";

describe("username rules", () => {
  it("normalises case and whitespace", () => {
    expect(usernameSchema.parse("  Hana_Chan ")).toBe("hana_chan");
    expect(normalizeUsername(" ABC ")).toBe("abc");
  });
  it.each(["ab", "has space", "emoji🌸", "a".repeat(31), "semi;colon", ""])(
    "rejects %j",
    (value) => {
      expect(usernameSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe("placeholder email", () => {
  it("is derived from the normalised username on a reserved domain", () => {
    expect(placeholderEmailFor("Hana")).toBe("hana@users.hanabrew.invalid");
    expect(isPlaceholderEmail("hana@users.hanabrew.invalid")).toBe(true);
    expect(isPlaceholderEmail("hana@example.com")).toBe(false);
  });
});

describe("sign-up form", () => {
  it("requires a 10+ character password", () => {
    expect(signUpFormSchema.safeParse({ username: "hana", password: "short" }).success).toBe(false);
    expect(
      signUpFormSchema.safeParse({ username: "hana", password: "long-enough-pw" }).success,
    ).toBe(true);
  });
});
