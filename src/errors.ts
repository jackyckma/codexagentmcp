export type ErrorCategory = "authentication" | "rate_limit" | "credits" | "invalid_model" | "not_found" | "session_failed" | "environment" | "repository" | "network" | "validation" | "beta_incompatibility" | "upstream";

export class CodexApiError extends Error {
  constructor(public readonly category: ErrorCategory, message: string, public readonly status?: number) {
    super(message);
    this.name = "CodexApiError";
  }
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof (error as { message?: unknown })?.message === "string" ? (error as { message: string }).message : undefined;
  if (message) return message.replace(/(Bearer|api[_-]?key|token)\s+[A-Za-z0-9._-]+/gi, "$1 [REDACTED]").slice(0, 500);
  return "Unknown upstream error";
}

export function normalizeOpenAIError(error: unknown): CodexApiError {
  const candidate = error as { status?: number; code?: string; type?: string };
  const status = candidate?.status;
  const value = `${candidate?.code ?? ""} ${candidate?.type ?? ""} ${safeMessage(error)}`.toLowerCase();
  if (status === 401 || status === 403) return new CodexApiError("authentication", "OpenAI rejected the server API credentials.", status);
  if (status === 429 && /quota|credit|billing/.test(value)) return new CodexApiError("credits", "OpenAI API quota or credits are insufficient.", status);
  if (status === 429) return new CodexApiError("rate_limit", "OpenAI rate limit reached; retry later.", status);
  if (status === 404) return new CodexApiError("not_found", "The requested Codex session resource was not found.", status);
  if (/model/.test(value) && /invalid|not found|access/.test(value)) return new CodexApiError("invalid_model", "The configured model is invalid or unavailable.", status);
  if (/clone|github|repository/.test(value)) return new CodexApiError("repository", "Repository setup failed; check the URL and server-managed GitHub access.", status);
  if (/network|egress|dns/.test(value)) return new CodexApiError("network", "The hosted environment could not access a required network resource.", status);
  if (/environment|template/.test(value)) return new CodexApiError("environment", "The hosted environment could not be prepared.", status);
  if (status === 400 && /unknown|unsupported|beta/.test(value)) return new CodexApiError("beta_incompatibility", "The OpenAI Agents beta API shape is incompatible with this server version.", status);
  return new CodexApiError("upstream", `OpenAI request failed: ${safeMessage(error)}`, status);
}
