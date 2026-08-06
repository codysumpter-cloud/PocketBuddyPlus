# Pocket Buddy+ platform direction

Pocket Buddy+ is the canonical Buddy product. It combines the persistent desktop companion, Buddy state, AI access, integrations, creator tools, and plugin runtime in one extensible application.

## Product rule

**Pocket Buddy+ owns the Buddy. Plugins own experiences.**

The host should provide durable capabilities once, then let plugins compose them without creating another application or another incompatible Buddy implementation.

## Host-owned capabilities

The Pocket Buddy+ host owns:

- Buddy identity, profile, personality, needs, progression, and memory contracts
- installed Buddy and sprite-pack management
- animations, reactions, movement, speech bubbles, and status surfaces
- AI provider routing, model-backed Buddy Talk, local fallback, and encrypted credentials
- plugin installation, permissions, quotas, lifecycle, and diagnostics
- events, commands, schedules, panels, notifications, audio, voice, and safe networking
- shared save/version/migration contracts
- future inventory, equipment, economy, relationship, party, and multiplayer primitives

A host capability should be added only when multiple plugins need a consistent, durable contract or when the capability crosses a security boundary.

## Plugin-owned experiences

Plugins can build experiences such as:

- alternate Buddy chat personalities and specialist assistants
- battles, training, abilities, and progression modes
- trading, gifting, shops, collections, and crafting
- games, challenges, parties, and multiplayer encounters
- journal, reminders, focus, habits, and life-assistant workflows
- GitHub and developer-tool integrations
- Prism Pixel + Rig Studio, Prismcade Creator, and future creator tools
- community features and social spaces

Plugins should use shared host contracts rather than inventing private identity, inventory, currency, or animation systems that cannot interoperate.

## AI architecture

The existing host AI gateway is the single credential and provider boundary for built-in Buddy Talk and plugin AI calls.

Supported provider kinds:

- Anthropic
- OpenAI
- NVIDIA NIM
- Ollama

Buddy Talk sends a validated, intentionally narrow context: the current message, up to 12 recent Talk messages, and the Buddy's public mood/need snapshot. Notes, tasks, files, plugin state, screen contents, and credentials remain outside the request. When provider access is unavailable, the existing deterministic mood-aware response path remains the offline fallback.

Plugins request the `ai` permission and call the same host gateway. They do not receive the user's API key. The provider, model, and key are selected once in Pocket Buddy+ settings and can serve the built-in Buddy and multiple approved plugins.

## Compatibility boundary

Product-facing branding is Pocket Buddy+. Internal `openpets` package names, storage files, protocol names, environment variables, and custom schemes may remain until a deliberate migration can preserve existing installs and integrations.

Do not perform broad mechanical renames across these compatibility identifiers. Rebrand visible product copy and new public documentation first, then migrate internal identifiers only with explicit versioned compatibility handling.

## Relationship to Prismtek Apps

Prismtek Apps is the donor and integration monorepo for existing BeMore/iBeMore features and reusable Prismtek systems. Pocket Buddy+ is the runtime product that receives those features.

Useful donor behavior should be handled in one of three ways:

1. port a reusable domain contract into Pocket Buddy+ core;
2. implement the feature as a Pocket Buddy+ plugin;
3. retain the old code as reference when it is not worth carrying forward.

Pocket Buddy+ must not depend on an old BeMore/iBeMore application running beside it.

## Near-term implementation order

1. **Buddy profile contract** — promote identity, needs, stats, customization, training state, and carefully scoped memory metadata into a stable plugin-readable host API.
2. **Inventory and equipment** — define shared items, quantities, equipment slots, ownership, and versioned persistence once.
3. **Battle vertical slice** — build one local sparring plugin using the shared Buddy and inventory contracts.
4. **Safe local trading** — validate explicit export/import receipts before introducing network identity, moderation, or marketplaces.
5. **Productivity and creator ports** — move useful journal, reminders, shortcuts, GitHub, and creator-tool behavior from donor apps and Prismtek Apps into plugins.
6. **Network features** — add parties, battles, or trading only after identity, persistence, confirmation, abuse controls, and recovery paths are proven.

Provider parity and model-backed Buddy Talk are now the first completed platform slice. The next work should make the Buddy profile safely reusable without exposing private renderer storage wholesale.
