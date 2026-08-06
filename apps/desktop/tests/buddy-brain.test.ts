import assert from "node:assert/strict";
import { createActor } from "xstate";
import {
  animationNodeId,
  compileOverrides,
  createBuddyBrainMachine,
  createDefaultLayout,
  normalizeLayout,
  parseAnimationNodeId,
  parseReactionNodeId,
  parseStoredLayout,
  reactionNodeId,
  resolveMappings,
  serializeLayout,
  updateMapping,
  type BuddyBrainAnimation,
  type BuddyBrainReaction,
} from "../src/renderer/src/buddy-brain-core.js";

const reactions: BuddyBrainReaction[] = [
  { id: "thinking", label: "Thinking", description: "Working through a problem", defaultAnimation: "idle" },
  { id: "success", label: "Success", description: "Task completed", defaultAnimation: "celebrating" },
];
const animations: BuddyBrainAnimation[] = [
  { id: "idle", label: "Idle", complete: true },
  { id: "celebrating", label: "Celebrating", complete: true },
  { id: "wave", label: "Wave", complete: false },
];

// Existing list-based mappings must become a complete graph without changing
// runtime behavior. Defaults fill missing overrides and only non-default edges
// compile back into persisted overrides.
{
  const mappings = resolveMappings(reactions, { thinking: "celebrating" });
  assert.deepEqual(mappings, { thinking: "celebrating", success: "celebrating" });
  assert.deepEqual(compileOverrides(reactions, mappings), { thinking: "celebrating" });

  const updated = updateMapping(mappings, "success", "idle");
  assert.deepEqual(updated, { thinking: "celebrating", success: "idle" });
  assert.deepEqual(compileOverrides(reactions, updated), { thinking: "celebrating", success: "idle" });
}

// Node IDs are a stable boundary between React Flow connections and the
// existing reaction/animation mapping contract.
{
  assert.equal(parseReactionNodeId(reactionNodeId("waiting")), "waiting");
  assert.equal(parseAnimationNodeId(animationNodeId("jump")), "jump");
  assert.equal(parseReactionNodeId(animationNodeId("jump")), null);
  assert.equal(parseAnimationNodeId(reactionNodeId("waiting")), null);
}

// Saved canvas positions migrate safely: valid coordinates survive, missing
// nodes receive defaults, and stale/unknown node IDs are discarded.
{
  const fallback = createDefaultLayout(reactions, animations);
  const validNodeIds = new Set(Object.keys(fallback.positions));
  const saved = {
    version: 1,
    positions: {
      [reactionNodeId("thinking")]: { x: 111, y: 222 },
      [animationNodeId("idle")]: { x: Number.NaN, y: 22 },
      "reaction:removed": { x: 999, y: 999 },
    },
  };
  const normalized = normalizeLayout(saved, fallback, validNodeIds);
  assert.deepEqual(normalized.positions[reactionNodeId("thinking")], { x: 111, y: 222 });
  assert.deepEqual(normalized.positions[animationNodeId("idle")], fallback.positions[animationNodeId("idle")]);
  assert.equal("reaction:removed" in normalized.positions, false);
  assert.deepEqual(
    parseStoredLayout(serializeLayout(normalized), fallback, validNodeIds),
    normalized,
  );
  assert.deepEqual(
    parseStoredLayout("not-json", fallback, validNodeIds),
    fallback,
  );
}

// The XState editor machine protects observable save feedback and keeps
// selection changes available while a mapping write is in flight.
{
  const actor = createActor(createBuddyBrainMachine("thinking"));
  actor.start();
  assert.equal(actor.getSnapshot().value, "ready");
  assert.equal(actor.getSnapshot().context.selectedReactionId, "thinking");

  actor.send({ type: "SAVE" });
  assert.equal(actor.getSnapshot().value, "saving");
  actor.send({ type: "SELECT", reactionId: "success" });
  assert.equal(actor.getSnapshot().context.selectedReactionId, "success");
  actor.send({ type: "SAVED" });
  assert.equal(actor.getSnapshot().value, "saved");

  actor.send({ type: "SAVE" });
  actor.send({ type: "FAILED", message: "disk full" });
  assert.equal(actor.getSnapshot().value, "error");
  assert.equal(actor.getSnapshot().context.error, "disk full");
  actor.send({ type: "DISMISS_ERROR" });
  assert.equal(actor.getSnapshot().value, "ready");
  assert.equal(actor.getSnapshot().context.error, null);
  actor.stop();
}

console.log("buddy-brain: all checks passed.");
