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
- AI provider routing and encrypted credentials
- plugin installation, permissions, quotas, lifecycle, and diagnostics
- events, commands, schedules, panels, notifications, audio, voice, and safe networking
- shared save/version/migration contracts
- future inventory, equipment, economy, relationship, party, and multiplayer primitives

A host capability should be added only when multiple plugins need a consistent, durable contract or when the capability crosses a security boundary.

## Plugin-owned experiences

Plugins can build experiences such as:

- Buddy chat personalities and specialist assistants
- battles, training, abilities, and progression modes
- trading, gifting, shops, collections, and crafting
- games, challenges, parties, and multiplayer encounters
- journal, reminders, focus, habits, and life-assistant workflows
- GitHub and developer-tool integrations
- Prism Pixel + Rig Studio, Prismcade Creator, and future creator tools
- community features and social spaces

Plugins should use shared host contracts rather than inventing private identity, inventory, currency, or animation systems that cannot interoperate.

## AI architecture

The existing host AI gateway remains the single credential boundary for plugin AI calls.

Supported provider kinds:

- Anthropic
- OpenAI
- NVIDIA NIM
- Ollama

Plugins request the `ai` permission and call the host gateway. They do not receive the user's API key. The provider, model, and key are selected once in Pocket Buddy+ settings and can serve multiple plugins.

The Buddy Center's current conversation UI and local Buddy state are product foundations. First-class model-backed Buddy chat should consume the same gateway rather than introducing a second provider implementation.

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

1. Finish model-provider support and connect Buddy chat to the host AI gateway.
2. Promote Buddy identity/profile/state into a stable plugin-readable contract.
3. Add shared inventory, equipment, and item-definition contracts.
4. Build one vertical-slice game plugin using those contracts.
5. Add safe local trading first; add networked trading only after identity, persistence, confirmation, and abuse controls are proven.
6. Port useful journal, reminders, shortcuts, GitHub, and creator-tool behavior from donor apps and Prismtek Apps.

This sequence creates reusable foundations while still shipping visible Buddy experiences early.
