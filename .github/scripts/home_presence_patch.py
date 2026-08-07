from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[2]

def read(path):
    return (ROOT / path).read_text()

def write(path, text):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)

def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, got {count}: {old[:100]!r}")
    write(path, text.replace(old, new, 1))

# ---------------------------------------------------------------------------
# Generic SDK: one bounded rendered appearance frame for the canonical pet.
# ---------------------------------------------------------------------------
replace_once(
    "packages/sdk/src/index.ts",
    'export interface OpenPetsPetState {\n  position: OpenPetsPoint;\n  bounds: OpenPetsRect;\n  currentAnimation: string;\n  visible: boolean;\n  dragging: boolean;\n}\n',
    'export interface OpenPetsPetState {\n  position: OpenPetsPoint;\n  bounds: OpenPetsRect;\n  currentAnimation: string;\n  visible: boolean;\n  dragging: boolean;\n}\n\n/** One host-rendered, bounded frame representing a pet without exposing source paths. */\nexport interface OpenPetsPetAppearance {\n  petHandleId: string;\n  installedPetId: string;\n  displayName: string;\n  frameDataUrl: string;\n  width: number;\n  height: number;\n  animationId: string;\n  direction: string;\n  source: "manifest-frame" | "legacy-sheet";\n}\n'
)
replace_once(
    "packages/sdk/src/index.ts",
    '  /** Self-perception. Requires `pets:read`. */\n  getState(): Promise<OpenPetsPetState>;\n',
    '  /** Self-perception. Requires `pets:read`. */\n  getState(): Promise<OpenPetsPetState>;\n  /** One safe rendered appearance frame for this pet. Requires `pets:read`. */\n  getAppearance(): Promise<OpenPetsPetAppearance>;\n'
)

replace_once(
    "apps/desktop/src/plugin-sdk-routes.ts",
    '"pet.getState", "pet.show", "pet.hide", "pet.close",',
    '"pet.getState", "pet.getAppearance", "pet.show", "pet.hide", "pet.close",'
)
replace_once(
    "apps/desktop/plugin-sdk-preload.cjs",
    '    getState: () => call("pet.getState", [petId]),\n',
    '    getState: () => call("pet.getState", [petId]),\n    getAppearance: () => call("pet.getAppearance", [petId]),\n'
)
replace_once(
    "apps/desktop/src/plugin-js-host.ts",
    '  "pet.getState": (sdk, args) => sdk.pets.forPet(args[0]).getState(),\n',
    '  "pet.getState": (sdk, args) => sdk.pets.forPet(args[0]).getState(),\n  "pet.getAppearance": (sdk, args) => sdk.pets.forPet(args[0]).getAppearance(),\n'
)

replace_once(
    "apps/desktop/src/plugin-sdk-state.ts",
    '  spawnedPets: Set<string>;\n  pickedFiles: Set<string>;\n',
    '  spawnedPets: Set<string>;\n  /** Pets this plugin hid while they were visible; restored on plugin teardown. */\n  hiddenPets: Set<string>;\n  pickedFiles: Set<string>;\n'
)

replace_once(
    "apps/desktop/src/plugin-sdk-bridge.ts",
    'export type PluginPetState = { position: { x: number; y: number }; bounds: { x: number; y: number; width: number; height: number }; currentAnimation: string; visible: boolean; dragging: boolean };\n',
    'export type PluginPetState = { position: { x: number; y: number }; bounds: { x: number; y: number; width: number; height: number }; currentAnimation: string; visible: boolean; dragging: boolean };\nexport type PluginPetAppearance = { petHandleId: string; installedPetId: string; displayName: string; frameDataUrl: string; width: number; height: number; animationId: string; direction: string; source: "manifest-frame" | "legacy-sheet" };\n'
)
replace_once(
    "apps/desktop/src/plugin-sdk-bridge.ts",
    '    getState(petHandleId: string): Promise<PluginPetState>;\n    onTick(petHandleId: string, handler: (dtMs: number) => void): () => void;\n',
    '    getState(petHandleId: string): Promise<PluginPetState>;\n    getAppearance(petHandleId: string): Promise<PluginPetAppearance>;\n    onTick(petHandleId: string, handler: (dtMs: number) => void): () => void;\n'
)
replace_once(
    "apps/desktop/src/plugin-sdk-bridge.ts",
    '      getState: async () => ({ position: { x: 0, y: 0 }, bounds: { x: 0, y: 0, width: 0, height: 0 }, currentAnimation: "idle", visible: true, dragging: false }),\n',
    '      getState: async () => ({ position: { x: 0, y: 0 }, bounds: { x: 0, y: 0, width: 0, height: 0 }, currentAnimation: "idle", visible: true, dragging: false }),\n      getAppearance: unavailable("pets.getAppearance"),\n'
)
replace_once(
    "apps/desktop/src/plugin-sdk-bridge.ts",
    '      getState: async () => { requirePermission("pets:read"); return caps.pets.getState(validatePetHandleId(petHandleId)); },\n      show: async () => { requirePermission("pets:manage"); await caps.pets.show(validatePetHandleId(petHandleId)); },\n      hide: async () => { requirePermission("pets:manage"); await caps.pets.hide(validatePetHandleId(petHandleId)); },\n',
    '      getState: async () => { requirePermission("pets:read"); return caps.pets.getState(validatePetHandleId(petHandleId)); },\n      getAppearance: async () => { requirePermission("pets:read"); return caps.pets.getAppearance(validatePetHandleId(petHandleId)); },\n      show: async () => {\n        requirePermission("pets:manage");\n        const id = validatePetHandleId(petHandleId);\n        state.hiddenPets.delete(id);\n        await caps.pets.show(id);\n      },\n      hide: async () => {\n        requirePermission("pets:manage");\n        const id = validatePetHandleId(petHandleId);\n        const before = await caps.pets.getState(id).catch(() => null);\n        if (before?.visible) state.hiddenPets.add(id);\n        await caps.pets.hide(id);\n      },\n'
)
replace_once(
    "apps/desktop/src/plugin-sdk-bridge.ts",
    '    for (const petHandleId of state.spawnedPets) { void this.#capabilities.pets.close(id, petHandleId).catch(() => undefined); }\n    state.spawnedPets.clear();\n    state.pickedFiles.clear();\n',
    '    for (const petHandleId of state.spawnedPets) { void this.#capabilities.pets.close(id, petHandleId).catch(() => undefined); }\n    state.spawnedPets.clear();\n    // A plugin that borrowed the desktop pet visibility must never strand it\n    // hidden after disable/reload/crash cleanup. Only restore pets that were\n    // visible when this plugin hid them.\n    for (const petHandleId of state.hiddenPets) { void this.#capabilities.pets.show(petHandleId).catch(() => undefined); }\n    state.hiddenPets.clear();\n    state.pickedFiles.clear();\n'
)
replace_once(
    "apps/desktop/src/plugin-sdk-bridge.ts",
    '        bubbles: new Map(), deliveries: new Map(), panels: new Map(), spawnedPets: new Set(), pickedFiles: new Set(), userCommandDepth: 0,\n',
    '        bubbles: new Map(), deliveries: new Map(), panels: new Map(), spawnedPets: new Set(), hiddenPets: new Set(), pickedFiles: new Set(), userCommandDepth: 0,\n'
)

