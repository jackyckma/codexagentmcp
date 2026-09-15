import { describe, expect, it } from "vitest";
import { buildEnvironment, validateRepository } from "../src/environment.js";

describe("repository environment", () => {
  it("maps a repository without putting credentials in its URL", () => {
    expect(buildEnvironment({ url: "https://github.com/acme/repo", ref: "main" }, { templateId: "tpl_1" })).toEqual({
      type: "hosted", template_id: "tpl_1", repository: { url: "https://github.com/acme/repo", ref: "main" },
    });
  });
  it("rejects credential-bearing and unsafe repository inputs", () => {
    expect(() => validateRepository({ url: "https://token@github.com/acme/repo" })).toThrow(/credentials/);
    expect(() => validateRepository({ url: "git://github.com/acme/repo" })).toThrow(/HTTPS/);
    expect(() => validateRepository({ url: "https://github.com/acme/repo", ref: "--upload-pack=x" })).toThrow(/safe/);
  });
});
