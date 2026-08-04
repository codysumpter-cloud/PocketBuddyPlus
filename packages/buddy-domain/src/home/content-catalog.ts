import { upsertRoomItem } from "./placement.js";
import {
  parseHomeRoomDocument,
  type GridCell,
  type HomeRoomDocument,
  type HomeRoomItem,
} from "./room-document.js";

export const HOME_ITEM_ACTIONS = [
  "rest",
  "feed",
  "play",
  "sit",
  "toggle",
  "next-channel",
  "water",
] as const;

export type HomeItemAction = (typeof HOME_ITEM_ACTIONS)[number];

export interface HomeAssetDefinition {
  readonly assetId: string;
  readonly label: string;
  readonly category: "comfort" | "food" | "fun" | "media" | "decor" | "surface";
  readonly color: number;
  readonly accentColor: number;
  readonly footprint: Readonly<{ width: number; height: number }>;
  readonly actions: readonly HomeItemAction[];
  readonly blocksMovement: boolean;
  readonly defaultState: Readonly<Record<string, unknown>>;
}

/**
 * Public, generated-placeholder catalog used by the open repository.
 *
 * Private release builds may replace only the presentation metadata through a
 * licensed manifest. Canonical ids, footprints, affordances and state keys stay
 * here so a room behaves the same with placeholder or purchased art.
 */
export const HOME_PUBLIC_ASSETS: readonly HomeAssetDefinition[] = Object.freeze([
  {
    assetId: "home.bed.basic",
    label: "Buddy Bed",
    category: "comfort",
    color: 0x8c6fb2,
    accentColor: 0xc7b5e8,
    footprint: { width: 2, height: 1 },
    actions: ["rest"],
    blocksMovement: true,
    defaultState: { occupied: false },
  },
  {
    assetId: "home.food-bowl.basic",
    label: "Food Bowl",
    category: "food",
    color: 0xd9824b,
    accentColor: 0xffc276,
    footprint: { width: 1, height: 1 },
    actions: ["feed"],
    blocksMovement: true,
    defaultState: { servings: 5 },
  },
  {
    assetId: "home.toy.ball",
    label: "Play Ball",
    category: "fun",
    color: 0x4f9ce8,
    accentColor: 0xb9dcff,
    footprint: { width: 1, height: 1 },
    actions: ["play"],
    blocksMovement: false,
    defaultState: { bounces: 0 },
  },
  {
    assetId: "home.tv.basic",
    label: "Television",
    category: "media",
    color: 0x29334a,
    accentColor: 0x70e1c8,
    footprint: { width: 1, height: 1 },
    actions: ["toggle", "next-channel"],
    blocksMovement: true,
    defaultState: { powered: false, channel: "nature" },
  },
  {
    assetId: "home.chair.basic",
    label: "Chair",
    category: "comfort",
    color: 0x9f704d,
    accentColor: 0xd9a77c,
    footprint: { width: 1, height: 1 },
    actions: ["sit"],
    blocksMovement: true,
    defaultState: { occupied: false },
  },
  {
    assetId: "home.table.basic",
    label: "Table",
    category: "surface",
    color: 0x7f573b,
    accentColor: 0xc18a5c,
    footprint: { width: 2, height: 2 },
    actions: [],
    blocksMovement: true,
    defaultState: {},
  },
  {
    assetId: "home.plant.basic",
    label: "House Plant",
    category: "decor",
    color: 0x4b8f55,
    accentColor: 0xa4d66f,
    footprint: { width: 1, height: 1 },
    actions: ["water"],
    blocksMovement: true,
    defaultState: { watered: false },
  },
]);

const ASSETS_BY_ID = new Map(HOME_PUBLIC_ASSETS.map((asset) => [asset.assetId, asset]));

export function homeAssetDefinition(assetId: string): HomeAssetDefinition | null {
  return ASSETS_BY_ID.get(assetId) ?? null;
}

export function requireHomeAssetDefinition(assetId: string): HomeAssetDefinition {
  const definition = homeAssetDefinition(assetId);
  if (!definition) throw new Error(`unknown Home asset: ${assetId}`);
  return definition;
}