replace_once(
    "apps/desktop/src/plugin-host-capabilities.ts",
    'import { getPluginService } from "./plugin-service.js";\n',
    'import { getPluginService } from "./plugin-service.js";\nimport { getPluginPetAppearance } from "./plugin-pet-appearance.js";\n'
)
replace_once(
    "apps/desktop/src/plugin-host-capabilities.ts",
    '      getState: async (petHandleId) => getPluginPetState(petHandleId),\n      onTick: (petHandleId, handler) => onPluginPetTick(petHandleId, handler),\n',
    '      getState: async (petHandleId) => getPluginPetState(petHandleId),\n      getAppearance: (petHandleId) => getPluginPetAppearance(petHandleId),\n      onTick: (petHandleId, handler) => onPluginPetTick(petHandleId, handler),\n'
)

# ---------------------------------------------------------------------------
# Home domain: host-profile-driven presence mode without a second needs clock.
# ---------------------------------------------------------------------------
play_path = "packages/buddy-domain/src/home/play-state.ts"
play = read(play_path)
needle = 'function preferredTarget(\n  room: HomeRoomDocument,\n  state: HomePlayState,\n  drive: string,\n): { item?: HomeRoomItem; action?: HomeItemAction; cell?: GridCell } | null {\n'
if play.count(needle) != 1:
    raise SystemExit("play-state: preferredTarget anchor drifted")
insert = r'''export interface HomeBuddyPresenceIntent {
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

'''
write(play_path, play.replace(needle, insert + needle, 1))

