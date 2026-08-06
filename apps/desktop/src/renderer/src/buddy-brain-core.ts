import { assign, createMachine } from "xstate";

export const BUDDY_BRAIN_LAYOUT_VERSION = 1 as const;
export const BUDDY_BRAIN_STORAGE_PREFIX = "pocket-buddy-plus:buddy-brain-layout:v1";

export type BuddyBrainPoint = { x: number; y: number };

export type BuddyBrainReaction = {
  id: string;
  label: string;
  description?: string;
  defaultAnimation: string;
};

export type BuddyBrainAnimation = {
  id: string;
  label: string;
  complete: boolean;
};

export type BuddyBrainLayout = {
  version: typeof BUDDY_BRAIN_LAYOUT_VERSION;
  positions: Record<string, BuddyBrainPoint>;
};

export type BuddyBrainMapping = Record<string, string>;

export type BuddyBrainMachineContext = {
  selectedReactionId: string | null;
  error: string | null;
};

export type BuddyBrainMachineEvent =
  | { type: "SELECT"; reactionId: string | null }
  | { type: "SAVE" }
  | { type: "SAVED" }
  | { type: "FAILED"; message: string }
  | { type: "DISMISS_ERROR" };

export function reactionNodeId(reactionId: string): string {
  return `reaction:${reactionId}`;
}

export function animationNodeId(animationId: string): string {
  return `animation:${animationId}`;
}

export function parseReactionNodeId(nodeId: string | null | undefined): string | null {
  return nodeId?.startsWith("reaction:") ? nodeId.slice("reaction:".length) : null;
}

export function parseAnimationNodeId(nodeId: string | null | undefined): string | null {
  return nodeId?.startsWith("animation:") ? nodeId.slice("animation:".length) : null;
}

export function layoutStorageKey(petId: string): string {
  return `${BUDDY_BRAIN_STORAGE_PREFIX}:${encodeURIComponent(petId)}`;
}

export function resolveMappings(
  reactions: readonly BuddyBrainReaction[],
  overrides: Readonly<BuddyBrainMapping> | null | undefined,
): BuddyBrainMapping {
  const resolved: BuddyBrainMapping = {};
  for (const reaction of reactions) {
    resolved[reaction.id] = overrides?.[reaction.id] || reaction.defaultAnimation;
  }
  return resolved;
}

export function compileOverrides(
  reactions: readonly BuddyBrainReaction[],
  mappings: Readonly<BuddyBrainMapping>,
): BuddyBrainMapping {
  const overrides: BuddyBrainMapping = {};
  for (const reaction of reactions) {
    const selectedAnimation = mappings[reaction.id];
    if (selectedAnimation && selectedAnimation !== reaction.defaultAnimation) {
      overrides[reaction.id] = selectedAnimation;
    }
  }
  return overrides;
}

export function updateMapping(
  mappings: Readonly<BuddyBrainMapping>,
  reactionId: string,
  animationId: string,
): BuddyBrainMapping {
  return { ...mappings, [reactionId]: animationId };
}

export function createDefaultLayout(
  reactions: readonly BuddyBrainReaction[],
  animations: readonly BuddyBrainAnimation[],
): BuddyBrainLayout {
  const positions: Record<string, BuddyBrainPoint> = {};
  const reactionGap = 104;
  const animationGap = 92;

  reactions.forEach((reaction, index) => {
    positions[reactionNodeId(reaction.id)] = { x: 48, y: 56 + index * reactionGap };
  });
  animations.forEach((animation, index) => {
    positions[animationNodeId(animation.id)] = { x: 540, y: 56 + index * animationGap };
  });

  return { version: BUDDY_BRAIN_LAYOUT_VERSION, positions };
}

function isFinitePoint(value: unknown): value is BuddyBrainPoint {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BuddyBrainPoint>;
  return Number.isFinite(candidate.x) && Number.isFinite(candidate.y);
}

export function normalizeLayout(
  value: unknown,
  fallback: BuddyBrainLayout,
  validNodeIds: ReadonlySet<string>,
): BuddyBrainLayout {
  const candidate = value && typeof value === "object" ? value as Partial<BuddyBrainLayout> : null;
  const candidatePositions = candidate?.version === BUDDY_BRAIN_LAYOUT_VERSION && candidate.positions && typeof candidate.positions === "object"
    ? candidate.positions
    : {};
  const positions: Record<string, BuddyBrainPoint> = {};

  for (const nodeId of validNodeIds) {
    const saved = (candidatePositions as Record<string, unknown>)[nodeId];
    const fallbackPoint = fallback.positions[nodeId];
    if (isFinitePoint(saved)) positions[nodeId] = { x: saved.x, y: saved.y };
    else if (fallbackPoint) positions[nodeId] = { ...fallbackPoint };
  }

  return { version: BUDDY_BRAIN_LAYOUT_VERSION, positions };
}

export function parseStoredLayout(
  serialized: string | null,
  fallback: BuddyBrainLayout,
  validNodeIds: ReadonlySet<string>,
): BuddyBrainLayout {
  if (!serialized) return normalizeLayout(null, fallback, validNodeIds);
  try {
    return normalizeLayout(JSON.parse(serialized), fallback, validNodeIds);
  } catch {
    return normalizeLayout(null, fallback, validNodeIds);
  }
}

export function serializeLayout(layout: BuddyBrainLayout): string {
  return JSON.stringify(layout);
}

export function createBuddyBrainMachine(initialReactionId: string | null = null) {
  return createMachine({
    types: {} as {
      context: BuddyBrainMachineContext;
      events: BuddyBrainMachineEvent;
    },
    id: "buddyBrainEditor",
    initial: "ready",
    context: {
      selectedReactionId: initialReactionId,
      error: null,
    },
    on: {
      SELECT: {
        actions: assign({
          selectedReactionId: ({ event }) => event.reactionId,
        }),
      },
    },
    states: {
      ready: {
        on: {
          SAVE: "saving",
        },
      },
      saving: {
        on: {
          SAVED: "saved",
          FAILED: {
            target: "error",
            actions: assign({ error: ({ event }) => event.message }),
          },
        },
      },
      saved: {
        entry: assign({ error: null }),
        on: {
          SAVE: "saving",
        },
      },
      error: {
        on: {
          SAVE: {
            target: "saving",
            actions: assign({ error: null }),
          },
          DISMISS_ERROR: {
            target: "ready",
            actions: assign({ error: null }),
          },
        },
      },
    },
  });
}
