# Codex Cloud Agent MCP

A small, remote [Model Context Protocol](https://modelcontextprotocol.io/) server that adapts MCP tools to OpenAI-hosted Codex agent sessions. An MCP client dispatches coding work, polls it, reads results, continues the same hosted session, retrieves artifacts, or cancels active work without receiving the server's OpenAI or GitHub credentials.

> **Billing:** OpenAI Agents API usage is API-billed and does not consume ChatGPT Plus/Business included Codex subscription quota.

## Status and live-API compatibility

This project targets the public-beta hosted Codex session API described in the project specification. At implementation time, this build environment could not access `developers.openai.com`, npm, or the reference `jackyckma/cursoragentmcp` repository (the network proxy returned HTTP 403). Consequently, the beta surface could not be revalidated here.

There is one deliberate compatibility boundary: all beta paths and wire payloads are confined to `src/openaiClient.ts`. The released OpenAI SDK's typed resources have historically lagged beta endpoints, so the adapter uses the official SDK's authenticated low-level `get`/`post` methods with `/codex/sessions` and normalizes the results. If the live beta uses a different prefix or event field, only that adapter needs changing; `apiPrefix` is injectable for compatibility tests. Environment-template administration also remains a control-plane operation, rather than an MCP tool.

Before production deployment, verify these beta details against the current official documentation and your enabled OpenAI project:

1. session base path and create payload;
2. `input_message` and `cancel` session-event names;
3. hosted-environment repository and secret-reference fields;
4. turns, artifacts, and subagents resource paths.

## Architecture and implementation lanes

| Lane | Responsibility | Files |
| --- | --- | --- |
| A | Typed client contract, SDK adapter, normalization, errors | `src/types.ts`, `src/openaiClient.ts`, `src/errors.ts` |
| B | Zod inputs, ten MCP tools, annotations, truncation | `src/tools.ts` |
| C | HTTPS repository validation and hosted-environment mapping | `src/environment.ts`, `scripts/setup-environment-template.ts` |
| D | bearer auth, stateless Streamable HTTP, stdio, Docker | `src/auth.ts`, `src/index.ts`, `Dockerfile` |
| E | stable-boundary unit tests and opt-in paid integration test | `tests/` |
| F | setup, deployment, connector, security, and workflows | `README.md`, `.env.example` |

The MCP layer depends only on the `CodexClient` interface. It has no OpenAI SDK calls, which keeps beta churn contained.

## Prerequisites

- Node.js 22+
- An OpenAI API project with hosted Codex/Agents beta access and API billing enabled
- An OpenAI API key
- A long, random MCP bearer token for HTTP deployments
- Optionally, an OpenAI hosted-environment template and server-controlled GitHub credential

## Configuration

Copy `.env.example` into your deployment's secret/configuration store. Do not commit `.env`.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | Yes | — | Server-to-OpenAI authentication; never accepted from MCP input |
| `MCP_SERVER_TOKEN` | HTTP only | — | MCP client bearer token |
| `PORT` | No | `3000` | HTTP listening port |
| `TRANSPORT` | No | `http` | `http` or `stdio` |
| `CODEX_DEFAULT_MODEL` | No | API default | Default session model |
| `CODEX_DEFAULT_AGENT_ID` | No | inline config | Reusable saved agent |
| `CODEX_ENVIRONMENT_TEMPLATE_ID` | No | fresh hosted environment | Reusable hosted setup |
| `GITHUB_TOKEN` | No | — | Server-side repository credential; never put it in prompts |
| `GITHUB_DEFAULT_OWNER` | No | — | Reserved deployment convention |
| `LOG_LEVEL` | No | `info` | Reserved structured-log threshold |
| `MAX_RESPONSE_CHARS` | No | `50000` | MCP and inline-artifact response limit |
| `DEFAULT_NETWORK_ACCESS` | No | provider default | Hosted-environment network policy |

The current environment mapping sends `GITHUB_TOKEN` as a server-controlled secret environment value. Prefer storing it in the OpenAI environment template/control plane when supported, and omit it from this service entirely.

## Local setup

```bash
npm install
cp .env.example .env
# Export variables with your preferred secret loader; Node does not load .env here.
npm run build
npm test
OPENAI_API_KEY=... MCP_SERVER_TOKEN=... npm start
```

The remote MCP endpoint is `POST http://localhost:3000/mcp`; health is `GET http://localhost:3000/health`. HTTP uses stateless MCP requests so no local session store is needed. OpenAI session IDs provide cloud-work continuity.

For stdio:

```bash
OPENAI_API_KEY=... TRANSPORT=stdio npm start
```

`MCP_SERVER_TOKEN` is not required for stdio because the process boundary is the trust boundary.

## Zeabur deployment

1. Create a service from this Git repository; Zeabur will build the `Dockerfile`.
2. Add `OPENAI_API_KEY` and a random `MCP_SERVER_TOKEN` as secrets.
3. Add any optional `CODEX_*` and GitHub configuration.
4. Expose port `3000` (or set `PORT` to Zeabur's assigned value).
5. Configure the service health check as `GET /health`.
6. Keep TLS enabled on the public domain and connect clients to `https://<service-domain>/mcp`.

The container runs as the unprivileged `node` user and contains production dependencies only.

## Claude or another MCP client

Create a remote/custom connector with:

- **URL:** `https://<service-domain>/mcp`
- **Header:** `Authorization: Bearer <MCP_SERVER_TOKEN>`

Do not configure the OpenAI key in the MCP client. Claude/Orbita authenticates to this service with the MCP token; this service independently authenticates to OpenAI.

## Tools

| Tool | Effect |
| --- | --- |
| `codex_create_session` | **Dispatch** an asynchronous coding task and return its session ID immediately |
| `codex_list_sessions` | List compact recent session summaries |
| `codex_get_session` | Read status, usage, error, metadata, and required actions |
| `codex_send_followup` | Send another instruction to the same session/environment |
| `codex_cancel` | Interrupt active work; marked destructive |
| `codex_list_turns` | Read summarized work/results without raw event logs |
| `codex_get_turn` | Read one detailed turn |
| `codex_list_artifacts` | List produced artifact metadata |
| `codex_get_artifact` | Read safe small text or metadata for binary/large content |
| `codex_list_subagents` | Inspect multi-agent workers |

Every successful tool response has both human-readable `content` and `structuredContent`. Oversized structures become a bounded preview. Artifact content has an additional adapter-level bound so binary or large values are not blindly injected into an MCP context.

## Example workflow

1. “Launch a Codex agent on `https://github.com/jackyckma/codexagentmcp` at `main`; inspect the README and suggest three improvements without editing.”
2. The client calls `codex_create_session`, retains `sessionId`, and immediately reports dispatch.
3. “Check how it is doing.” The client calls `codex_get_session`, then `codex_list_turns` when results are needed.
4. “Implement the second recommendation and run tests.” The client calls `codex_send_followup` with the **same** `sessionId`.
5. The client uses `codex_list_artifacts`/`codex_get_artifact` for files, or `codex_cancel` to interrupt the task.

Parallel tasks use separate calls to `codex_create_session`; OpenAI assigns independent session IDs and hosted environments.

## Testing

```bash
npm test                 # mocks only; no paid API calls
npm run typecheck
npm run build
```

The integration test is skipped by default. It currently performs a read-only session list but still requires explicit opt-in and valid beta access:

```bash
OPENAI_API_KEY=... npm run test:integration
```

## Security and logging

- MCP HTTP access requires constant-time bearer-token comparison. `/health` is public and contains no configuration details.
- Repository URLs must be HTTPS and cannot contain credentials, query strings, or fragments. Refs reject option-like and whitespace-bearing values.
- Prompts, authorization headers, repository contents, and secrets are not logged.
- Structured logs contain timestamp, tool, session ID, duration, status, and normalized error category.
- OpenAI errors are normalized and likely bearer/key/token values are redacted.
- Requests are limited to 1 MB and MCP responses are truncated to `MAX_RESPONSE_CHARS`.
- Use a fine-grained, least-privilege GitHub token, preferably held by the OpenAI environment template rather than this process.
- Restrict hosted egress to GitHub and required package registries where the beta environment policy permits it.

This is a personal/internal MVP. It intentionally omits public multi-tenancy, OAuth, saved-agent CRUD, environment-template CRUD, vault administration, billing, arbitrary tool-result injection, and raw event streaming.
