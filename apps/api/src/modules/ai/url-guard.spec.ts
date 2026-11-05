import { describe, expect, it } from "vitest";
import { assertSafeEndpoint, UnsafeEndpointError } from "./url-guard.js";

describe("assertSafeEndpoint", () => {
  it.each([
    ["http://localhost:11434", "http://localhost:11434"],
    ["http://127.0.0.1:11434/", "http://127.0.0.1:11434"],
    ["http://192.168.1.20:11434", "http://192.168.1.20:11434"],
    ["https://ollama.example.com/ai/", "https://ollama.example.com/ai"],
    ["http://host.docker.internal:11434", "http://host.docker.internal:11434"],
    ["http://[::ffff:c0a8:0114]:11434", "http://[::ffff:c0a8:114]:11434"], // 192.168.1.20 mapped: private, allowed
  ])("allows %s", (input, normalised) => {
    expect(assertSafeEndpoint(input)).toBe(normalised);
  });

  it.each([
    "http://169.254.169.254/latest/meta-data",
    "http://169.254.0.5",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://[fe80::1]:11434",
    "http://[::ffff:169.254.169.254]",
    "http://[::ffff:a9fe:a9fe]",
    "http://[::ffff:a9fe:1]",
    "http://0.0.0.0:11434",
    "file:///etc/passwd",
    "ftp://example.com",
    "javascript:alert(1)",
    "http://user:pass@localhost:11434",
    "not a url",
    "",
  ])("refuses %j", (input) => {
    expect(() => assertSafeEndpoint(input)).toThrow(UnsafeEndpointError);
  });
});
