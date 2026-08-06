# AI providers

Pocket Buddy+ exposes one host-managed AI gateway to the built-in Buddy Talk surface and to plugins with the `ai` permission. Provider credentials stay behind the host boundary and are never returned to renderer or plugin code.

## Supported providers

| Provider | Default endpoint | Default model when blank | API key required |
| --- | --- | --- | --- |
| Anthropic | `https://api.anthropic.com` | `claude-haiku-4-5-20251001` | Yes |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | Yes |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | `meta/llama-3.3-70b-instruct` | Yes |
| Ollama | `http://127.0.0.1:11434/v1` | `llama3.2` | No |

The model field can override the default. A valid custom base URL can override the provider endpoint for compatible deployments.

## Buddy Talk

The Buddy+ **Talk** section uses the same host gateway as approved AI plugins. The renderer sends a narrow validated request containing only:

- the current Talk message
- up to 12 recent Talk messages
- the Buddy's public name, mood, activity, dominant need, and affection level

Notes, tasks, files, plugin state, screen contents, API keys, and other credentials are not included. The host validates size and shape before contacting the provider, caps the generated response, and logs only request lengths and provider failures—not conversation text.

When no provider is configured, the key is unavailable, the provider fails, or an empty response is returned, Talk uses the existing deterministic mood-aware local reply instead. Local fallback keeps the Buddy usable without cloud access and makes provider outages non-destructive.

## NVIDIA behavior

NVIDIA NIM uses the gateway's OpenAI-compatible chat-completions path:

```text
POST https://integrate.api.nvidia.com/v1/chat/completions
Authorization: Bearer <user key>
```

Completion, streaming, system messages, and OpenAI-style function tools use the shared gateway implementation. Pocket Buddy+ does not expose the key to the requesting renderer or plugin.

Speech-to-text is currently limited to OpenAI or Ollama-compatible transcription endpoints. Selecting NVIDIA for chat does not imply that NVIDIA's separate speech APIs are configured.

## Credential handling

- The Control Center sends the key to the Electron host over the existing narrow preload bridge.
- The host stores the key in the encrypted host secrets store under the compatibility owner namespace.
- Buddy Talk can request a completion but cannot read the key.
- Plugins can ask whether AI is available and submit completion requests, but cannot read the key.
- Logs and UI snapshots must report only key presence, never the key value.
- Removing the key disables cloud-provider calls until a replacement is saved; Buddy Talk continues with local fallback.

## Plugin usage

A plugin must declare the `ai` permission. Calls are then routed through `ctx.ai.complete(...)` or `ctx.ai.stream(...)` using the provider and model selected by the user.

Provider-specific fetch logic must remain in the host gateway. Plugins should not duplicate vendor authentication or store vendor credentials in plugin configuration.
