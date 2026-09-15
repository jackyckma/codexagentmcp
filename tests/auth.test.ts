import { describe, expect, it } from "vitest";
import { isAuthorized } from "../src/auth.js";

describe("bearer authentication", () => {
  it("accepts only an exact bearer token", () => {
    expect(isAuthorized("Bearer secret", "secret")).toBe(true);
    expect(isAuthorized("Bearer wrong", "secret")).toBe(false);
    expect(isAuthorized("Basic secret", "secret")).toBe(false);
    expect(isAuthorized(undefined, "secret")).toBe(false);
  });
});
