import OpenAI from "openai";
import { buildEnvironment, type EnvironmentOptions } from "./environment.js";
import { normalizeOpenAIError } from "./errors.js";
import type { CodexArtifact, CodexClient, CodexSessionSummary, CodexSubagent, CodexTurn, CreateSessionInput, Page, TokenUsage } from "./types.js";

type Json = Record<string, any>;

export type OpenAICodexClientOptions = EnvironmentOptions & {
  apiKey: string;
  defaultModel?: string;
  defaultAgentId?: string;
  maxArtifactChars?: number;
  /** Override only for beta compatibility testing. */
  apiPrefix?: string;
};

function timestamp(value: unknown): number | undefined {
  if (typeof value !== "number") return undefined;
  return value > 10_000_000_000 ? value : value * 1000;
}

function usage(raw: Json | undefined): TokenUsage | undefined {
  if (!raw) return undefined;
  const result = {
    inputTokens: raw.input_tokens ?? raw.inputTokens,
    outputTokens: raw.output_tokens ?? raw.outputTokens,
    totalTokens: raw.total_tokens ?? raw.totalTokens,
  };
  return Object.values(result).some((item) => typeof item === "number") ? result : undefined;
}

export function normalizeSession(raw: Json): CodexSessionSummary {
  return {
    id: String(raw.id),
    status: String(raw.status ?? "unknown"),
    name: raw.name,
    repository: raw.repository,
    createdAt: timestamp(raw.created_at ?? raw.createdAt) ?? Date.now(),
    lastActiveAt: timestamp(raw.last_active_at ?? raw.updated_at ?? raw.lastActiveAt),
    error: typeof raw.error === "string" ? raw.error : raw.error?.message,
    usage: usage(raw.usage),
    requiredActions: raw.required_actions ?? raw.requiredActions,
    metadata: raw.metadata,
  };
}

function outputText(raw: Json): string | undefined {
  if (typeof raw.output_text === "string") return raw.output_text;
  if (typeof raw.output === "string") return raw.output;
  if (!Array.isArray(raw.output)) return undefined;
  return raw.output.flatMap((item: Json) => item.content ?? []).map((item: Json) => item.text ?? item.value).filter(Boolean).join("\n") || undefined;
}

export function normalizeTurn(raw: Json, sessionId: string): CodexTurn {
  return {
    id: String(raw.id), sessionId, status: String(raw.status ?? "unknown"),
    createdAt: timestamp(raw.created_at), completedAt: timestamp(raw.completed_at),
    summary: raw.summary, output: outputText(raw), error: typeof raw.error === "string" ? raw.error : raw.error?.message,
  };
}

function page<T>(raw: Json, map: (item: Json) => T): Page<T> {
  return {
    data: (raw.data ?? raw.sessions ?? raw.turns ?? []).map(map),
    nextCursor: raw.next_cursor ?? raw.nextCursor,
    hasMore: raw.has_more ?? raw.hasMore,
  };
}

/**
 * All beta-specific paths and payload shapes live in this adapter. The official
 * SDK's low-level request method is used because the hosted Codex session beta
 * is not represented consistently by released SDK type declarations yet.
 */
export class OpenAICodexClient implements CodexClient {
  private readonly sdk: OpenAI;
  private readonly prefix: string;

  constructor(private readonly options: OpenAICodexClientOptions, sdk?: OpenAI) {
    this.sdk = sdk ?? new OpenAI({ apiKey: options.apiKey });
    this.prefix = (options.apiPrefix ?? "/codex/sessions").replace(/\/$/, "");
  }

  private async request<T>(method: "get" | "post", path: string, data?: Json): Promise<T> {
    try {
      const sdk = this.sdk as unknown as Record<string, (path: string, options?: Json) => Promise<T>>;
      return await sdk[method]!(path, method === "get" ? { query: data } : { body: data });
    } catch (error) { throw normalizeOpenAIError(error); }
  }

