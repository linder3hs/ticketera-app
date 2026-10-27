import { afterEach, describe, expect, it, vi } from "vitest";

import { getAppUrl, requireEnv } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requireEnv", () => {
  it("returns the value when set", () => {
    vi.stubEnv("SOME_VAR", "value");
    expect(requireEnv("SOME_VAR")).toBe("value");
  });

  it("throws a clear error when missing or empty", () => {
    vi.stubEnv("SOME_VAR", "");
    expect(() => requireEnv("SOME_VAR")).toThrow("SOME_VAR is not set.");
  });
});

describe("getAppUrl", () => {
  it("uses APP_URL when set", () => {
    vi.stubEnv("APP_URL", "https://ticketera.example");
    expect(getAppUrl()).toBe("https://ticketera.example");
  });

  it("falls back to localhost outside production and throws in production", () => {
    vi.stubEnv("APP_URL", undefined);
    vi.stubEnv("NODE_ENV", "development");
    expect(getAppUrl()).toBe("http://localhost:3000");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getAppUrl()).toThrow("APP_URL is not set.");
  });
});
