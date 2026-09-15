import type { Repository } from "./types.js";

export type EnvironmentOptions = {
  templateId?: string;
  networkAccess?: string;
  githubToken?: string;
};

export function validateRepository(repository: Repository | undefined): void {
  if (!repository) return;
  let url: URL;
  try { url = new URL(repository.url); } catch { throw new Error("repository.url must be a valid URL"); }
  if (url.protocol !== "https:") throw new Error("repository.url must use HTTPS");
  if (url.username || url.password || url.search || url.hash) throw new Error("repository.url must not contain credentials, query parameters, or fragments");
  if (repository.ref && (/^-/.test(repository.ref) || /[\s\0]/.test(repository.ref))) throw new Error("repository.ref is not safe");
}

export function buildEnvironment(repository: Repository | undefined, options: EnvironmentOptions): Record<string, unknown> | undefined {
  validateRepository(repository);
  if (!repository && !options.templateId) return undefined;
  const environment: Record<string, unknown> = { type: "hosted" };
  if (options.templateId) environment.template_id = options.templateId;
  if (options.networkAccess) environment.network_access = options.networkAccess;
  if (repository) environment.repository = { url: repository.url, ...(repository.ref ? { ref: repository.ref } : {}) };
  // Secret values are referenced by name. They are never included in an API prompt or response.
  if (options.githubToken) environment.secret_env = { GITHUB_TOKEN: { source: "server", value: options.githubToken } };
  return environment;
}
