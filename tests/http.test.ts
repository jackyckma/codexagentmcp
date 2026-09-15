import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { startHttp } from "../src/index.js";

let server: Server | undefined;
afterEach(async () => { if (server) await new Promise<void>((resolve) => server!.close(() => resolve())); server = undefined; });

describe("HTTP runtime", () => {
  it("leaves health public and protects MCP", async () => {
    server = await startHttp({ openaiApiKey: "test", mcpServerToken: "secret", port: 0, transport: "http", defaultModel: undefined, defaultAgentId: undefined, environmentTemplateId: undefined, githubToken: undefined, githubDefaultOwner: undefined, defaultNetworkAccess: undefined, logLevel: "info", maxResponseChars: 5000 });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No TCP address");
    expect((await fetch(`http://127.0.0.1:${address.port}/health`)).status).toBe(200);
    expect((await fetch(`http://127.0.0.1:${address.port}/mcp`, { method: "POST", body: "{}" })).status).toBe(401);
  });
});
