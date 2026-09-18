#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isAuthorized } from "./auth.js";
import { loadConfig, validateConfig, type Config } from "./config.js";
import { OpenAICodexClient } from "./openaiClient.js";
import { createToolServer } from "./tools.js";

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const value = Buffer.from(chunk);
    size += value.length;
    if (size > 1_000_000) throw new Error("Request body exceeds 1 MB");
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function makeClient(config: Config) {
  return new OpenAICodexClient({
    apiKey: config.openaiApiKey, defaultModel: config.defaultModel, defaultAgentId: config.defaultAgentId,
    templateId: config.environmentTemplateId, networkAccess: config.defaultNetworkAccess,
    githubToken: config.githubToken, maxArtifactChars: config.maxResponseChars,
  });
}

export async function startHttp(config: Config): Promise<ReturnType<typeof createServer>> {
  const client = makeClient(config);
  const httpServer = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      if (request.method === "GET" && url.pathname === "/health") {
        return json(response, 200, { status: "ok", service: "codex-agent-mcp" });
      }
      if (url.pathname !== "/mcp") return json(response, 404, { error: "not_found" });
      if (!isAuthorized(request.headers.authorization, config.mcpServerToken)) {
        response.setHeader("www-authenticate", "Bearer");
        return json(response, 401, { error: "unauthorized" });
      }
      if (request.method !== "POST") return json(response, 405, { error: "method_not_allowed" });

      const body = await readJson(request);
      const server = createToolServer(client, config.maxResponseChars);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      response.on("close", () => { void transport.close(); void server.close(); });
      await server.connect(transport);
      await transport.handleRequest(request, response, body);
    } catch (error) {
      if (!response.headersSent) json(response, 400, { error: "bad_request", message: error instanceof Error ? error.message : "Request failed" });
      else response.end();
    }
  });
  await new Promise<void>((resolve) => httpServer.listen(config.port, "0.0.0.0", resolve));
  process.stderr.write(`${JSON.stringify({ timestamp: new Date().toISOString(), status: "listening", port: config.port, transport: "http" })}\n`);
  return httpServer;
}

export async function main(): Promise<void> {
  const config = loadConfig();
  validateConfig(config);
  const server = createToolServer(makeClient(config), config.maxResponseChars);
  if (config.transport === "stdio") {
    await server.connect(new StdioServerTransport());
    return;
  }
  await startHttp(config);
}

const entryArg = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryArg && import.meta.url === pathToFileURL(entryArg).href) {
  main().catch((error) => { process.stderr.write(`${JSON.stringify({ timestamp: new Date().toISOString(), status: "fatal", error: error instanceof Error ? error.message : "Unknown error" })}\n`); process.exit(1); });
}