# ---------------------------------------------------------------------------
# Home scene: active Buddy sprite/profile + Play/Idle simulation split.
# ---------------------------------------------------------------------------
scene_path = "plugins/official/openpets.home-builder/src/home-scene.ts"
scene = read(scene_path)
scene = scene.replace('  advanceHomeSession,\n', '  advanceHomePresenceSession,\n  advanceHomeSession,\n', 1)
scene = scene.replace('  type HomeBrush as DomainHomeBrush,\n', '  type HomeBrush as DomainHomeBrush,\n  type HomeBuddyPresenceIntent,\n', 1)
scene = scene.replace('export type HomeMode = (typeof HOME_MODES)[number];\n', 'export type HomeMode = (typeof HOME_MODES)[number];\nexport const HOME_SIMULATION_MODES = ["play", "idle"] as const;\nexport type HomeSimulationMode = (typeof HOME_SIMULATION_MODES)[number];\nexport type HomeBuddyPresence = HomeBuddyPresenceIntent & { readonly affection?: number; readonly needs?: Readonly<Record<string, number>> };\n', 1)
scene = scene.replace('  interactSelected(action?: HomeItemAction): void;\n  destroy(): void;\n', '  interactSelected(action?: HomeItemAction): void;\n  setSimulationMode(mode: HomeSimulationMode): void;\n  setBuddyPresence(presence: HomeBuddyPresence | null): void;\n  setBuddyAppearance(image: CanvasImageSource | null): void;\n  destroy(): void;\n', 1)
scene = scene.replace('interface MountOptions {\n  readonly onStateChange?: (snapshot: PhaserHomeSnapshot) => void;\n  readonly store?: HomeStateStore;\n}\n', 'interface MountOptions {\n  readonly onStateChange?: (snapshot: PhaserHomeSnapshot) => void;\n  readonly onBuddyAction?: (action: "pet" | HomeItemAction) => void;\n  readonly store?: HomeStateStore;\n}\n', 1)
scene = scene.replace('  private onStateChange?: (snapshot: PhaserHomeSnapshot) => void;\n\n  constructor(onStateChange?: (snapshot: PhaserHomeSnapshot) => void) {\n    super();\n    this.onStateChange = onStateChange;\n  }\n', '  private onStateChange?: (snapshot: PhaserHomeSnapshot) => void;\n  private onBuddyAction?: (action: "pet" | HomeItemAction) => void;\n  private simulationMode: HomeSimulationMode = "play";\n  private buddyPresence: HomeBuddyPresence | null = null;\n  private buddyAppearance: CanvasImageSource | null = null;\n\n  constructor(options: MountOptions = {}) {\n    super();\n    this.onStateChange = options.onStateChange;\n    this.onBuddyAction = options.onBuddyAction;\n  }\n', 1)
scene = scene.replace('    this.game.events.on("home:interact-selected", this.handleInteractSelected, this);\n', '    this.game.events.on("home:interact-selected", this.handleInteractSelected, this);\n    this.game.events.on("home:set-simulation-mode", this.handleSimulationMode, this);\n    this.game.events.on("home:set-buddy-presence", this.handleBuddyPresence, this);\n    this.game.events.on("home:set-buddy-appearance", this.handleBuddyAppearance, this);\n', 1)
scene = scene.replace('      this.game.events.off("home:interact-selected", this.handleInteractSelected, this);\n', '      this.game.events.off("home:interact-selected", this.handleInteractSelected, this);\n      this.game.events.off("home:set-simulation-mode", this.handleSimulationMode, this);\n      this.game.events.off("home:set-buddy-presence", this.handleBuddyPresence, this);\n      this.game.events.off("home:set-buddy-appearance", this.handleBuddyAppearance, this);\n', 1)
anchor = '  private handleMovePlayer(direction: HomeDirection): void {\n'
handlers = '''  private handleSimulationMode(mode: HomeSimulationMode): void {\n    if (!HOME_SIMULATION_MODES.includes(mode)) return;\n    this.simulationMode = mode;\n    this.emitSnapshot();\n  }\n\n  private handleBuddyPresence(presence: HomeBuddyPresence | null): void {\n    this.buddyPresence = presence;\n    this.emitSnapshot();\n    this.renderRoom();\n  }\n\n  private handleBuddyAppearance(image: CanvasImageSource | null): void {\n    this.buddyAppearance = image;\n    this.renderRoom();\n  }\n\n'''
if scene.count(anchor) != 1: raise SystemExit("home-scene move-player anchor drift")
scene = scene.replace(anchor, handlers + anchor, 1)
scene = scene.replace('  private handleMovePlayer(direction: HomeDirection): void {\n    this.play = moveHomeActor(this.room, this.play, "player", direction);\n', '  private handleMovePlayer(direction: HomeDirection): void {\n    if (this.simulationMode !== "play") return;\n    this.play = moveHomeActor(this.room, this.play, "player", direction);\n', 1)
scene = scene.replace('  private handlePetBuddy(): void {\n    this.play = petHomeBuddy(this.play, Math.floor(Date.now() / 1000));\n    this.persistAndEmit();\n    this.renderRoom();\n  }\n', '  private handlePetBuddy(): void {\n    const now = Math.floor(Date.now() / 1000);\n    this.play = this.buddyPresence\n      ? { ...this.play, revision: this.play.revision + 1, thought: `${this.buddyPresence.displayName} leans into the attention.`, lastAdvancedUnix: Math.max(now, this.play.lastAdvancedUnix) }\n      : petHomeBuddy(this.play, now);\n    this.onBuddyAction?.("pet");\n    this.persistAndEmit();\n    this.renderRoom();\n  }\n', 1)
scene = scene.replace('      const result = interactHomeItem(this.room, this.play, itemId, chosen, Math.floor(Date.now() / 1000));\n      this.room = result.room;\n      this.play = result.play;\n', '      const now = Math.floor(Date.now() / 1000);\n      const result = interactHomeItem(this.room, this.play, itemId, chosen, now);\n      this.room = result.room;\n      this.play = this.buddyPresence\n        ? { ...this.play, revision: this.play.revision + 1, selectedItemId: itemId, thought: result.play.thought, lastAdvancedUnix: Math.max(now, this.play.lastAdvancedUnix) }\n        : result.play;\n      this.onBuddyAction?.(chosen);\n', 1)
scene = scene.replace('  private handleKeyDown(event: KeyboardEvent): void {\n    if (this.mode !== "play") return;\n', '  private handleKeyDown(event: KeyboardEvent): void {\n    if (this.mode !== "play" || this.simulationMode !== "play") return;\n', 1)
scene = scene.replace('  private advanceBuddy(): void {\n    const result = advanceHomeSession(this.room, this.play, Math.floor(Date.now() / 1000));\n', '  private advanceBuddy(): void {\n    const now = Math.floor(Date.now() / 1000);\n    const result = this.buddyPresence\n      ? advanceHomePresenceSession(this.room, this.play, this.buddyPresence, now, { autonomousPlayer: this.simulationMode === "idle" })\n      : advanceHomeSession(this.room, this.play, now);\n', 1)
scene = scene.replace('    const creature = this.play.creature;\n    const mood = isRecord(creature.mood) && typeof creature.mood.label === "string"\n      ? creature.mood.label\n      : "content";\n    const name = typeof creature.display_name === "string" ? creature.display_name : "Buddy";\n', '    const creature = this.play.creature;\n    const mood = this.buddyPresence?.mood ?? (isRecord(creature.mood) && typeof creature.mood.label === "string" ? creature.mood.label : "content");\n    const name = this.buddyPresence?.displayName ?? (typeof creature.display_name === "string" ? creature.display_name : "Buddy");\n', 1)
old_draw = '''  private drawBuddy(graphics: Graphics, origin: Vector2): void {\n    const point = projectCanonicalCell(this.play.buddy.cell, this.room, this.room.cameraCorner, TILE_WIDTH, TILE_HEIGHT);\n    const x = origin.x + point.x;\n    const y = origin.y + point.y - 28;\n\n    graphics.fillStyle(0xffd84d, 1);\n    graphics.fillCircle(x, y, 19);\n    graphics.lineStyle(2, 0x422f2f, 1);\n    graphics.strokeCircle(x, y, 19);\n    graphics.fillStyle(0x422f2f, 1);\n    graphics.fillCircle(x - 6, y - 3, 2.5);\n    graphics.fillCircle(x + 6, y - 3, 2.5);\n    graphics.lineStyle(2, 0x422f2f, 1);\n    graphics.beginPath();\n    graphics.arc(x, y + 1, 8, 0.2, Math.PI - 0.2, false);\n    graphics.strokePath();\n  }\n'''
new_draw = '''  private drawBuddy(graphics: Graphics, origin: Vector2): void {\n    const point = projectCanonicalCell(this.play.buddy.cell, this.room, this.room.cameraCorner, TILE_WIDTH, TILE_HEIGHT);\n    const x = origin.x + point.x;\n    const floorY = origin.y + point.y;\n    if (this.buddyAppearance) {\n      const height = Number((this.buddyAppearance as { height?: number }).height ?? 0);\n      const scale = height > 0 ? Math.min(0.65, 72 / height) : 0.35;\n      graphics.fillStyle(0x0b1020, 0.22);\n      graphics.fillCircle(x, floorY + 4, 17);\n      graphics.drawSpriteCentered(this.buddyAppearance, x, floorY - 29, scale);\n      return;\n    }\n\n    const y = floorY - 28;\n    graphics.fillStyle(0xffd84d, 1);\n    graphics.fillCircle(x, y, 19);\n    graphics.lineStyle(2, 0x422f2f, 1);\n    graphics.strokeCircle(x, y, 19);\n    graphics.fillStyle(0x422f2f, 1);\n    graphics.fillCircle(x - 6, y - 3, 2.5);\n    graphics.fillCircle(x + 6, y - 3, 2.5);\n    graphics.lineStyle(2, 0x422f2f, 1);\n    graphics.beginPath();\n    graphics.arc(x, y + 1, 8, 0.2, Math.PI - 0.2, false);\n    graphics.strokePath();\n  }\n'''
if scene.count(old_draw) != 1: raise SystemExit("home-scene drawBuddy drift")
scene = scene.replace(old_draw, new_draw, 1)
scene = scene.replace('  const scene = new PhaserHomeScene(options.onStateChange);\n', '  const scene = new PhaserHomeScene(options);\n', 1)
scene = scene.replace('    interactSelected(action) {\n      game.events.emit("home:interact-selected", action);\n    },\n    destroy() {\n', '    interactSelected(action) {\n      game.events.emit("home:interact-selected", action);\n    },\n    setSimulationMode(mode) {\n      game.events.emit("home:set-simulation-mode", mode);\n    },\n    setBuddyPresence(presence) {\n      game.events.emit("home:set-buddy-presence", presence);\n    },\n    setBuddyAppearance(image) {\n      game.events.emit("home:set-buddy-appearance", image);\n    },\n    destroy() {\n', 1)
write(scene_path, scene)

