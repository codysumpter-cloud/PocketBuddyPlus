# AI providers

Pocket Buddy+ exposes one host-managed AI gateway to plugins with the `ai` permission. Provider credentials stay behind the host boundary and are never returned to plugin code.

## Supported providers

| Provider | Default endpoint | Default model when blank | API key required |
| --- | --- | --- | --- |
| Anthropic | `https://api.anthropic.com` | `claude-haiku-4-5-20251001` | Yes |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | Yes |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | `meta/llama-3.3-70b-instruct` | Yes |
| Ollama | `http://127.0.0.1:11434/v1` | `llama3.2` | No |

The model field can override the default. A valid custom base URL can override the provider endpoint for compatible deployments.

## NVIDIA behavior

NVIDIA NIM uses the gateway's OpenAI-compatible chat-completions path:

```text
POST https://integrate.api.nvidia.com/v1/chat/completions
Authorization: Bearer <user key>
```

Completion, streaming, system messages, and OpenAI-style function tools use the shared gateway implementation. Pocket Buddy+ does not expose the key to the requesting plugin.

Speech-to-text is currently limited to OpenAI or Ollama-compatible transcription endpoints. Selecting NVIDIA for chat does not imply that NVIDIA's separate speech APIs are configured.

## Credential handling

- The Control Center sends the key to the Electron host over the existing narrow preload bridge.
- The host stores the key in the encrypted host secrets store under the compatibility owner namespace.
- Plugins can ask whether AI is available and submit completion requests, but cannot read the key.
- Logs and UI snapshots must report only key presence, never the key value.
- Removing the key disables cloud-provider calls until a replacement is saved.

## Plugin usage

A plugin must declare the `ai` permission. Calls are then routed through `ctx.ai.complete(...)` or `ctx.ai.stream(...)` using the provider and model selected by the user.

Provider-specific fetch logic must remain in the host gateway. Plugins should not duplicate vendor authentication or store vendor credentials in plugin configuration.
