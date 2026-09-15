import { describe, expect, it } from "vitest";
import { OpenAICodexClient } from "../src/openaiClient.js";

const enabled = process.env.RUN_OPENAI_INTEGRATION === "1" && Boolean(process.env.OPENAI_API_KEY);
describe.skipIf(!enabled)("paid OpenAI integration", () => {
  it("lists one session", async () => {
    const client = new OpenAICodexClient({ apiKey: process.env.OPENAI_API_KEY! });
    const page = await client.listSessions({ limit: 1, order: "desc" });
    expect(Array.isArray(page.data)).toBe(true);
  });
});
