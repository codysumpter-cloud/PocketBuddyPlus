# Pocket Buddy+

**A persistent desktop Buddy, AI companion, and plugin platform from Prismtek.**

Pocket Buddy+ keeps one Buddy identity across desktop companionship, agent integrations, creator tools, and plugin-powered experiences. The Buddy is the shared character; plugins add what the Buddy can do.

> **Active development:** the desktop companion, model-backed Buddy Talk, host-owned Buddy profile, shared inventory/equipment ledger, Buddy Training reward loop, plugin runtime, animation system, creator plugins, Music Buddy, and agent integrations already exist. Battles, trading, and broader device sync are being built on top of those foundations rather than as separate apps.

## What works today

- Animated desktop Buddies with installable sprite packs, multi-animation manifests, reactions, synchronized eight-direction movement, and per-Buddy reaction mapping.
- A Pocket Buddy+ Control Center with Buddy status, care, AI conversation with local fallback, notes, tasks, collection, wardrobe, pet management, plugins, and integrations.
- A versioned host-owned Buddy profile that approved plugins can read without receiving Talk history, notes, tasks, files, or credentials.
- A shared transactional inventory/equipment ledger with canonical item definitions, quantities, slots, idempotent mutation receipts, and sandboxed plugin access.
- A bundled Buddy Training vertical slice that chooses drills from the public Buddy profile and issues crash-safe apple rewards through the shared ledger.
- Sandboxed JavaScript/TypeScript plugins with declared permissions, quotas, schedules, storage, commands, panels, events, audio, notifications, secrets, and network controls.
- Host-managed AI access for Buddy Talk and approved plugins through Anthropic, OpenAI, **NVIDIA NIM**, or Ollama.
- Secure user-supplied API keys kept in the host secret store instead of renderer state, plugin source, or plugin configuration.
- Claude Code, OpenCode, Cursor, Pi, MCP, and local agent-reaction integrations.
- Bundled Prismtek creator tooling, including Prism Pixel + Rig Studio and Prismcade Creator.
- Music Buddy with host-mediated Spotify OAuth, normalized now-playing status, and basic playback controls.
- Official companion plugins for reminders, focus, routines, hydration, mood check-ins, virtual-pet needs, and small interactive experiences.

## One Buddy, many plugins

Pocket Buddy+ owns the durable systems that every experience needs:

- Buddy identity, personality, needs, progression, and memory contracts
- animation and reaction routing
- AI providers and secure credentials
- plugin permissions and lifecycle
- events, commands, panels, storage, saves, and migrations
- shared inventory, equipment, economy, and multiplayer contracts as they are introduced

Plugins own experiences. That is where battles, trading, games, social features, creator tools, journaling, GitHub workflows, and future Prismtek ideas belong.

Platform references:

- [`docs/pocket-buddy-platform.md`](docs/pocket-buddy-platform.md) — product and plugin architecture
- [`docs/buddy-profile.md`](docs/buddy-profile.md) — public Buddy identity/state contract
- [`docs/buddy-inventory.md`](docs/buddy-inventory.md) — shared item, equipment, and transaction contract
- [`docs/buddy-training.md`](docs/buddy-training.md) — first profile-aware reward-loop plugin
- [`docs/plugins/music-buddy.md`](docs/plugins/music-buddy.md) — Spotify provider and native music boundary

## NVIDIA AI setup

Pocket Buddy+ uses NVIDIA's OpenAI-compatible NIM endpoint through the existing host AI gateway.

1. Open **Settings → Plugins**.
2. Choose **NVIDIA NIM** as the AI provider.
3. Save your NVIDIA API key.
4. Optionally enter a model ID. When left blank, Pocket Buddy+ uses `meta/llama-3.3-70b-instruct`.
5. Open **Buddy+ → Talk** to chat with your mood-aware Buddy, or enable an approved AI plugin.