  async createSession(input: CreateSessionInput): Promise<CodexSessionSummary> {
    const environment = buildEnvironment(input.repository, this.options);
    const body: Json = {
      input: [{ type: "message", role: "user", content: input.prompt }],
      ...(input.name ? { name: input.name } : {}),
      ...(input.agentId ?? this.options.defaultAgentId ? { agent_id: input.agentId ?? this.options.defaultAgentId } : {}),
      ...(input.model ?? this.options.defaultModel ? { model: input.model ?? this.options.defaultModel } : {}),
      ...(environment ? { environment } : {}),
      ...(input.multiAgent ? { multi_agent: { enabled: input.multiAgent.enabled, max_concurrent_subagents: input.multiAgent.maxConcurrentSubagents } } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
    return normalizeSession(await this.request<Json>("post", this.prefix, body));
  }

  async listSessions(input: { limit?: number; after?: string; order?: "asc" | "desc" }) {
    const raw = await this.request<Json>("get", this.prefix, input);
    return page(raw, normalizeSession);
  }
  async getSession(sessionId: string) { return normalizeSession(await this.request<Json>("get", `${this.prefix}/${encodeURIComponent(sessionId)}`)); }
  async sendMessage(sessionId: string, prompt: string) {
    const raw = await this.request<Json>("post", `${this.prefix}/${encodeURIComponent(sessionId)}/events`, { type: "input_message", role: "user", content: prompt });
    return normalizeSession(raw.session ?? raw);
  }
  async cancelSession(sessionId: string) {
    const raw = await this.request<Json>("post", `${this.prefix}/${encodeURIComponent(sessionId)}/events`, { type: "cancel" });
    return normalizeSession(raw.session ?? raw);
  }
  async listTurns(sessionId: string, input: { limit?: number; after?: string }) {
    const raw = await this.request<Json>("get", `${this.prefix}/${encodeURIComponent(sessionId)}/turns`, input);
    return page(raw, (item) => normalizeTurn(item, sessionId));
  }
  async getTurn(sessionId: string, turnId: string) {
    return normalizeTurn(await this.request<Json>("get", `${this.prefix}/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}`), sessionId);
  }
  async listArtifacts(sessionId: string): Promise<CodexArtifact[]> {
    const raw = await this.request<Json>("get", `${this.prefix}/${encodeURIComponent(sessionId)}/artifacts`);
    return (raw.data ?? raw.artifacts ?? []).map((item: Json) => ({ id: String(item.id), path: item.path ?? item.filename, sizeBytes: item.size_bytes ?? item.bytes, turnId: item.turn_id, createdAt: timestamp(item.created_at), mediaType: item.media_type ?? item.content_type }));
  }
  async getArtifact(sessionId: string, artifactId: string): Promise<CodexArtifact> {
    const raw = await this.request<Json>("get", `${this.prefix}/${encodeURIComponent(sessionId)}/artifacts/${encodeURIComponent(artifactId)}`);
    const limit = this.options.maxArtifactChars ?? 50_000;
    const content = typeof raw.content === "string" && raw.content.length <= limit ? raw.content : undefined;
    return { id: String(raw.id), path: raw.path ?? raw.filename, sizeBytes: raw.size_bytes ?? raw.bytes, turnId: raw.turn_id, createdAt: timestamp(raw.created_at), mediaType: raw.media_type ?? raw.content_type, content, downloadUrl: raw.download_url, truncated: typeof raw.content === "string" && !content };
  }
  async listSubagents(sessionId: string): Promise<CodexSubagent[]> {
    const raw = await this.request<Json>("get", `${this.prefix}/${encodeURIComponent(sessionId)}/subagents`);
    return (raw.data ?? raw.subagents ?? []).map((item: Json) => ({ id: String(item.id), status: String(item.status ?? "unknown"), name: item.name, createdAt: timestamp(item.created_at) }));
  }
}
