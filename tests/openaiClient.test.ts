import { describe, expect, it } from "vitest";
import { OpenAICodexClient } from "../src/openaiClient.js";

class FakeSdk {
  calls: Array<{ method: string; path: string; options: any }> = [];
  response: any = { id: "s1", status: "running", created_at: 10 };
  async post(path: string, options: any) { this.calls.push({ method: "post", path, options }); return this.response; }
  async get(path: string, options: any) { this.calls.push({ method: "get", path, options }); return this.response; }
}

describe("OpenAI Codex adapter mapping", () => {
  it("maps create-session input", async () => {
    const sdk = new FakeSdk();
    const client = new OpenAICodexClient({ apiKey: "test", defaultModel: "codex", templateId: "tpl" }, sdk as any);
    await client.createSession({ prompt: "fix it", repository: { url: "https://github.com/a/b", ref: "main" }, multiAgent: { enabled: true, maxConcurrentSubagents: 2 } });
    expect(sdk.calls[0]).toMatchObject({ method: "post", path: "/codex/sessions", options: { body: { model: "codex", environment: { type: "hosted", template_id: "tpl", repository: { url: "https://github.com/a/b", ref: "main" } }, multi_agent: { enabled: true, max_concurrent_subagents: 2 } } } });
  });
  it("maps follow-up and cancellation events to the same session", async () => {
    const sdk = new FakeSdk();
    const client = new OpenAICodexClient({ apiKey: "test" }, sdk as any);
    await client.sendMessage("s/1", "continue");
    await client.cancelSession("s/1");
    expect(sdk.calls.map((call) => [call.path, call.options.body.type])).toEqual([
      ["/codex/sessions/s%2F1/events", "input_message"], ["/codex/sessions/s%2F1/events", "cancel"],
    ]);
  });
  it("maps list/get sessions and artifacts", async () => {
    const sdk = new FakeSdk();
    const client = new OpenAICodexClient({ apiKey: "test" }, sdk as any);
    sdk.response = { data: [{ id: "s1", status: "complete", created_at: 10 }] };
    expect((await client.listSessions({ limit: 5 })).data[0]?.id).toBe("s1");
    sdk.response = { id: "s2", status: "running", created_at: 11 };
    expect((await client.getSession("s2")).id).toBe("s2");
    sdk.response = { artifacts: [{ id: "a1", filename: "result.txt", bytes: 12 }] };
    expect(await client.listArtifacts("s2")).toEqual([expect.objectContaining({ id: "a1", path: "result.txt", sizeBytes: 12 })]);
  });
  it("does not inline oversized artifact content", async () => {
    const sdk = new FakeSdk(); sdk.response = { id: "a1", content: "abcdef", content_type: "text/plain" };
    const artifact = await new OpenAICodexClient({ apiKey: "test", maxArtifactChars: 3 }, sdk as any).getArtifact("s1", "a1");
    expect(artifact).toMatchObject({ id: "a1", content: undefined, truncated: true });
  });
});
