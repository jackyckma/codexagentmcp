import { describe, expect, it } from "vitest";
import { normalizeSession, normalizeTurn } from "../src/openaiClient.js";
import { truncateValue } from "../src/tools.js";

describe("response normalization", () => {
  it("normalizes session timestamps and usage", () => {
    expect(normalizeSession({ id: "s1", status: "running", created_at: 100, usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 } })).toEqual(expect.objectContaining({ id: "s1", createdAt: 100_000, usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 } }));
  });
  it("extracts readable turn output", () => {
    expect(normalizeTurn({ id: "t1", status: "completed", output: [{ content: [{ text: "done" }] }] }, "s1").output).toBe("done");
  });
  it("truncates oversized responses deterministically", () => {
    const result = truncateValue({ output: "x".repeat(1_000) }, 200);
    expect(result.truncated).toBe(true);
    expect(result.value).toEqual(expect.objectContaining({ truncated: true, originalChars: expect.any(Number) }));
  });
});
