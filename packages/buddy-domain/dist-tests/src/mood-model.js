function clamp01(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.min(1, Math.max(0, value));
}
/**
 * Donor `_label`. Evaluated top to bottom; the first satisfied rule wins, so
 * reordering these changes observable behaviour.
 */
export function moodLabel(valence, arousal, dominance) {
    if (valence < 0.3 && arousal > 0.65)
        return "distressed";
    if (valence < 0.35 && dominance < 0.4)
        return "sad";
    if (arousal > 0.72 && valence >= 0.55)
        return "excited";
    if (dominance > 0.7 && valence >= 0.5)
        return "confident";
    if (arousal < 0.28 && valence >= 0.5)
        return "calm";
    if (valence >= 0.65)
        return "happy";
    if (arousal > 0.58)
        return "alert";
    return "content";
}
/**
 * Donor `evaluate`. Mutates the state's mood and returns a copy, matching the
 * donor's contract. `nowUnix` is injected rather than read from the clock so the
 * result is deterministic and comparable against the Godot oracle.
 */
export function evaluateMood(state, nowUnix = 0) {
    state.ensureDefaults();
    const pressure = state.drives.urgencyAverage();
    const relationshipSupport = (state.relationshipValue("affection") + state.relationshipValue("trust")) * 0.5;
    const accomplishment = 1 - state.drives.pressure("accomplishment");
    const safety = 1 - state.drives.pressure("safety");
    const valence = clamp01((1 - pressure) * 0.55 + relationshipSupport * 0.25 + accomplishment * 0.2);
    const arousal = clamp01(state.drives.pressure("safety") * 0.45 +
        state.drives.pressure("hunger") * 0.2 +
        state.drives.pressure("curiosity") * 0.2 +
        state.personality.value("playfulness") * 0.15);
    const dominance = clamp01(safety * 0.35 + relationshipSupport * 0.2 + accomplishment * 0.25 + state.personality.value("bravery") * 0.2);
    const evaluated = {
        label: moodLabel(valence, arousal, dominance),
        valence,
        arousal,
        dominance,
        evaluated_unix: nowUnix,
    };
    state.mood = { ...evaluated };
    return evaluated;
}
