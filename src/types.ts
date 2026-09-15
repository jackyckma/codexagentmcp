export type Repository = { url: string; ref?: string };
export type TokenUsage = { inputTokens?: number; outputTokens?: number; totalTokens?: number };

export type CodexSessionSummary = {
  id: string;
  status: string;
  name?: string;
  repository?: Repository;
  createdAt: number;
  lastActiveAt?: number;
  error?: string;
  usage?: TokenUsage;
  requiredActions?: unknown[];
  metadata?: Record<string, string>;
};

export type CodexTurn = {
  id: string;
  sessionId: string;
  status: string;
  createdAt?: number;
  completedAt?: number;
  summary?: string;
  output?: string;
  error?: string;
};

export type CodexArtifact = {
  id: string;
  path?: string;
  sizeBytes?: number;
  turnId?: string;
  createdAt?: number;
  mediaType?: string;
  content?: string;
  downloadUrl?: string;
  truncated?: boolean;
};

export type CodexSubagent = { id: string; status: string; name?: string; createdAt?: number };
export type Page<T> = { data: T[]; nextCursor?: string; hasMore?: boolean };

export type CreateSessionInput = {
  prompt: string;
  repository?: Repository;
  name?: string;
  model?: string;
  agentId?: string;
  multiAgent?: { enabled: boolean; maxConcurrentSubagents?: number };
  metadata?: Record<string, string>;
};

export interface CodexClient {
  createSession(input: CreateSessionInput): Promise<CodexSessionSummary>;
  listSessions(input: { limit?: number; after?: string; order?: "asc" | "desc" }): Promise<Page<CodexSessionSummary>>;
  getSession(sessionId: string): Promise<CodexSessionSummary>;
  sendMessage(sessionId: string, prompt: string): Promise<CodexSessionSummary>;
  cancelSession(sessionId: string): Promise<CodexSessionSummary>;
  listTurns(sessionId: string, input: { limit?: number; after?: string }): Promise<Page<CodexTurn>>;
  getTurn(sessionId: string, turnId: string): Promise<CodexTurn>;
  listArtifacts(sessionId: string): Promise<CodexArtifact[]>;
  getArtifact(sessionId: string, artifactId: string): Promise<CodexArtifact>;
  listSubagents(sessionId: string): Promise<CodexSubagent[]>;
}
