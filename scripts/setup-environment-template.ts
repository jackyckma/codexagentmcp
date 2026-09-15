/**
 * Environment-template creation is intentionally not automated in MVP: the
 * hosted Agents beta has no stable template-management SDK surface. Create a
 * template in OpenAI's control plane, store GitHub credentials there, and set
 * CODEX_ENVIRONMENT_TEMPLATE_ID. This script acts as a safe configuration
 * check and never prints secret values.
 */
const required = ["OPENAI_API_KEY", "CODEX_ENVIRONMENT_TEMPLATE_ID"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  process.stderr.write(`Missing required configuration: ${missing.join(", ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Environment template configuration is present.\n");
}