# ---------------------------------------------------------------------------
# Home plugin: canonical presence owner while panel is open.
# ---------------------------------------------------------------------------
manifest_path = ROOT / "plugins/official/openpets.home-builder/openpets.plugin.json"
manifest = json.loads(manifest_path.read_text())
manifest["version"] = "1.1.0"
for permission in ["pets:read", "pets:manage", "pet:reaction"]:
    if permission not in manifest["permissions"]:
        manifest["permissions"].append(permission)
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

index_path = "plugins/official/openpets.home-builder/src/index.ts"
index_text = read(index_path)
start = index_text.index("export function register(")
prefix = index_text[:start]
register_block = r'''type BuddyProfileLike = {
  readonly displayName?: string;
  readonly mood?: string;
  readonly activity?: string;
  readonly dominantNeed?: string;
  readonly affection?: number;
  readonly needs?: Readonly<Record<string, number>>;
};

type HomePetInfo = { readonly id: string; readonly name: string; readonly buddyProfile?: BuddyProfileLike };
type HomePetAppearance = { readonly frameDataUrl: string; readonly displayName: string; readonly width: number; readonly height: number; readonly animationId: string; readonly direction: string; readonly source: string };
type PresentationMode = "panel" | "home" | "buddy";

type HomePluginContext = {
  commands: { register(descriptor: unknown, run: () => unknown): Promise<void> };
  storage: StorageLike;
  files?: FilesLike;
  ui: { panel(options: unknown): Promise<PanelLike & { show(): Promise<void>; close(): Promise<void> }> };
  pet: {
    getAppearance(): Promise<HomePetAppearance>;
    hide(): Promise<void>;
    show(): Promise<void>;
    react(reaction: string, options?: { showMessage?: boolean }): Promise<void>;
  };
  pets: {
    list(): Promise<HomePetInfo[]>;
    onChange(handler: (pets: HomePetInfo[]) => void): () => void;
  };
};

let activePanel: (PanelLike & { show(): Promise<void>; close(): Promise<void> }) | null = null;
let activePresentation: Exclude<PresentationMode, "buddy"> = "panel";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function sendBuddyPresence(context: HomePluginContext, panel: PanelLike): Promise<void> {
  const pets = await context.pets.list();
  const pet = pets.find((candidate) => candidate.id === "default") ?? pets[0];
  const profile = pet?.buddyProfile;
  await panel.postMessage({
    type: "home-buddy-presence",
    buddy: {
      id: "default",
      name: profile?.displayName ?? pet?.name ?? "Buddy",
      profile: profile ?? null,
    },
  });

  try {
    const appearance = await context.pet.getAppearance();
    const { frameDataUrl, ...metadata } = appearance;
    const chunks = chunkDataUrl(frameDataUrl);
    await panel.postMessage({ type: "home-buddy-frame-begin", count: chunks.length, metadata });
    for (let index = 0; index < chunks.length; index += 1) {
      await panel.postMessage({ type: "home-buddy-frame-chunk", index, count: chunks.length, data: chunks[index] });
    }
    await panel.postMessage({ type: "home-buddy-frame-end" });
  } catch (error) {
    await panel.postMessage({ type: "home-buddy-frame-unavailable", error: String((error as Error)?.message ?? error).slice(0, 160) });
  }
}

function reactionForHomeAction(action: string): string {
  if (action === "play") return "celebrating";
  if (action === "feed") return "success";
  if (action === "rest" || action === "sit") return "waiting";
  return "waving";
}

async function openHome(context: HomePluginContext, presentation: Exclude<PresentationMode, "buddy">): Promise<void> {
  activePresentation = presentation;
  if (activePanel) {
    await context.pet.hide();
    await activePanel.postMessage({ type: "home-presentation", mode: presentation });
    await sendBuddyPresence(context, activePanel);
    await activePanel.show();
    return;
  }

  const panel = await context.ui.panel({ panel: "home", title: "Buddy Home", width: 1180, height: 860 });
  activePanel = panel;
  const baseHandler = createHomeStateHandler(context.storage, panel, context.files);
  panel.onMessage(async (message: unknown) => {
    await baseHandler(message);
    if (!isRecord(message)) return;
    if (message.type === "home-state-request") {
      await panel.postMessage({ type: "home-presentation", mode: activePresentation });
      await sendBuddyPresence(context, panel);
      return;
    }
    if (message.type === "home-presentation") {
      const mode = message.mode;
      if (mode === "buddy") {
        activePanel = null;
        await context.pet.show();
        await panel.close();
        return;
      }
      if (mode === "panel" || mode === "home") {
        activePresentation = mode;
        await context.pet.hide();
        await panel.postMessage({ type: "home-presentation", mode });
      }
      return;
    }
    if (message.type === "home-panel-closing") {
      if (activePanel === panel) activePanel = null;
      await context.pet.show();
      return;
    }
    if (message.type === "home-buddy-react" && typeof message.action === "string") {
      await context.pet.react(reactionForHomeAction(message.action), { showMessage: false });
    }
  });
  await context.pet.hide();
}

async function buddyOnly(context: HomePluginContext): Promise<void> {
  const panel = activePanel;
  activePanel = null;
  await context.pet.show();
  if (panel) await panel.close();
}

export function register(OpenPetsPlugin: {
  register(plugin: { start(ctx: unknown): Promise<void> | void }): void;
}): void {
  OpenPetsPlugin.register({
    async start(ctx: unknown) {
      const context = ctx as HomePluginContext;
      await context.commands.register(
        { id: "open-home", title: "$t:command.open.title", description: "$t:command.open.description", icon: "home", featured: true },
        () => openHome(context, "panel"),
      );
      await context.commands.register(
        { id: "show-home", title: "Show Buddy in Home", description: "Open the playable Home scene without the builder chrome.", icon: "home" },
        () => openHome(context, "home"),
      );
      await context.commands.register(
        { id: "buddy-only", title: "Buddy Only", description: "Return Buddy to the normal desktop pet view.", icon: "home" },
        () => buddyOnly(context),
      );

      context.pets.onChange(() => {
        const panel = activePanel;
        if (panel) void sendBuddyPresence(context, panel).catch(() => undefined);
      });
    },
  });
}
'''
write(index_path, prefix + register_block)