The API key is retrieved only by the host gateway. Buddy Talk and plugins using the `ai` permission receive generated output, not the credential. When the provider is unavailable, Buddy Talk falls back to deterministic local replies.

See [`docs/ai-providers.md`](docs/ai-providers.md) for provider behavior, Talk context, fallback behavior, and security boundaries.

## Current product boundary

The canonical product is **Pocket Buddy+** in this repository. The older BeMoreBuddy/iBeMore applications are donor and reference codebases, not separate products that Pocket Buddy+ depends on at runtime. Useful features can be ported into Pocket Buddy+ or implemented as plugins without preserving parallel app architectures.

The current shipping target is the Electron desktop application for macOS, Windows, and Linux. A future native mobile companion can share Pocket Buddy+ contracts and data without reviving the old app split.

## Plugin development

The plugin SDK remains published under the compatibility package name `@open-pets/plugin-sdk` while the product surface is rebranded. Existing package names, protocol names, storage filenames, and custom URL schemes are retained where changing them would break installed integrations or user data.

Create a plugin:

```bash
npx @open-pets/cli plugin new "My Buddy Plugin" --template blank
```

Validate it:

```bash
npx @open-pets/cli plugin validate ./my-buddy-plugin
```

Useful references:

- [`docs/plugins.md`](docs/plugins.md) — plugin manifests, permissions, runtime, and host capabilities
- [`docs/sdk.md`](docs/sdk.md) — public SDK contract and test harness
- [`docs/superplugins.md`](docs/superplugins.md) — official companion-first plugin policy
- [`plugins/official/`](plugins/official/) — first-party examples

## Development

Requirements:

- Node.js 20+
- pnpm 11+

Install dependencies:

```bash
pnpm install
```

Run the desktop app:

```bash
pnpm dev:desktop
```

Run with local official plugins:

```bash
pnpm dev:desktop:plugins
```

Validate the workspace:

```bash
pnpm check
```

Build a Pocket Buddy+ desktop package directory:

```bash
pnpm package:desktop:plus:dir
```

## Repository map

```text
apps/desktop               Pocket Buddy+ Electron host and Control Center
apps/desktop/src/buddy     Buddy identity and behavior foundation
apps/desktop/src/inventory Shared item, equipment, and transaction ledger
packages/sdk               Compatibility-published plugin SDK
packages/mcp               Local MCP bridge
packages/agent-events      Safe agent event and speech sanitization
packages/pet-format        Pet and animation manifest contracts
plugins/official           Bundled and catalog-ready Buddy plugins
docs                       Architecture, plugin, provider, and release documentation
```

## Safety and privacy

- Local IPC uses a local socket or named pipe with a per-run token.
- Buddy Talk sends only the current message, up to 12 recent Talk messages, and the Buddy's public mood/need snapshot to the configured provider.
- Notes, tasks, files, plugin state, screen contents, and credentials stay out of Buddy Talk requests.
- Plugin permissions are declared and approved before host capabilities are exposed.
- `pets:read` permits profile/inventory snapshots; inventory mutations require the stronger `pets:manage` permission.
- Inventory mutations accept only trusted host item definitions and produce source-attributed, idempotent receipts.
- OAuth endpoints, scopes, PKCE, and registered loopback ports remain controlled by the trusted host.
- JavaScript plugins run in sandboxed hosts; the application renders trusted UI descriptors.
- Private-network and SSRF protections apply to plugin network access.
- Dynamic speech is filtered and requires explicit host settings.
- API keys are host-managed secrets and are never returned to renderer or plugin code.

## Project history and attribution

Pocket Buddy+ is built from the open-source OpenPets foundation and retains compatible internal identifiers where a premature rename would break packages, integrations, storage, or installed plugins. Product-facing work is moving forward under Pocket Buddy+ and Prismtek while preserving upstream license and attribution history.

See [`LICENSE`](LICENSE) and the repository history for licensing and contributor attribution.
