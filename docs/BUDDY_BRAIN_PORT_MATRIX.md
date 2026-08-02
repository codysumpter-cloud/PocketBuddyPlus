# Buddy Brain port matrix

Parity port of the existing Pocket Buddy / Prismtek Buddies creature brain into
native TypeScript. **This is a migration, not a redesign.** Where a donor system
already has implemented behaviour, the port reproduces its schema, defaults,
formulas, thresholds and event meaning; it does not invent replacements.

A row is only `ported` when donor behaviour is reproduced **and** covered by a
parity test asserting donor-derived values. A matching TypeScript type name is
explicitly *not* sufficient.

## Donors and provenance

| Donor | Path | Licence | Use |
|---|---|---|---|
| Prismtek Buddy Core | `prismtek-apps/packages/godot/prismtek-buddy-core/` | Prismtek Source Available v1.0 | **Primary donor.** First-party; reuse and adaptation authorised by the owner. |
| Buddy Brain | `codysumpter-cloud/buddy-brain` | Prismtek Source Available | Identity/soul policy, council roles, reflection. Extends the creature brain. |
| Buddy Agent | `codysumpter-cloud/buddy-agent` | Prismtek Source Available | Providers, guarded tools, approvals, receipts. |
| KnowledgeVault | `codysumpter-cloud/knowledge-vault` | Prismtek Source Available | Provenance, event history, graph memory adapters. |
| Pigeon Ascent | `Escada-Games/pigeonAscent` | **MIT** © 2020 Guilherme Rodrigues Ribeiro, Rafael Pimentel da Silva | Battle/progression formulas. Adaptation permitted **with notice retained**. |
| Pocket Bird | `IdreesInc/Pocket-Bird` (via fork) | **MPL-2.0** | **Behaviour and design reference only.** No source copied, translated or adapted. |

The Godot Pocket Buddy application and its live saves are **read-only references**
and are never modified.

### Pocket Bird boundary

MPL-2.0 is file-level copyleft: a file containing covered code stays MPL and must
carry its notice. To keep Pocket Buddy+ unencumbered, **no Pocket Bird source,
structure, comments, function bodies or assets are copied**. Observable behaviour
(ambient movement feel, petting, menu flow, interaction timing) may be studied and
reimplemented independently. The donor's own `THIRD_PARTY_NOTICES.md` already
establishes this same boundary.

## Status legend

`ported` behaviour reproduced + parity tests · `partial` some behaviour ported ·
`inventoried` donor read, contract captured, not yet ported · `pending` not started

## Matrix

| Feature | Donor file | Target | Status | Notes |
|---|---|---|---|---|
| Drive set (11 unmet-need pressures) | `creature/buddy_drive_set.gd` | `packages/buddy-domain/src/drive-set.ts` | **ported** | Keys, `DEFAULT_PRESSURES`, `DEFAULT_DRIFT_PER_SECOND` transcribed verbatim. Sign convention preserved (0 satisfied → 1 urgent; `energy` = *needs* energy). `apply_relief` positive-satisfies, `most_urgent` tie-break by name asc, `from_dict` legacy fallback, negative-elapsed floor. 12 parity tests. |
| Personality traits | `creature/buddy_personality_profile.gd` | `packages/buddy-domain/src/personality.ts` | **ported** | 11 traits + `DEFAULT_TRAITS` verbatim. Unknown trait reads as neutral `0.5` (donor `value`), unknown writes ignored (donor `set_value`). |
| Creature identity + durable state | `creature/buddy_creature_state.gd` | `packages/buddy-domain/src/creature-state.ts` | **inventoried** | Schema `prismtek-buddy-creature-v1`. Fields captured: `buddy_id`, `display_name`, `created_unix`, `revision`, `current_intent`, `current_goal`, `evolution_stage`, `DEFAULT_RELATIONSHIP` (affection .50 / trust .50 / familiarity .10 / respect .40), `DEFAULT_STATS` (level, experience, skill_points, rerolls, health 10, max_health 10, stamina 10, max_stamina 10, strength 1, defense 1, speed 1, focus 1), `learned_associations`, `action_counts`, `cooldown_until_unix`, `last_actions`, `working_memory`, `episodic_memory_refs`, `active_tasks`, `inventory`, `customization`, `flags`, `mood` (label/valence/arousal/dominance). |
| Life runtime / tick | `life/buddy_life_runtime.gd` | `packages/buddy-runtime` | **inventoried** | Deterministic elapsed-time advancement; must not depend on frame rate. |
| Biology substrate | `life/buddy_biology_substrate.gd` | `packages/buddy-runtime` | **inventoried** | Largest donor unit (~22 KB). Organs, homeostasis. |
| Biology brain | `life/buddy_biology_brain.gd` | `packages/buddy-runtime` | **inventoried** | |
| Cognition stack | `life/buddy_cognition_stack.gd` | `packages/buddy-runtime` | **inventoried** | |
| Cognition planner | `life/buddy_cognition_planner.gd` | `packages/buddy-runtime` | **inventoried** | Goal/intent selection. |
| Causal memory | `life/buddy_cognition_causal_memory.gd` | `packages/buddy-memory` | **inventoried** | |
| World model | `life/buddy_cognition_world_model.gd` | `packages/buddy-runtime` | **inventoried** | |
| Genome / development | `life/buddy_genome_development.gd` | `packages/buddy-domain` | **inventoried** | Age-sensitive behaviour. |
| Society: population / culture / ecosystem | `life/buddy_society_*.gd` | `packages/buddy-runtime` | **pending** | Multi-Buddy social systems. |
| Progression model | `progression/buddy_progression_model.gd` | `packages/buddy-domain` | **inventoried** | **Contains MIT Pigeon Ascent formulas** (health/stamina derived from allocated stats, defense & speed weighted double, defense cap, refundable rerolls, tiered evolution). Notice must travel with any port. |
| World runtime / state / script VM | `world/prism_*.gd` | `packages/buddy-runtime` | **pending** | |
| Parity arena | `life/buddy_life_parity_arena.gd` | golden harness | **inventoried** | Donor's own cross-run parity fixture generator — the natural basis for the golden harness. |
| Creature controller | `creature/buddy_creature_controller.gd` | `packages/buddy-runtime` | **pending** | ~22 KB. |
| Save / load / migration | `creature/buddy_creature_state.gd` + save paths | `packages/buddy-storage` | **pending** | Read-only importer only; never mutates Godot saves. |
| Main-process authority | n/a (new) | `apps/desktop/src/buddy/` | **pending** | Commands in, snapshots out. |

## Known deviations

| Deviation | Reason |
|---|---|
| Drive set is the donor's 11 keys (incl. `accomplishment`, `focus`), not the 14 listed in the PR 3 brief (`health`, `stress`, `confidence`, `trust`). | Parity follows the donor. `health`/`stamina` live in `DEFAULT_STATS`; trust/affection are **relationship** fields, not drives. Adding drives the donor lacks would break parity. Revisit as a deliberate post-parity extension. |
| Drift is not clamped to `[0,1]`; only pressures are. | Donor `ensure_defaults` clamps pressures only — `safety` legitimately drifts negative (self-recovering). |

## Remaining gaps

- Golden cross-runtime harness (headless Godot → JSON traces → TS comparison) not yet built; current tests assert donor-*derived constants and semantics*, not a live Godot diff.
- Creature state, life runtime, biology, cognition, memory, relationships, world: contracts captured, ports not yet written.
- No main-process ownership yet; the renderer-local Buddy state in `product-ui.ts` is still the live system and **must not be removed until the port replaces it**, to avoid two competing owners.