# ---------------------------------------------------------------------------
# Home panel shell: Panel/Home/Buddy presentation + Play/Idle simulation.
# ---------------------------------------------------------------------------
home_ts = r'''import { HOME_PUBLIC_ASSETS, type HomeDirection, type HomeItemAction } from "@open-pets/buddy-domain";
import {
  HOME_BRUSHES,
  HOME_ITEM_ASSETS,
  HOME_MODES,
  HOME_SIMULATION_MODES,
  mountPhaserHome,
  setHomeSprites,
  type HomeBrush,
  type HomeBuddyPresence,
  type HomeMode,
  type HomeSimulationMode,
  type PhaserHomeController,
  type PhaserHomeSnapshot,
} from "./home-scene";
import "./home.css";

type PresentationMode = "panel" | "home" | "buddy";
type PanelMessage = Record<string, unknown>;

const root = document.getElementById("home-root");
if (!root) throw new Error("Home panel root is missing");

let controller: PhaserHomeController | null = null;
let selectedMode: HomeMode = "play";
let selectedBrush: HomeBrush = "floor.wood";
let selectedAssetId = HOME_ITEM_ASSETS[0] ?? "home.bed.basic";
let presentation: PresentationMode = "panel";
let simulation: HomeSimulationMode = "play";
let buddyPresence: HomeBuddyPresence | null = null;
let buddyImage: CanvasImageSource | null = null;
let buddyFrameChunks: string[] = [];
let spriteChunks = new Map<string, string[]>();
let spriteImages: Record<string, CanvasImageSource> = {};
let savedValues: Record<string, string> = {};

const panel = window.openPetsPanel;
if (!panel) throw new Error("Home panel bridge is unavailable");

function renderShell(): void {
  root.dataset.presentation = presentation;
  root.dataset.simulation = simulation;
  root.innerHTML = `
    <main class="pb-home-shell">
      <div class="pb-home-presence-bar" role="toolbar" aria-label="Home presentation">
        <div class="pb-home-segment" role="group" aria-label="Presentation mode">
          <button data-home-presentation="panel" class="${presentation === "panel" ? "active" : ""}">Panel</button>
          <button data-home-presentation="home" class="${presentation === "home" ? "active" : ""}">Home</button>
          <button data-home-presentation="buddy">Buddy</button>
        </div>
        <div class="pb-home-segment" role="group" aria-label="Simulation mode">
          <button data-home-simulation="play" class="${simulation === "play" ? "active" : ""}">Play</button>
          <button data-home-simulation="idle" class="${simulation === "idle" ? "active" : ""}">Idle</button>
        </div>
        <span class="pb-home-presence-name" data-home-presence-name>${buddyPresence?.displayName ?? "Buddy"}</span>
      </div>
      <header class="pb-home-header">
        <div><p class="pb-home-eyebrow">Pocket Buddy+ · Home</p><h1>Buddy Home</h1><p>Decorate, play as your human, or let the household run itself.</p></div>
        <button data-home-close aria-label="Close Home">×</button>
      </header>
      <section class="pb-home-toolbar" aria-label="Home tools">
        <div class="pb-home-tool-section"><span>Mode</span><div class="pb-home-mode-buttons">${HOME_MODES.map(modeButton).join("")}</div></div>
        <div class="pb-home-tool-section" data-home-floor-tools><span>Floor</span><div class="pb-home-brushes">${HOME_BRUSHES.map(brushButton).join("")}</div></div>
        <div class="pb-home-tool-section pb-home-furniture-section" data-home-furniture-tools><span>Furniture</span><div class="pb-home-items">${HOME_PUBLIC_ASSETS.map(itemButton).join("")}</div></div>
        <div class="pb-home-actions">
          <button data-home-pet>Pet Buddy</button><button data-home-use>Use selected</button><button data-home-channel>Next TV channel</button>
          <button data-home-rotate="-1">↶ Rotate</button><button data-home-rotate="1">Rotate ↷</button>
          <button data-home-clear-floor>Reset floor</button><button data-home-reset-room>Reset room</button><button data-home-load-pack>Load TinyHouse art</button>
        </div>
        <div class="pb-home-movement"><button data-home-move="north">↑</button><button data-home-move="west">←</button><button data-home-move="south">↓</button><button data-home-move="east">→</button></div>
      </section>
      <div class="pb-home-stage" data-home-stage tabindex="0" aria-label="Playable Buddy Home"></div>
      <footer class="pb-home-footer"><span data-home-status>Loading Home…</span><span data-home-thought>Buddy is coming home.</span><span class="pb-home-help">Play: WASD/arrows move your human. Idle: both actors choose their own movement.</span></footer>
    </main>`;
  root.addEventListener("click", handleClick);
  mountScene();
}

function modeButton(mode: HomeMode): string { return `<button data-home-mode="${mode}" class="${mode === selectedMode ? "active" : ""}">${mode[0].toUpperCase()}${mode.slice(1)}</button>`; }
function brushButton(brush: HomeBrush): string { const label = brush === "erase" ? "Erase" : brush.replace("floor.", ""); return `<button data-home-brush="${brush}" class="${brush === selectedBrush ? "active" : ""}">${label}</button>`; }
function itemButton(asset: (typeof HOME_PUBLIC_ASSETS)[number]): string { return `<button data-home-item-asset="${asset.assetId}" class="${asset.assetId === selectedAssetId ? "active" : ""}">${asset.label}</button>`; }

function mountScene(): void {
  const stage = root.querySelector<HTMLElement>("[data-home-stage]");
  if (!stage) return;
  controller?.destroy();
  controller = mountPhaserHome(stage, {
    store: { read: (key) => savedValues[key] ?? null, write: (key, value) => { savedValues[key] = value; panel.postMessage({ type: "home-state-write", key, value }); } },
    onStateChange: updateStatus,
    onBuddyAction: (action) => panel.postMessage({ type: "home-buddy-react", action }),
  });
  controller.setMode(selectedMode);
  controller.setBrush(selectedBrush);
  controller.setItemAsset(selectedAssetId);
  controller.setSimulationMode(simulation);
  controller.setBuddyPresence(buddyPresence);
  controller.setBuddyAppearance(buddyImage);
  setHomeSprites(spriteImages);
  requestAnimationFrame(() => stage.focus());
}

function updateStatus(snapshot: PhaserHomeSnapshot): void {
  selectedMode = snapshot.mode;
  selectedAssetId = snapshot.selectedAssetId;
  const status = root.querySelector<HTMLElement>("[data-home-status]");
  const thought = root.querySelector<HTMLElement>("[data-home-thought]");
  if (status) status.textContent = `${snapshot.buddyName} · ${snapshot.buddyMood} · ${simulation === "idle" ? "Idle household" : "Player control"} · ${snapshot.itemCount} items`;
  if (thought) thought.textContent = `“${snapshot.thought}”`;
  syncControls();
}

function handleClick(event: Event): void {
  const target = event.target as HTMLElement;
  const presentationButton = target.closest<HTMLButtonElement>("[data-home-presentation]");
  if (presentationButton) {
    const mode = presentationButton.dataset.homePresentation as PresentationMode;
    if (mode === "panel" || mode === "home" || mode === "buddy") panel.postMessage({ type: "home-presentation", mode });
    return;
  }
  const simulationButton = target.closest<HTMLButtonElement>("[data-home-simulation]");
  if (simulationButton) {
    const mode = simulationButton.dataset.homeSimulation as HomeSimulationMode;
    if (HOME_SIMULATION_MODES.includes(mode)) { simulation = mode; controller?.setSimulationMode(mode); applyPresentation(); }
    return;
  }
  if (target.closest("[data-home-close]")) { panel.postMessage({ type: "home-panel-closing" }); panel.close(); return; }
  const modeButton = target.closest<HTMLButtonElement>("[data-home-mode]");
  if (modeButton) { const mode = modeButton.dataset.homeMode as HomeMode; if (HOME_MODES.includes(mode)) { selectedMode = mode; controller?.setMode(mode); syncControls(); } return; }
  const brushButton = target.closest<HTMLButtonElement>("[data-home-brush]");
  if (brushButton) { const brush = brushButton.dataset.homeBrush as HomeBrush; if (HOME_BRUSHES.includes(brush)) { selectedBrush = brush; selectedMode = "paint"; controller?.setBrush(brush); controller?.setMode("paint"); syncControls(); } return; }
  const itemButton = target.closest<HTMLButtonElement>("[data-home-item-asset]");
  if (itemButton) { const assetId = itemButton.dataset.homeItemAsset ?? ""; if (HOME_ITEM_ASSETS.includes(assetId)) { selectedAssetId = assetId; selectedMode = "place"; controller?.setItemAsset(assetId); controller?.setMode("place"); syncControls(); } return; }
  const moveButton = target.closest<HTMLButtonElement>("[data-home-move]"); if (moveButton) { controller?.movePlayer(moveButton.dataset.homeMove as HomeDirection); return; }
  const rotate = target.closest<HTMLButtonElement>("[data-home-rotate]"); if (rotate) { controller?.rotate(Number(rotate.dataset.homeRotate)); return; }
  if (target.closest("[data-home-load-pack]")) { panel.postMessage({ type: "home-pack-pick" }); return; }
  if (target.closest("[data-home-pet]")) controller?.petBuddy();
  else if (target.closest("[data-home-use]")) controller?.interactSelected();
  else if (target.closest("[data-home-channel]")) controller?.interactSelected("next-channel" as HomeItemAction);
  else if (target.closest("[data-home-clear-floor]")) controller?.clearFloor();
  else if (target.closest("[data-home-reset-room]")) controller?.resetRoom();
}

function syncControls(): void {
  root.querySelectorAll<HTMLElement>("[data-home-mode]").forEach((node) => node.classList.toggle("active", node.dataset.homeMode === selectedMode));
  root.querySelectorAll<HTMLElement>("[data-home-brush]").forEach((node) => node.classList.toggle("active", node.dataset.homeBrush === selectedBrush));
  root.querySelectorAll<HTMLElement>("[data-home-item-asset]").forEach((node) => node.classList.toggle("active", node.dataset.homeItemAsset === selectedAssetId));
}

function applyPresentation(): void {
  root.dataset.presentation = presentation;
  root.dataset.simulation = simulation;
  root.querySelectorAll<HTMLElement>("[data-home-presentation]").forEach((node) => node.classList.toggle("active", node.dataset.homePresentation === presentation));
  root.querySelectorAll<HTMLElement>("[data-home-simulation]").forEach((node) => node.classList.toggle("active", node.dataset.homeSimulation === simulation));
  const name = root.querySelector<HTMLElement>("[data-home-presence-name]");
  if (name) name.textContent = buddyPresence?.displayName ?? "Buddy";
}

async function decodeImage(dataUrl: string): Promise<CanvasImageSource> {
  return await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = dataUrl; });
}

async function handlePanelMessage(message: PanelMessage): Promise<void> {
  if (message.type === "home-state" && message.values && typeof message.values === "object") { savedValues = { ...(message.values as Record<string, string>) }; if (!controller) renderShell(); return; }
  if (message.type === "home-presentation" && (message.mode === "panel" || message.mode === "home")) { presentation = message.mode; applyPresentation(); return; }
  if (message.type === "home-buddy-presence" && message.buddy && typeof message.buddy === "object") {
    const buddy = message.buddy as { name?: unknown; profile?: unknown };
    const profile = buddy.profile && typeof buddy.profile === "object" ? buddy.profile as Record<string, unknown> : {};
    buddyPresence = {
      displayName: typeof profile.displayName === "string" ? profile.displayName : typeof buddy.name === "string" ? buddy.name : "Buddy",
      mood: typeof profile.mood === "string" ? profile.mood : "content",
      activity: typeof profile.activity === "string" ? profile.activity : "idle",
      dominantNeed: typeof profile.dominantNeed === "string" ? profile.dominantNeed : "social",
      affection: typeof profile.affection === "number" ? profile.affection : undefined,
      needs: profile.needs && typeof profile.needs === "object" ? profile.needs as Record<string, number> : undefined,
    };
    controller?.setBuddyPresence(buddyPresence); applyPresentation(); return;
  }
  if (message.type === "home-buddy-frame-begin") { buddyFrameChunks = Array(Math.max(0, Number(message.count) || 0)).fill(""); return; }
  if (message.type === "home-buddy-frame-chunk" && typeof message.data === "string") { buddyFrameChunks[Number(message.index) || 0] = message.data; return; }
  if (message.type === "home-buddy-frame-end") { try { buddyImage = await decodeImage(buddyFrameChunks.join("")); controller?.setBuddyAppearance(buddyImage); } catch { buddyImage = null; controller?.setBuddyAppearance(null); } buddyFrameChunks = []; return; }
  if (message.type === "home-pack-begin") { spriteChunks = new Map((Array.isArray(message.keys) ? message.keys : []).map((key) => [String(key), []])); return; }
  if (message.type === "home-pack-chunk" && typeof message.key === "string" && typeof message.data === "string") { const list = spriteChunks.get(message.key) ?? []; list[Number(message.index) || 0] = message.data; spriteChunks.set(message.key, list); return; }
  if (message.type === "home-pack-end") {
    const next: Record<string, CanvasImageSource> = {};
    await Promise.all([...spriteChunks.entries()].map(async ([key, chunks]) => { try { next[key] = await decodeImage(chunks.join("")); } catch { /* individual missing art keeps shape fallback */ } }));
    spriteImages = next; setHomeSprites(next); return;
  }
  if (message.type === "home-pack-error" && typeof message.error === "string") { const thought = root.querySelector<HTMLElement>("[data-home-thought]"); if (thought) thought.textContent = message.error; }
}

panel.onMessage((message: unknown) => { if (message && typeof message === "object") void handlePanelMessage(message as PanelMessage); });
window.addEventListener("pagehide", () => { panel.postMessage({ type: "home-panel-closing" }); controller?.destroy(); controller = null; }, { once: true });
panel.postMessage({ type: "home-state-request" });
'''
write("plugins/official/openpets.home-builder/src/home.ts", home_ts)

