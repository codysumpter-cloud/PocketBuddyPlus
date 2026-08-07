import { BuddyCreatureState } from "../creature-state.js";
import { evaluateMood } from "../mood-model.js";
import { applyHomeItemAction, homeAssetDefinition, type HomeItemAction } from "./content-catalog.js";
import { footprintCells, isCellInsideRoom } from "./placement.js";
import type { GridCell, HomeRoomDocument, HomeRoomItem } from "./room-document.js";

export const HOME_PLAY_SCHEMA = "pocket-buddy-home-play-v1" as const;
export const HOME_ACTORS = ["player", "buddy"] as const;
export const HOME_DIRECTIONS = ["north", "east", "south", "west"] as const;

export type HomeActorId = (typeof HOME_ACTORS)[number];
export type HomeDirection = (typeof HOME_DIRECTIONS)[number];

export interface HomeActorPose {
  readonly cell: GridCell;
  readonly facing: HomeDirection;
}

export interface HomePlayState {
  readonly schema: typeof HOME_PLAY_SCHEMA;
  readonly revision: number;
  readonly player: HomeActorPose;
  readonly buddy: HomeActorPose;
  readonly creature: Readonly<Record<string, unknown>>;
  readonly thought: string;
  readonly selectedItemId: string | null;
  readonly lastAdvancedUnix: number;
}

export interface HomeSessionResult {
  readonly room: HomeRoomDocument;
  readonly play: HomePlayState;
}