export function createHomeRoomItem(options: {
  readonly id: string;
  readonly assetId: string;
  readonly anchor: GridCell;
  readonly rotationQuarter?: 0 | 1 | 2 | 3;
  readonly supportItemId?: string | null;
}): HomeRoomItem {
  const definition = requireHomeAssetDefinition(options.assetId);
  const rotated = (options.rotationQuarter ?? 0) % 2 !== 0;
  return {
    id: options.id,
    assetId: definition.assetId,
    placement: {
      surface: "floor",
      anchor: { ...options.anchor },
      offset: { x: 0, y: 0 },
      rotationQuarter: options.rotationQuarter ?? 0,
      scale: 1,
      footprint: rotated
        ? { width: definition.footprint.height, height: definition.footprint.width }
        : { ...definition.footprint },
      supportItemId: options.supportItemId ?? null,
    },
    state: structuredClone(definition.defaultState),
  };
}

export function placeHomeCatalogItem(
  document: HomeRoomDocument,
  options: Parameters<typeof createHomeRoomItem>[0],
): HomeRoomDocument {
  return upsertRoomItem(document, createHomeRoomItem(options));
}

export interface HomeItemActionOutcome {
  readonly room: HomeRoomDocument;
  readonly itemId: string;
  readonly action: HomeItemAction;
  readonly relief: Readonly<Record<string, number>>;
  readonly affectionDelta: number;
  readonly thought: string;
}

export function applyHomeItemAction(
  document: HomeRoomDocument,
  itemId: string,
  action: HomeItemAction,
): HomeItemActionOutcome {
  const item = document.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error(`unknown Home item: ${itemId}`);
  const definition = requireHomeAssetDefinition(item.assetId);
  if (!definition.actions.includes(action)) {
    throw new Error(`${definition.assetId} does not support ${action}`);
  }

  let state: Readonly<Record<string, unknown>> = item.state;
  let relief: Readonly<Record<string, number>> = {};
  let affectionDelta = 0;
  let thought = `${definition.label} is ready.`;

  switch (action) {
    case "rest":
      state = { ...state, occupied: true };
      relief = { energy: 0.55, comfort: 0.18 };
      affectionDelta = 0.005;
      thought = "That nap hit the spot.";
      break;
    case "feed": {
      const servings = Math.max(0, Number(state.servings ?? 0));
      if (servings <= 0) {
        thought = "The food bowl is empty.";
        break;
      }
      state = { ...state, servings: servings - 1 };
      relief = { hunger: 0.62, comfort: 0.08 };
      affectionDelta = 0.012;
      thought = "Crunch crunch. Excellent snacks.";
      break;
    }
    case "play":
      state = { ...state, bounces: Math.max(0, Number(state.bounces ?? 0)) + 1 };
      relief = { boredom: 0.52, social: 0.1, accomplishment: 0.05 };
      affectionDelta = 0.018;
      thought = "Again! Throw it again!";
      break;
    case "sit":
      state = { ...state, occupied: true };
      relief = { comfort: 0.2, energy: 0.04 };
      thought = "This chair is suspiciously comfy.";
      break;
    case "toggle": {
      const powered = state.powered !== true;
      state = { ...state, powered };
      thought = powered ? `The TV is showing ${String(state.channel ?? "nature")}.` : "Quiet time. TV off.";
      break;
    }
    case "next-channel": {
      const channels = ["nature", "arcade", "weather", "music"] as const;
      const current = channels.indexOf(String(state.channel ?? "nature") as (typeof channels)[number]);
      const channel = channels[(current + 1 + channels.length) % channels.length];
      state = { ...state, powered: true, channel };
      relief = { boredom: 0.08 };
      thought = `Now watching ${channel}.`;
      break;
    }
    case "water":
      state = { ...state, watered: true };
      relief = { accomplishment: 0.08, comfort: 0.03 };
      thought = "The plant looks happier already.";
      break;
  }

  const room = replaceRoomItemState(document, itemId, state);
  return { room, itemId, action, relief, affectionDelta, thought };
}

export function replaceRoomItemState(
  document: HomeRoomDocument,
  itemId: string,
  state: Readonly<Record<string, unknown>>,
): HomeRoomDocument {
  if (!document.items.some((item) => item.id === itemId)) {
    throw new Error(`unknown Home item: ${itemId}`);
  }
  return parseHomeRoomDocument({
    ...document,
    revision: document.revision + 1,
    items: document.items.map((item) => item.id === itemId ? { ...item, state: structuredClone(state) } : item),
  });
}
