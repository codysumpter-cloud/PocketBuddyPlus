/**
 * Parity port of BuddyMoodModel.
 *
 * Donor: prismtek-apps/packages/godot/prismtek-buddy-core/addons/
 *        prismtek_buddy_core/creature/buddy_mood_model.gd
 * Licence: Prismtek Source Available (first-party; reuse authorised by the owner).
 *
 * Compact emotional state derived from drives, personality and relationships.
 * Every weight and every label threshold below is transcribed from the donor;
 * the label rules are order-sensitive (first match wins) and that order is part
 * of the behaviour, not a stylistic choice.
 */
import type { BuddyCreatureState, BuddyMood } from "./creature-state.js";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Donor `_label`. Evaluated top to bottom; the first satisfied rule wins, so
 * reordering these changes observable behaviour.
 */
export function moodLabel(valence: number, arousal: number, dominance: number): string {
  if (valence < 0.3 && arousal > 0.65) return "distressed";
  if (valence < 0.35 && dominance < 0.4) return "sad";
  if (arousal > 0.72 && valence >= 0.55) return "excited";
  if (dominance > 0.7 && valence >= 0.5) return "confident";
  if (arousal < 0.28 && valence >= 0.5) return "calm";
  if (valence >= 0.65) return "happy";
  if (arousal > 0.58) return "alert";
  return "content";
}

export interface MoodEvaluation extends BuddyMood {
  readonly evaluated_unix: number;
}

/**
 * Donor `evaluate`. Mutates the state's mood and returns a copy, matching the
 * donor's contract. `nowUnix` is injected rather than read from the clock so the
 * result is deterministic and comparable against the Godot oracle.
 */
export function evaluateMood(state: BuddyCreatureState, nowUnix = 0): MoodEvaluation {
  state.ensureDefaults();

  const pressure = state.drives.urgencyAverage();
  const relationshipSupport = (state.relationshipValue("affection") + state.relationshipValue("trust")) * 0.5;
  const accomplishment = 1 - state.drives.pressure("accomplishment");
  const safety = 1 - state.drives.pressure("safety");

  const valence = clamp01((1 - pressure) * 0.55 + relationshipSupport * 0.25 + accomplishment * 0.2);
  const arousal = clamp01(
    state.drives.pressure("safety") * 0.45 +
      state.drives.pressure("hunger") * 0.2 +
      state.drives.pressure("curiosity") * 0.2 +
      state.personality.value("playfulness") * 0.15,
  );
  const dominance = clamp01(
    safety * 0.35 + relationshipSupport * 0.2 + accomplishment * 0.25 + state.personality.value("bravery") * 0.2,
  );

  const evaluated: MoodEvaluation = {
    label: moodLabel(valence, arousal, dominance),
    valence,
    arousal,
    dominance,
    evaluated_unix: nowUnix,
  };
  state.mood = { ...evaluated };
  return evaluated;
}