const DIRECTION_DELTAS: Readonly<Record<HomeDirection, GridCell>> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNonNegative(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number`);
  }
  return value;
}

function integerNonNegative(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value as number;
}

function parseCell(value: unknown, room: HomeRoomDocument, label: string): GridCell {
  if (!isRecord(value) || !Number.isInteger(value.x) || !Number.isInteger(value.y)) {
    throw new Error(`${label} must be an integer cell`);
  }
  const cell = { x: value.x as number, y: value.y as number };
  if (!isCellInsideRoom(room, cell)) throw new Error(`${label} is outside the room`);
  return cell;
}

function parsePose(value: unknown, room: HomeRoomDocument, label: string): HomeActorPose {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  if (typeof value.facing !== "string" || !HOME_DIRECTIONS.includes(value.facing as HomeDirection)) {
    throw new Error(`${label}.facing is invalid`);
  }
  return { cell: parseCell(value.cell, room, `${label}.cell`), facing: value.facing as HomeDirection };
}

function actorAt(state: HomePlayState, actor: HomeActorId): HomeActorPose {
  return actor === "player" ? state.player : state.buddy;
}

function withActor(state: HomePlayState, actor: HomeActorId, pose: HomeActorPose): HomePlayState {
  return {
    ...state,
    revision: state.revision + 1,
    ...(actor === "player" ? { player: pose } : { buddy: pose }),
  };
}

function sameCell(a: GridCell, b: GridCell): boolean {
  return a.x === b.x && a.y === b.y;
}

function manhattan(a: GridCell, b: GridCell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function blocksMovement(item: HomeRoomItem): boolean {
  return homeAssetDefinition(item.assetId)?.blocksMovement ?? true;
}

export function isHomeCellBlocked(
  room: HomeRoomDocument,
  cell: GridCell,
  ignoreItemId: string | null = null,
): boolean {
  return room.items.some((item) => (
    item.id !== ignoreItemId &&
    item.placement.surface === "floor" &&
    blocksMovement(item) &&
    footprintCells(item).some((occupied) => sameCell(occupied, cell))
  ));
}

function isActorDestinationOpen(
  room: HomeRoomDocument,
  state: HomePlayState,
  actor: HomeActorId,
  cell: GridCell,
): boolean {
  if (!isCellInsideRoom(room, cell) || isHomeCellBlocked(room, cell)) return false;
  const other = actor === "player" ? state.buddy : state.player;
  return !sameCell(other.cell, cell);
}

export function createHomePlayState(room: HomeRoomDocument, nowUnix = 0): HomePlayState {
  const timestamp = finiteNonNegative(nowUnix, "nowUnix");
  const creature = new BuddyCreatureState(timestamp, "buddy");
  evaluateMood(creature, timestamp);

  const playerCell = firstOpenCell(room, [
    { x: 0, y: room.height - 1 },
    { x: 0, y: 0 },
  ]);
  const buddyCell = firstOpenCell(room, [
    { x: Math.floor(room.width / 2), y: Math.floor(room.height / 2) },
    { x: room.width - 1, y: room.height - 1 },
  ], playerCell);

  return {
    schema: HOME_PLAY_SCHEMA,
    revision: 0,
    player: { cell: playerCell, facing: "north" },
    buddy: { cell: buddyCell, facing: "south" },
    creature: creature.toData(),
    thought: "Home smells new. I should investigate everything.",
    selectedItemId: null,
    lastAdvancedUnix: timestamp,
  };
}

export function parseHomePlayState(
  value: unknown,
  room: HomeRoomDocument,
  nowUnix = 0,
): HomePlayState {
  if (!isRecord(value)) throw new Error("Home play state must be an object");
  if (value.schema !== HOME_PLAY_SCHEMA) throw new Error(`unsupported Home play schema: ${String(value.schema)}`);
  const selectedItemId = value.selectedItemId;
  if (selectedItemId !== null && typeof selectedItemId !== "string") {
    throw new Error("selectedItemId must be a string or null");
  }
  const thought = typeof value.thought === "string" ? value.thought.slice(0, 280) : "";
  const creature = BuddyCreatureState.fromData(value.creature, finiteNonNegative(nowUnix, "nowUnix"));
  return {
    schema: HOME_PLAY_SCHEMA,
    revision: integerNonNegative(value.revision, "revision"),
    player: parsePose(value.player, room, "player"),
    buddy: parsePose(value.buddy, room, "buddy"),
    creature: creature.toData(),
    thought,
    selectedItemId: selectedItemId !== null && room.items.some((item) => item.id === selectedItemId)
      ? selectedItemId
      : null,
    lastAdvancedUnix: finiteNonNegative(value.lastAdvancedUnix, "lastAdvancedUnix"),
  };
}

export function moveHomeActor(
  room: HomeRoomDocument,
  state: HomePlayState,
  actor: HomeActorId,
  direction: HomeDirection,
): HomePlayState {
  const current = actorAt(state, actor);
  const delta = DIRECTION_DELTAS[direction];
  const target = { x: current.cell.x + delta.x, y: current.cell.y + delta.y };
  const facingPose = { ...current, facing: direction };
  if (!isActorDestinationOpen(room, state, actor, target)) {
    return current.facing === direction ? state : withActor(state, actor, facingPose);
  }
  return withActor(state, actor, { cell: target, facing: direction });
}

export function selectHomeItem(state: HomePlayState, itemId: string | null): HomePlayState {
  if (state.selectedItemId === itemId) return state;
  return { ...state, revision: state.revision + 1, selectedItemId: itemId };
}

export function petHomeBuddy(state: HomePlayState, nowUnix = state.lastAdvancedUnix): HomePlayState {
  const timestamp = Math.max(finiteNonNegative(nowUnix, "nowUnix"), state.lastAdvancedUnix);
  const creature = BuddyCreatureState.fromData(state.creature, timestamp);
  creature.drives.applyRelief({ social: 0.18, affection: 0.2, comfort: 0.08 });
  creature.adjustRelationship("affection", 0.025);
  creature.adjustRelationship("trust", 0.008);
  creature.rememberAction("home.pet");
  evaluateMood(creature, timestamp);
  return {
    ...state,
    revision: state.revision + 1,
    creature: creature.toData(),
    thought: "Yes. More head pats. This is important work.",
    lastAdvancedUnix: timestamp,
  };
}

export function interactHomeItem(
  room: HomeRoomDocument,
  state: HomePlayState,
  itemId: string,
  action: HomeItemAction,
  nowUnix = state.lastAdvancedUnix,
): HomeSessionResult {
  const timestamp = Math.max(finiteNonNegative(nowUnix, "nowUnix"), state.lastAdvancedUnix);
  const outcome = applyHomeItemAction(room, itemId, action);
  const creature = BuddyCreatureState.fromData(state.creature, timestamp);
  creature.drives.applyRelief(outcome.relief);
  if (outcome.affectionDelta !== 0) creature.adjustRelationship("affection", outcome.affectionDelta);
  creature.rememberAction(`home.${action}`);
  evaluateMood(creature, timestamp);

  const interactionCell = nearestInteractionCell(outcome.room, itemId, state.buddy.cell, state.player.cell);
  return {
    room: outcome.room,
    play: {
      ...state,
      revision: state.revision + 1,
      buddy: interactionCell ? { cell: interactionCell, facing: facingToward(interactionCell, itemAnchor(outcome.room, itemId)) } : state.buddy,
      creature: creature.toData(),
      thought: outcome.thought,
      selectedItemId: itemId,
      lastAdvancedUnix: timestamp,
    },
  };
}

/**
 * Advances needs and one deterministic Buddy decision. The caller controls the
 * clock, so animation frame rate and hidden-window throttling cannot change the
 * simulation result.
 */
export function advanceHomeSession(
  room: HomeRoomDocument,
  state: HomePlayState,
  nowUnix: number,
): HomeSessionResult {
  const timestamp = Math.max(finiteNonNegative(nowUnix, "nowUnix"), state.lastAdvancedUnix);
  const elapsed = timestamp - state.lastAdvancedUnix;
  if (elapsed <= 0) return { room, play: state };

  const creature = BuddyCreatureState.fromData(state.creature, timestamp);
  creature.drives.applyDrift(elapsed);
  evaluateMood(creature, timestamp);

  let nextRoom = room;
  let nextBuddy = state.buddy;
  let thought = thoughtForCreature(creature);
  const urgent = creature.drives.mostUrgent(1)[0];
  const target = preferredTarget(room, state, urgent?.drive ?? "curiosity");

  if (target?.item && target.action && urgent && urgent.pressure >= 0.45) {
    const interactionCell = nearestInteractionCell(room, target.item.id, state.buddy.cell, state.player.cell);
    if (interactionCell && sameCell(interactionCell, state.buddy.cell)) {
      const outcome = applyHomeItemAction(room, target.item.id, target.action);
      nextRoom = outcome.room;
      creature.drives.applyRelief(outcome.relief);
      if (outcome.affectionDelta !== 0) creature.adjustRelationship("affection", outcome.affectionDelta);
      creature.rememberAction(`home.auto.${target.action}`);
      evaluateMood(creature, timestamp);
      thought = outcome.thought;
    } else if (interactionCell) {
      nextBuddy = stepToward(room, state, interactionCell);
      thought = `I am heading to the ${homeAssetDefinition(target.item.assetId)?.label ?? "thing"}.`;
    }
  } else if (target?.cell) {
    nextBuddy = stepToward(room, state, target.cell);
  } else {
    nextBuddy = deterministicWander(room, state, timestamp);
  }

  return {
    room: nextRoom,
    play: {
      ...state,
      revision: state.revision + 1,
      buddy: nextBuddy,
      creature: creature.toData(),
      thought,
      lastAdvancedUnix: timestamp,
    },
  };
}

export interface HomeBuddyPresenceIntent {
  readonly displayName: string;
  readonly mood: string;
  readonly activity: string;
  readonly dominantNeed: "hunger" | "energy" | "social" | "play" | "comfort" | "cleanliness" | string;
}

export interface HomePresenceAdvanceOptions {
  readonly autonomousPlayer?: boolean;
}

/**
 * Advance only the Home-world poses using the host-owned Buddy profile as the
 * decision signal. The legacy `creature` payload is deliberately preserved
 * byte-for-byte: Home is a presentation/simulation surface, not a second Buddy
 * lifecycle owner.
 */
export function advanceHomePresenceSession(
  room: HomeRoomDocument,
  state: HomePlayState,
  presence: HomeBuddyPresenceIntent,
  nowUnix: number,
  options: HomePresenceAdvanceOptions = {},
): HomeSessionResult {
  const timestamp = Math.max(finiteNonNegative(nowUnix, "nowUnix"), state.lastAdvancedUnix);
  if (timestamp <= state.lastAdvancedUnix) return { room, play: state };

  const target = preferredPresenceTarget(room, state, presence);
  let buddy = state.buddy;
  let player = state.player;
  let thought = presenceThought(presence);

  if (target?.item) {
    const interactionCell = nearestInteractionCell(room, target.item.id, state.buddy.cell, state.player.cell);
    if (interactionCell && sameCell(interactionCell, state.buddy.cell)) {
      thought = `${presence.displayName} is hanging out by the ${homeAssetDefinition(target.item.assetId)?.label ?? "furniture"}.`;
    } else if (interactionCell) {
      buddy = stepToward(room, state, interactionCell);
      thought = `${presence.displayName} is heading to the ${homeAssetDefinition(target.item.assetId)?.label ?? "furniture"}.`;
    }
  } else if (target?.cell) {
    buddy = stepToward(room, state, target.cell);
  } else {
    buddy = deterministicWander(room, state, timestamp);
  }

  if (options.autonomousPlayer) {
    const nextState = { ...state, buddy, player };
    player = autonomousPlayerStep(room, nextState, timestamp);
  }

  return {
    room,
    play: {
      ...state,
      revision: state.revision + 1,
      buddy,
      player,
      creature: state.creature,
      thought,
      lastAdvancedUnix: timestamp,
    },
  };
}

function preferredPresenceTarget(
  room: HomeRoomDocument,
  state: HomePlayState,
  presence: HomeBuddyPresenceIntent,
): { item?: HomeRoomItem; cell?: GridCell } | null {
  const needAction: Readonly<Record<string, HomeItemAction | undefined>> = {
    hunger: "feed",
    energy: "rest",
    play: "play",
    comfort: "rest",
  };
  const activityAction: Readonly<Record<string, HomeItemAction | undefined>> = {
    eating: "feed",
    sleeping: "rest",
    playing: "play",
  };
  const action = activityAction[presence.activity] ?? needAction[presence.dominantNeed];
  if (action) {
    const item = room.items
      .filter((candidate) => homeAssetDefinition(candidate.assetId)?.actions.includes(action))
      .sort((a, b) => manhattan(state.buddy.cell, a.placement.anchor) - manhattan(state.buddy.cell, b.placement.anchor))[0];
    if (item) return { item };
  }
  if (presence.dominantNeed === "social" || presence.activity === "socializing") return { cell: state.player.cell };
  return null;
}

function autonomousPlayerStep(room: HomeRoomDocument, state: HomePlayState, nowUnix: number): HomeActorPose {
  if (manhattan(state.player.cell, state.buddy.cell) > 2) {
    const directions: HomeDirection[] = [];
    if (state.buddy.cell.x > state.player.cell.x) directions.push("east");
    if (state.buddy.cell.x < state.player.cell.x) directions.push("west");
    if (state.buddy.cell.y > state.player.cell.y) directions.push("south");
    if (state.buddy.cell.y < state.player.cell.y) directions.push("north");
    for (const direction of directions) {
      const moved = moveHomeActor(room, state, "player", direction);
      if (!sameCell(moved.player.cell, state.player.cell)) return moved.player;
    }
  }
  // Do not jitter every second when the two actors are already together.
  if ((state.revision + Math.floor(nowUnix)) % 4 !== 0) return state.player;
  const start = (state.revision + Math.floor(nowUnix / 4)) % HOME_DIRECTIONS.length;
  for (let offset = 0; offset < HOME_DIRECTIONS.length; offset += 1) {
    const direction = HOME_DIRECTIONS[(start + offset) % HOME_DIRECTIONS.length];
    const moved = moveHomeActor(room, state, "player", direction);
    if (!sameCell(moved.player.cell, state.player.cell)) return moved.player;
  }
  return state.player;
}

function presenceThought(presence: HomeBuddyPresenceIntent): string {
  const activity = presence.activity === "idle" ? "taking it easy" : presence.activity.replace(/ing$/u, "ing");
  return `${presence.displayName} is ${activity}. ${presence.dominantNeed} is the strongest need right now.`;
}

function preferredTarget(
  room: HomeRoomDocument,
  state: HomePlayState,
  drive: string,
): { item?: HomeRoomItem; action?: HomeItemAction; cell?: GridCell } | null {
  const actionByDrive: Readonly<Record<string, HomeItemAction | undefined>> = {
    hunger: "feed",
    energy: "rest",
    comfort: "rest",
    boredom: "play",
    accomplishment: "water",
  };
  const action = actionByDrive[drive];
  if (action) {
    const items = room.items
      .filter((item) => homeAssetDefinition(item.assetId)?.actions.includes(action))
      .sort((a, b) => manhattan(state.buddy.cell, a.placement.anchor) - manhattan(state.buddy.cell, b.placement.anchor));
    if (items[0]) return { item: items[0], action };
  }
  if (drive === "social" || drive === "affection" || drive === "safety") {
    return { cell: state.player.cell };
  }
  return null;
}

function stepToward(room: HomeRoomDocument, state: HomePlayState, target: GridCell): HomeActorPose {
  const current = state.buddy;
  const candidates: HomeDirection[] = [];
  if (target.x > current.cell.x) candidates.push("east");
  if (target.x < current.cell.x) candidates.push("west");
  if (target.y > current.cell.y) candidates.push("south");
  if (target.y < current.cell.y) candidates.push("north");
  for (const direction of candidates) {
    const moved = moveHomeActor(room, state, "buddy", direction);
    if (!sameCell(moved.buddy.cell, current.cell)) return moved.buddy;
  }
  return current;
}

function deterministicWander(room: HomeRoomDocument, state: HomePlayState, nowUnix: number): HomeActorPose {
  const start = (state.revision + Math.floor(nowUnix)) % HOME_DIRECTIONS.length;
  for (let offset = 0; offset < HOME_DIRECTIONS.length; offset += 1) {
    const direction = HOME_DIRECTIONS[(start + offset) % HOME_DIRECTIONS.length];
    const moved = moveHomeActor(room, state, "buddy", direction);
    if (!sameCell(moved.buddy.cell, state.buddy.cell)) return moved.buddy;
  }
  return state.buddy;
}

function nearestInteractionCell(
  room: HomeRoomDocument,
  itemId: string,
  from: GridCell,
  reserved: GridCell,
): GridCell | null {
  const item = room.items.find((candidate) => candidate.id === itemId);
  if (!item) return null;
  const candidates = new Map<string, GridCell>();
  for (const cell of footprintCells(item)) {
    for (const delta of Object.values(DIRECTION_DELTAS)) {
      const candidate = { x: cell.x + delta.x, y: cell.y + delta.y };
      if (!isCellInsideRoom(room, candidate) || isHomeCellBlocked(room, candidate) || sameCell(candidate, reserved)) continue;
      candidates.set(`${candidate.x},${candidate.y}`, candidate);
    }
  }
  return [...candidates.values()].sort((a, b) => manhattan(from, a) - manhattan(from, b) || a.y - b.y || a.x - b.x)[0] ?? null;
}

function itemAnchor(room: HomeRoomDocument, itemId: string): GridCell {
  return room.items.find((item) => item.id === itemId)?.placement.anchor ?? { x: 0, y: 0 };
}

function facingToward(from: GridCell, target: GridCell): HomeDirection {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "east" : "west";
  return dy >= 0 ? "south" : "north";
}

function thoughtForCreature(creature: BuddyCreatureState): string {
  const urgent = creature.drives.mostUrgent(1)[0];
  if (!urgent || urgent.pressure < 0.35) return `I feel ${creature.mood.label}. This room is pretty nice.`;
  const thoughts: Readonly<Record<string, string>> = {
    hunger: "I could absolutely destroy a snack right now.",
    energy: "A tiny nap would improve the situation dramatically.",
    boredom: "We need a game. Preferably one with bouncing.",
    social: "Where did my person go? I require attention.",
    affection: "I have detected a dangerous shortage of head pats.",
    cleanliness: "I may have become a little bit gross.",
    comfort: "Something cozy would be excellent.",
    safety: "I should stay close to my person for a minute.",
    accomplishment: "I want to do something useful and impressive.",
    curiosity: "What happens if I poke everything in here?",
    focus: "I am trying very hard to remember what I was doing.",
  };
  return thoughts[urgent.drive] ?? `I am thinking about ${urgent.drive}.`;
}

function firstOpenCell(room: HomeRoomDocument, preferred: readonly GridCell[], reserved?: GridCell): GridCell {
  const candidates = [
    ...preferred,
    ...Array.from({ length: room.width * room.height }, (_, index) => ({
      x: index % room.width,
      y: Math.floor(index / room.width),
    })),
  ];
  return candidates.find((cell) => (
    isCellInsideRoom(room, cell) &&
    !isHomeCellBlocked(room, cell) &&
    (!reserved || !sameCell(cell, reserved))
  )) ?? { x: 0, y: 0 };
}
