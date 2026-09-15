import { DEFAULT_MAX_RESPONSE_CHARS, DEFAULT_PORT } from "./constants.js";

export type Config = ReturnType<typeof loadConfig>;

function integer(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`Invalid positive integer configuration value: ${value}`);
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    openaiApiKey: env.OPENAI_API_KEY ?? "",
    mcpServerToken: env.MCP_SERVER_TOKEN ?? "",
    port: integer(env.PORT, DEFAULT_PORT),
    transport: env.TRANSPORT === "stdio" ? "stdio" as const : "http" as const,
    defaultModel: env.CODEX_DEFAULT_MODEL,
    defaultAgentId: env.CODEX_DEFAULT_AGENT_ID,
    environmentTemplateId: env.CODEX_ENVIRONMENT_TEMPLATE_ID,
    githubToken: env.GITHUB_TOKEN,
    githubDefaultOwner: env.GITHUB_DEFAULT_OWNER,
    defaultNetworkAccess: env.DEFAULT_NETWORK_ACCESS,
    logLevel: env.LOG_LEVEL ?? "info",
    maxResponseChars: integer(env.MAX_RESPONSE_CHARS, DEFAULT_MAX_RESPONSE_CHARS),
  };
}

export function validateConfig(config: Config): void {
  if (!config.openaiApiKey) throw new Error("OPENAI_API_KEY is required");
  if (config.transport === "http" && !config.mcpServerToken) throw new Error("MCP_SERVER_TOKEN is required for HTTP transport");
}