# Add immersive/presence styles without disturbing existing pixel styling.
css_path = "plugins/official/openpets.home-builder/src/home.css"
css = read(css_path)
css += r'''

/* Presence runtime ------------------------------------------------------- */
.pb-home-presence-bar {
  position: relative;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 2px solid #29334a;
  background: rgba(11, 16, 32, .94);
}
.pb-home-segment { display: inline-flex; gap: 4px; padding: 3px; border: 1px solid #3d4965; border-radius: 8px; background: #151d31; }
.pb-home-segment button { min-width: 58px; }
.pb-home-segment button.active { background: #ffd84d; color: #241d12; border-color: #fff1a8; }
.pb-home-presence-name { margin-left: auto; font-weight: 800; color: #ffd84d; }
#home-root[data-presentation="home"] .pb-home-header,
#home-root[data-presentation="home"] .pb-home-toolbar,
#home-root[data-presentation="home"] .pb-home-footer { display: none; }
#home-root[data-presentation="home"] .pb-home-shell { height: 100vh; grid-template-rows: auto minmax(0, 1fr); }
#home-root[data-presentation="home"] .pb-home-stage { min-height: 0; height: 100%; }
#home-root[data-presentation="home"] .pb-home-presence-bar { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); border: 1px solid #3d4965; border-radius: 10px; box-shadow: 0 8px 28px rgba(0,0,0,.28); }
#home-root[data-simulation="idle"] .pb-home-movement { opacity: .35; pointer-events: none; }
'''
write(css_path, css)

