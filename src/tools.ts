import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CodexApiError } from "./errors.js";
import { logEvent } from "./logger.js";
import type { CodexClient } from "./types.js";

const repository = z.object({ url: z.string().url(), ref: z.string().min(1).max(255).optional() });
const sessionId = z.string().min(1).max(255);
const cursor = z.string().min(1).max(500).optional();
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

export function truncateValue(value: unknown, limit: number): { value: unknown; truncated: boolean } {
  const text = JSON.stringify(value, null, 2);
  if (text.length <= limit) return { value, truncated: false };
  return { value: { truncated: true, originalChars: text.length, preview: text.slice(0, Math.max(0, limit - 120)) }, truncated: true };
}

function result(value: unknown, limit: number) {
  const normalized = truncateValue(value, limit);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(normalized.value, null, 2) }],
    structuredContent: { result: normalized.value, truncated: normalized.truncated },
  };
}

function failure(error: unknown) {
  const normalized = error instanceof CodexApiError ? error : new CodexApiError("validation", error instanceof Error ? error.message : "Request failed");
  return {
    isError: true,
    content: [{ type: "text" as const, text: `${normalized.category}: ${normalized.message}` }],
    structuredContent: { error: { category: normalized.category, message: normalized.message, status: normalized.status } },
  };
}

export function createToolServer(client: CodexClient, maxResponseChars = 50_000): McpServer {
  const server = new McpServer({ name: "codex-agent-mcp", version: "0.1.0" });

  function register(name: string, definition: any, handler: (args: any) => Promise<unknown>) {
    server.registerTool(name, definition, async (args: any) => {
      const started = Date.now();
      try {
        const value = await handler(args);
        logEvent({ tool: name, session_id: args.sessionId, duration_ms: Date.now() - started, status: "ok" });
        return result(value, maxResponseChars);
      } catch (error) {
        const normalized = error instanceof CodexApiError ? error : undefined;
        logEvent({ tool: name, session_id: args.sessionId, duration_ms: Date.now() - started, status: "error", error_category: normalized?.category ?? "validation" });
        return failure(error);
      }
    });
  }

  register("codex_create_session", {
    title: "Dispatch Codex coding task",
    description: "This is the tool to DISPATCH a coding task. It creates an asynchronous OpenAI-hosted Codex session and returns immediately; use the inspection tools to monitor it.",
    inputSchema: {
      prompt: z.string().min(1).max(100_000), repository: repository.optional(), name: z.string().min(1).max(255).optional(),
      model: z.string().min(1).max(255).optional(), agentId: z.string().min(1).max(255).optional(),
      multiAgent: z.object({ enabled: z.boolean(), maxConcurrentSubagents: z.number().int().min(1).max(32).optional() }).optional(),
      metadata: z.record(z.string().max(1_000)).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (args) => {
    const session = await client.createSession(args);
    return { sessionId: session.id, status: session.status, name: session.name, repository: session.repository ?? args.repository, createdAt: session.createdAt, usage: session.usage };
  });

  register("codex_list_sessions", { description: "List recent Codex coding sessions.", inputSchema: { limit: z.number().int().min(1).max(100).optional(), after: cursor, order: z.enum(["asc", "desc"]).optional() }, annotations: readOnly }, (args) => client.listSessions(args));
  register("codex_get_session", { description: "Get compact state, usage, errors, and required actions for one session.", inputSchema: { sessionId }, annotations: readOnly }, ({ sessionId }) => client.getSession(sessionId));
  register("codex_send_followup", { description: "Continue the SAME Codex session and hosted working environment with a new instruction.", inputSchema: { sessionId, prompt: z.string().min(1).max(100_000) }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true } }, async ({ sessionId, prompt }) => ({ acknowledged: true, session: await client.sendMessage(sessionId, prompt) }));
  register("codex_cancel", { description: "Interrupt active work in a Codex session without deleting its history.", inputSchema: { sessionId }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true } }, async ({ sessionId }) => ({ cancelled: true, session: await client.cancelSession(sessionId) }));
  register("codex_list_turns", { description: "List summarized turns and readable results without raw command-event noise.", inputSchema: { sessionId, limit: z.number().int().min(1).max(100).optional(), after: cursor }, annotations: readOnly }, ({ sessionId, ...input }) => client.listTurns(sessionId, input));
  register("codex_get_turn", { description: "Get detailed state and output for a single Codex turn.", inputSchema: { sessionId, turnId: z.string().min(1).max(255) }, annotations: readOnly }, ({ sessionId, turnId }) => client.getTurn(sessionId, turnId));
  register("codex_list_artifacts", { description: "List files and other artifacts produced by a session.", inputSchema: { sessionId }, annotations: readOnly }, ({ sessionId }) => client.listArtifacts(sessionId));
  register("codex_get_artifact", { description: "Get artifact metadata and safe text content when small enough. Binary and large artifacts are metadata-only.", inputSchema: { sessionId, artifactId: z.string().min(1).max(255) }, annotations: readOnly }, ({ sessionId, artifactId }) => client.getArtifact(sessionId, artifactId));
  register("codex_list_subagents", { description: "List subagents for multi-agent diagnostics and observability.", inputSchema: { sessionId }, annotations: readOnly }, ({ sessionId }) => client.listSubagents(sessionId));
  return server;
}
