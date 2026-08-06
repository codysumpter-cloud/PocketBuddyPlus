# PixelLab animation reuse audit

This audit covers the exact uploaded archives guarded by filename and SHA-256 in `packages/pixel-asset-pipeline/recipes/`.

Legend: **reuse** means the source already communicates the semantic clearly; **blocked** means new art is required and was not fabricated or mislabeled.

## Balinese Cat — 60×60

| Reaction | Canonical semantic | Existing source reused | New generation required | Reason |
|---|---|---|---|---|
| idle | idle | `Idle` | No | Complete eight-direction neutral idle. |
| thinking | review | — | **Blocked** | Existing partial weight/head motions are not complete enough for a reliable review default. |
| working / editing / running | running | `Running` | No | Complete eight-direction run. |
| testing / waiting | waiting | `[state] sitting_down` | No | Complete eight-direction patient seated pose. |
| waving | waving | — | **Blocked** | No clear all-direction front-paw wave. |
| success / celebrating | jumping | — | **Blocked** | No suitable complete hop. |
| error | failed | `The_cat_lowers_its_head_toward_the_floor_tucking_i` | No | Complete brief droop/recovery communicates failure. |
| locomotion | running-left / running-right | `Running` west/east | No | Native directional frames are retained. |

Partial `Random_Animations`, `Full_Sprint`, weight-shift, head-tuck, and `Random` outputs remain in the catalogue with incomplete status where applicable.

## Shiba Inu — 56×56

| Reaction | Canonical semantic | Existing source reused | New generation required | Reason |
|---|---|---|---|---|
| idle | idle | `Idle` | No | Complete eight-direction neutral idle. |
| thinking | review | — | **Blocked** | No complete head-tilt/review motion. |
| working / editing / running | running | `Running` | No | Complete eight-direction run. |
| testing / waiting | waiting | `[state] sitting_down` | No | Complete eight-direction patient sitting pose. |
| waving | waving | — | **Blocked** | Bark is partial and is not a paw wave. |
| success / celebrating | jumping | — | **Blocked** | No suitable complete hop. |
| error | failed | `The_dog_lowers_its_head_toward_the_ground_moving_i` | No | Complete disappointed recovery pose. |
| locomotion | running-left / running-right | `Running` west/east | No | Native directional frames are retained. |

`Bark` remains visible but incomplete: main-state south/south-east/south-west plus sitting-state south. `Full_Sprint` remains south-only.

## Chunky Green T-Rex — 116×116

| Reaction | Canonical semantic | Existing source reused | New generation required | Reason |
|---|---|---|---|---|
| idle | idle | Adult `Idle` | No | Complete eight-direction idle. |
| thinking | review | — | **Blocked** | No complete curious review motion. |
| working / editing / running | running | Adult `Walking` temporarily | **Blocked for ideal art** | Walking is complete and safe, but a genuine faster gait is still desired. |
| testing / waiting | waiting | — | **Blocked** | Existing expressions do not read as waiting. |
| waving | waving | — | **Blocked** | No unmistakable tiny-arm wave. |
| success / celebrating | jumping | — | **Blocked** | No scale-stable hop exists. |
| error | failed | Adult wince/eyes-closed animation | No | Complete wince/recovery clearly communicates failure. |
| locomotion | running-left / running-right | Adult `Walking` west/east | No | Safe current locomotion fallback. |

The exact `-2` archive contains eight Adult `Walking/south` frames in both metadata and files. The importer supports 16-frame directions through a synthetic regression fixture but does not manufacture a double cycle here. Baby rotations and south-only Baby Walking are preserved; Adolescent rotations are preserved. Incomplete life-stage motions cannot be selected.

## Ani Isometric Human — 100×100

| Reaction | Canonical semantic | Existing source reused | New generation required | Reason |
|---|---|---|---|---|
| idle | idle | relaxed upright source animation | No | Complete eight-direction relaxed pose. |
| thinking | review | — | **Blocked** | No thoughtful review animation exists. |
| working / editing / running | running | `ani_run` | No | Complete eight-direction run. |
| testing / waiting | waiting | relaxed upright source animation | No | Appropriate patient idle until a richer weight shift is available. |
| waving | waving | — | **Blocked** | No friendly hand wave exists. |
| success / celebrating | jumping | `ani_jump` | No | Complete eight-direction jump. |
| error | failed | `ani_fall` | No | Brief fall/recovery; `ani_death` is deliberately not mapped to ordinary errors. |
| locomotion | running-left / running-right | `ani_run` west/east | No | Native directional frames are retained. |

`ani_walk/south/frame_004` is absent in the exact archive. The importer repairs the index deterministically from frame 003 and records both hashes and the repair method. The source `wearing_jeans_and_bl_copy` state is excluded because it is not Cody's corrected outfit. Shipping the Human package remains blocked until the torso-bounded `ani with clthes` v3 layers from Prismtek Apps are successfully materialized and hash-verified across all required frames.

## Generation status

No new PixelLab animation was generated in this change because `PIXELLAB_TOKEN` was unavailable. Generation receipts therefore identify the operation as a local PixelLab export import, record zero API cost, retain archive hashes, list blocked semantics, and never claim model output.