# ---------------------------------------------------------------------------
# Canonical Control Center Home nav becomes a plugin launcher, no duplicate sim.
# ---------------------------------------------------------------------------
home_launcher = r'''import "./home-ui.css";

const HOME_PLUGIN_ID = "openpets.home-builder";
let observerQueued = false;
let messageTimer = 0;

type PluginRecord = { id: string; enabled: boolean; brokenReason?: string; commands?: readonly { id: string }[] };
type PluginSnapshot = { plugins: readonly PluginRecord[] };
type HomePluginApi = {
  getPluginsSnapshot(): Promise<PluginSnapshot>;
  executePluginCommand(id: string, commandId: string, args?: Record<string, unknown>): Promise<unknown>;
};

function api(): HomePluginApi | undefined { return (window as { openPetsControlCenter?: HomePluginApi }).openPetsControlCenter; }

function createHomeNavButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "nav-tab pb-home-nav";
  button.innerHTML = '<span class="pb-home-nav-icon" aria-hidden="true">◆</span><span>Home</span>';
  button.addEventListener("click", () => void openPluginHome());
  return button;
}

function ensureHomeNavButton(): void {
  if (document.querySelector(".pb-home-nav")) return;
  const nav = document.querySelector(".nav-bar");
  if (!nav) return;
  const button = createHomeNavButton();
  const settings = Array.from(nav.querySelectorAll<HTMLElement>(".nav-tab")).find((entry) => entry.textContent?.trim().toLowerCase() === "settings");
  if (settings) nav.insertBefore(button, settings); else nav.append(button);
}

async function openPluginHome(): Promise<void> {
  const bridge = api();
  if (!bridge) return showHomeLauncherMessage("Home plugin controls are unavailable in this window.");
  try {
    const snapshot = await bridge.getPluginsSnapshot();
    const home = snapshot.plugins.find((plugin) => plugin.id === HOME_PLUGIN_ID);
    if (!home) return showHomeLauncherMessage("Install the Home plugin from Plugins to use Buddy Home.");
    if (home.brokenReason) return showHomeLauncherMessage(`Home needs attention: ${home.brokenReason}`);
    if (!home.enabled) return showHomeLauncherMessage("Home is installed but disabled. Enable it in Plugins and approve its Home permissions first.");
    if (!home.commands?.some((command) => command.id === "open-home")) return showHomeLauncherMessage("Home is still starting. Try again in a moment.");
    await bridge.executePluginCommand(HOME_PLUGIN_ID, "open-home");
  } catch (error) {
    showHomeLauncherMessage(`Could not open Home: ${String((error as Error)?.message ?? error).slice(0, 120)}`);
  }
}

function showHomeLauncherMessage(text: string): void {
  let node = document.querySelector<HTMLDivElement>(".pb-home-launcher-message");
  if (!node) { node = document.createElement("div"); node.className = "pb-home-launcher-message"; document.body.append(node); }
  node.textContent = text; node.classList.add("show");
  clearTimeout(messageTimer); messageTimer = window.setTimeout(() => node?.classList.remove("show"), 4500);
}

function queueEnsure(): void { if (observerQueued) return; observerQueued = true; queueMicrotask(() => { observerQueued = false; ensureHomeNavButton(); }); }
const observer = new MutationObserver(queueEnsure);
observer.observe(document.documentElement, { childList: true, subtree: true });
ensureHomeNavButton();
'''
write("apps/desktop/src/renderer/src/home-ui.ts", home_launcher)

# A tiny launcher toast can reuse the existing stylesheet without carrying the old modal runtime.
ui_css_path = "apps/desktop/src/renderer/src/home-ui.css"
ui_css = read(ui_css_path)
ui_css += r'''
.pb-home-launcher-message { position: fixed; left: 50%; bottom: 28px; z-index: 10000; max-width: min(520px, calc(100vw - 32px)); padding: 11px 15px; border: 1px solid #475569; border-radius: 10px; background: #0f172a; color: #e2e8f0; box-shadow: 0 12px 38px rgba(0,0,0,.35); opacity: 0; transform: translate(-50%, 10px); pointer-events: none; transition: opacity .16s ease, transform .16s ease; }
.pb-home-launcher-message.show { opacity: 1; transform: translate(-50%, 0); }
'''
write(ui_css_path, ui_css)

