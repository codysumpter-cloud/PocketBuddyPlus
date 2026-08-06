import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PluginAiGateway, hostAiApiKeySecret, hostSecretsOwner, openAiBase } from "../src/plugin-ai-gateway.js";
import { getPluginPlatformSettings, initializePluginPlatformSettings } from "../src/plugin-platform-settings.js";
import type { PluginSecretsStore } from "../src/plugin-secrets.js";

const root = mkdtempSync(join(tmpdir(), "pocket-buddy-nvidia-"));
const originalFetch = globalThis.fetch;

try {
  writeFileSync(join(root, "openpets-plugin-platform.json"), JSON.stringify({
    ai: { provider: "nvidia", model: "meta/llama-3.3-70b-instruct" },
  }));

  initializePluginPlatformSettings(root);
  assert.equal(getPluginPlatformSettings().ai.provider, "nvidia");
  assert.equal(openAiBase(undefined, "nvidia"), "https://integrate.api.nvidia.com/v1");
  assert.equal(openAiBase("https://example.test/v1/", "nvidia"), "https://example.test/v1");

  const secrets = {
    async get(owner: string, key: string): Promise<string | undefined> {
      assert.equal(owner, hostSecretsOwner);
      assert.equal(key, hostAiApiKeySecret);
      return "nvapi-test";
    },
  } as unknown as PluginSecretsStore;

  let requestedUrl = "";
  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer nvapi-test");
    const body = JSON.parse(String(init?.body)) as { model?: string; messages?: Array<{ role: string; content: string }> };
    assert.equal(body.model, "meta/llama-3.3-70b-instruct");
    assert.deepEqual(body.messages, [{ role: "user", content: "Hello Buddy" }]);
    return new Response(JSON.stringify({ choices: [{ message: { content: "Hey!" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const result = await new PluginAiGateway(secrets).complete({
    messages: [{ role: "user", content: "Hello Buddy" }],
  });

  assert.equal(requestedUrl, "https://integrate.api.nvidia.com/v1/chat/completions");
  assert.deepEqual(result, { text: "Hey!" });
  console.error("NVIDIA Buddy AI gateway routing passed.");
} finally {
  globalThis.fetch = originalFetch;
  rmSync(root, { recursive: true, force: true });
}
