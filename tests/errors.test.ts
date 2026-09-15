import { describe, expect, it } from "vitest";
import { normalizeOpenAIError } from "../src/errors.js";

describe("OpenAI error normalization", () => {
  it.each<[Record<string, unknown>, string]>([
    [{ status: 401, message: "bad key" }, "authentication"],
    [{ status: 429, message: "rate limited" }, "rate_limit"],
    [{ status: 429, message: "billing quota" }, "credits"],
    [{ status: 404, message: "missing" }, "not_found"],
    [{ status: 400, message: "unknown beta field" }, "beta_incompatibility"],
  ])("maps %#", (source, category) => expect(normalizeOpenAIError(source)).toMatchObject({ category }));

  it("redacts likely bearer values", () => {
    expect(normalizeOpenAIError(new Error("Bearer top-secret-token")).message).not.toContain("top-secret-token");
  });
});