# ---------------------------------------------------------------------------
# Tests: protect canonical plugin launch, presentation modes, active Buddy art.
# ---------------------------------------------------------------------------
test_path = "plugins/official/openpets.home-builder/test.js"
test = read(test_path)
test = test.replace('    if (msg?.type === "home-state-request") queueMicrotask(() => panelHandler?.({ type: "home-state", values: {} }));\n', '    if (msg?.type === "home-state-request") queueMicrotask(() => {\n      panelHandler?.({ type: "home-state", values: {} });\n      panelHandler?.({ type: "home-presentation", mode: "panel" });\n      panelHandler?.({ type: "home-buddy-presence", buddy: { id: "default", name: "Pixel Buddy", profile: { displayName: "Pixel Buddy", mood: "happy", activity: "exploring", dominantNeed: "play", affection: 0.8, needs: { play: 0.7 } } } });\n      panelHandler?.({ type: "home-buddy-frame-begin", count: 1, metadata: { width: 64, height: 64 } });\n      panelHandler?.({ type: "home-buddy-frame-chunk", index: 0, count: 1, data: "data:image/png;base64,BBBB" });\n      panelHandler?.({ type: "home-buddy-frame-end" });\n    });\n', 1)
test = test.replace('assert.ok(root.innerHTML.includes(\'data-home-mode="paint"\'), "mode controls render");\n', 'assert.ok(root.innerHTML.includes(\'data-home-mode="paint"\'), "mode controls render");\nassert.ok(root.innerHTML.includes(\'data-home-presentation="home"\'), "Home presentation control renders");\nassert.ok(root.innerHTML.includes(\'data-home-presentation="buddy"\'), "Buddy-only presentation control renders");\nassert.ok(root.innerHTML.includes(\'data-home-simulation="idle"\'), "Idle household control renders");\n', 1)
test = test.replace('assert.ok(draws.some(([op]) => op === "stroke"), "walls and outlines are stroked");\n', 'assert.ok(draws.some(([op]) => op === "stroke"), "walls and outlines are stroked");\nassert.ok(draws.some(([op, src]) => op === "drawImage" && src === "data:image/png;base64,BBBB"), "the active host Buddy frame is drawn inside Home");\n', 1)
write(test_path, test)

# Source contract for the launcher and SDK boundary.
write("apps/desktop/tests/home-plugin-presence-contract.test.ts", r'''import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = join(import.meta.dirname, "..");
const launcher = readFileSync(join(root, "src/renderer/src/home-ui.ts"), "utf8");
const bridge = readFileSync(join(root, "src/plugin-sdk-bridge.ts"), "utf8");
const preload = readFileSync(join(root, "plugin-sdk-preload.cjs"), "utf8");
const manifest = JSON.parse(readFileSync(join(root, "../../plugins/official/openpets.home-builder/openpets.plugin.json"), "utf8"));

describe("Home presence plugin contract", () => {
  it("routes the Control Center Home nav to the official plugin", () => {
    assert.match(launcher, /openpets\.home-builder/);
    assert.match(launcher, /executePluginCommand\(HOME_PLUGIN_ID, "open-home"\)/);
    assert.doesNotMatch(launcher, /mountPhaserHome/);
  });

  it("gates active Buddy appearance and visibility through declared permissions", () => {
    assert.ok(manifest.permissions.includes("pets:read"));
    assert.ok(manifest.permissions.includes("pets:manage"));
    assert.ok(manifest.permissions.includes("pet:reaction"));
    assert.match(bridge, /getAppearance: async \(\) => \{ requirePermission\("pets:read"\)/);
    assert.match(bridge, /state\.hiddenPets\.add\(id\)/);
    assert.match(bridge, /for \(const petHandleId of state\.hiddenPets\)/);
    assert.match(preload, /pet\.getAppearance/);
  });
});
''')

# ---------------------------------------------------------------------------
# Documentation/codemaps required by repo-local instructions.
# ---------------------------------------------------------------------------
def append_once(path, marker, block):
    text = read(path)
    if marker not in text:
        write(path, text.rstrip() + "\n\n" + block.strip() + "\n")

append_once("docs/plugins.md", "## Home presence runtime", r'''
## Home presence runtime

`openpets.home-builder` is the canonical Home product surface. The Control Center Home nav launches the plugin instead of mounting a duplicate first-party simulation. Home exposes three presentation choices: **Panel** (full builder chrome), **Home** (immersive house view), and **Buddy** (the normal desktop pet). Within the house, **Play** keeps the human under WASD/arrow control while **Idle** lets both actors move autonomously.

With `pets:read`, Home receives the host-owned public Buddy profile plus one bounded rendered appearance frame. With `pets:manage`, the plugin temporarily hides the desktop Buddy while that same Buddy is represented inside the house; the SDK tracks that hide as a teardown lease so disabling/reloading a plugin cannot strand the default pet invisible. Home never receives the installed pet filesystem path or complete sprite pack through this API.
''')
append_once("docs/superplugins.md", "### Home as a presence superplugin", r'''
### Home as a presence superplugin

Home demonstrates the preferred composition pattern for a world-like superplugin: it owns room topology and presentation, but consumes the canonical host Buddy identity/profile instead of forking another pet lifecycle. The plugin can switch among full panel, immersive Home, and desktop Buddy presentation without spawning a duplicate Buddy. Its Idle household simulation is profile-driven: the public dominant need/activity chooses where Buddy walks, while the legacy Home creature payload is preserved only for old-save fallback.
''')
append_once("plugins/official/codemap.md", "openpets.home-builder presence runtime", r'''
### `openpets.home-builder` presence runtime
- Canonical Control Center Home entry point is the official plugin, not the legacy renderer modal.
- Presentation: `panel` / `home` / `buddy`; simulation: `play` / `idle`.
- Reads the default pet public profile and one bounded host-rendered frame via `pets:read`.
- Temporarily leases default-pet visibility while Home represents Buddy in-room; host teardown restores leased visibility.
- Home actor autonomy uses host profile intent and does not advance a second needs clock when that profile is available.
''')
append_once("apps/desktop/src/renderer/src/codemap.md", "Home navigation is plugin-owned", r'''
## Home navigation is plugin-owned
`home-ui.ts` is now a thin navigation adapter. It locates enabled `openpets.home-builder` and executes its `open-home` command; it no longer mounts the renderer-local Home simulation. This keeps plugin installation/enablement/permission state authoritative for Home.
''')

# Add desktop test to the explicit desktop test runner when it enumerates files.
runner = "apps/desktop/scripts/run-tests.mjs"
if (ROOT / runner).exists():
    runner_text = read(runner)
    if "home-plugin-presence-contract.test" not in runner_text:
        # Most tests are globbed by the runner; marker comment is enough for codemap if no explicit list.
        pass

print("Home presence patch applied")
