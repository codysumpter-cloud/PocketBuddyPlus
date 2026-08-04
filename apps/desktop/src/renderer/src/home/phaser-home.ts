import Phaser from "phaser";
import {
  HOME_PUBLIC_ASSETS,
  advanceHomeSession,
  createHomeFloorTileLayer,
  createHomePlayState,
  createHomeRoomDocument,
  floorMaterialAt,
  footprintCells,
  homeAssetDefinition,
  interactHomeItem,
  moveHomeActor,
  paintHomeFloorTile,
  parseHomeFloorTileLayer,
  parseHomePlayState,
  parseHomeRoomDocument,
  petHomeBuddy,
  placeHomeCatalogItem,
  projectCanonicalCell,
  removeRoomItem,
  resetHomeFloorTile,
  rotateCameraCorner,
  selectHomeItem,
  wallBoundaryCells,
  wallPresentation,
  WORLD_WALLS,
  type GridCell,
  type HomeAssetDefinition,
  type HomeBrush as DomainHomeBrush,
  type HomeDirection,
  type HomeFloorTileLayer,
  type HomeItemAction,
  type HomePlayState,
  type HomeRoomDocument,
  type HomeRoomItem,
  type WorldWall,
} from "@open-pets/buddy-domain";

const HOME_STORAGE_KEY = "pocket-buddy-plus:phaser-home:v2";
const LEGACY_HOME_STORAGE_KEY = "pocket-buddy-plus:phaser-home:v1";
const TILE_WIDTH = 72;
const TILE_HEIGHT = 36;
const WALL_HEIGHT = 92;

export const HOME_BRUSHES = [
  "floor.wood",
  "floor.stone",
  "floor.grass",
  "floor.water",
  "erase",
] as const;

export type HomeBrush = DomainHomeBrush & (typeof HOME_BRUSHES)[number];

export const HOME_MODES = ["play", "paint", "place", "remove"] as const;
export type HomeMode = (typeof HOME_MODES)[number];

export const HOME_ITEM_ASSETS = HOME_PUBLIC_ASSETS.map((asset) => asset.assetId);

export interface PhaserHomeSnapshot {
  readonly cameraCorner: HomeRoomDocument["cameraCorner"];
  readonly mode: HomeMode;
  readonly brush: HomeBrush;
  readonly paintedTiles: number;
  readonly itemCount: number;
  readonly selectedAssetId: string;
  readonly selectedItemId: string | null;
  readonly buddyName: string;
  readonly buddyMood: string;
  readonly thought: string;
}

export interface PhaserHomeController {
  setMode(mode: HomeMode): void;
  setBrush(brush: HomeBrush): void;
  setItemAsset(assetId: string): void;
  rotate(deltaQuarter: number): void;
  clearFloor(): void;
  resetRoom(): void;
  movePlayer(direction: HomeDirection): void;
  petBuddy(): void;
  interactSelected(action?: HomeItemAction): void;
  destroy(): void;
}

interface PersistedHomeState {
  readonly version: 2;
  readonly room: HomeRoomDocument;
  readonly floor: HomeFloorTileLayer;
  readonly play: HomePlayState;
}

interface LegacyPersistedHomeState {
  readonly version: 1;
  readonly room: HomeRoomDocument;
  readonly floor: HomeFloorTileLayer;
}

interface MountOptions {
  readonly onStateChange?: (snapshot: PhaserHomeSnapshot) => void;
}

const MATERIAL_COLORS: Readonly<Record<string, number>> = {
  "floor.wood": 0xc99968,
  "floor.stone": 0x8b94a5,
  "floor.grass": 0x77ad68,
  "floor.water": 0x55a9d8,
};

const WALL_COLORS: Readonly<Record<WorldWall, number>> = {
  north: 0x8b6f68,
  east: 0x80655f,
  south: 0x735b58,
  west: 0x92746d,
};

class PhaserHomeScene extends Phaser.Scene {
  private room = createHomeRoomDocument({ roomId: "primary-home", width: 8, height: 6 });
  private floor = createHomeFloorTileLayer();
  private play = createHomePlayState(this.room, Math.floor(Date.now() / 1000));
  private mode: HomeMode = "play";
  private brush: HomeBrush = "floor.wood";
  private selectedAssetId = HOME_ITEM_ASSETS[0] ?? "home.bed.basic";
  private graphics!: Phaser.GameObjects.Graphics;
  private hoverCell: GridCell | null = null;
  private lastPaintedKey: string | null = null;
  private onStateChange?: (snapshot: PhaserHomeSnapshot) => void;

  constructor(onStateChange?: (snapshot: PhaserHomeSnapshot) => void) {
    super({ key: "PocketBuddyHome" });
    this.onStateChange = onStateChange;
  }

  create(): void {
    const restored = loadHomeState();
    this.room = restored.room;
    this.floor = restored.floor;
    this.play = restored.play;
    this.graphics = this.add.graphics();

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.hoverCell = this.pickCell(pointer.x, pointer.y);
      if (pointer.isDown && this.mode === "paint") this.paintPickedCell();
      this.renderRoom();
    });
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.lastPaintedKey = null;
      this.hoverCell = this.pickCell(pointer.x, pointer.y);
      this.handlePointerAction(pointer.x, pointer.y);
      this.renderRoom();
    });
    this.input.on("pointerup", () => {
      this.lastPaintedKey = null;
    });
    this.input.keyboard?.on("keydown", this.handleKeyDown, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.renderRoom());

    this.game.events.on("home:set-mode", this.handleSetMode, this);
    this.game.events.on("home:set-brush", this.handleSetBrush, this);
    this.game.events.on("home:set-item-asset", this.handleSetItemAsset, this);
    this.game.events.on("home:rotate", this.handleRotate, this);
    this.game.events.on("home:clear-floor", this.handleClearFloor, this);
    this.game.events.on("home:reset-room", this.handleResetRoom, this);
    this.game.events.on("home:move-player", this.handleMovePlayer, this);
    this.game.events.on("home:pet-buddy", this.handlePetBuddy, this);
    this.game.events.on("home:interact-selected", this.handleInteractSelected, this);

    this.time.addEvent({
      delay: 1_000,
      loop: true,
      callback: () => this.advanceBuddy(),
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off("keydown", this.handleKeyDown, this);
      this.game.events.off("home:set-mode", this.handleSetMode, this);
      this.game.events.off("home:set-brush", this.handleSetBrush, this);
      this.game.events.off("home:set-item-asset", this.handleSetItemAsset, this);
      this.game.events.off("home:rotate", this.handleRotate, this);
      this.game.events.off("home:clear-floor", this.handleClearFloor, this);
      this.game.events.off("home:reset-room", this.handleResetRoom, this);
      this.game.events.off("home:move-player", this.handleMovePlayer, this);
      this.game.events.off("home:pet-buddy", this.handlePetBuddy, this);
      this.game.events.off("home:interact-selected", this.handleInteractSelected, this);
    });

    this.persistAndEmit();
    this.renderRoom();
  }

  private handleSetMode(mode: HomeMode): void {
    if (!HOME_MODES.includes(mode)) return;
    this.mode = mode;
    this.hoverCell = null;
    this.emitSnapshot();
    this.renderRoom();
  }

  private handleSetBrush(brush: HomeBrush): void {
    if (!HOME_BRUSHES.includes(brush)) return;
    this.brush = brush;
    this.emitSnapshot();
    this.renderRoom();
  }

  private handleSetItemAsset(assetId: string): void {
    if (!homeAssetDefinition(assetId)) return;
    this.selectedAssetId = assetId;
    this.emitSnapshot();
    this.renderRoom();
  }

  private handleRotate(deltaQuarter: number): void {
    this.room = {
      ...this.room,
      cameraCorner: rotateCameraCorner(this.room.cameraCorner, deltaQuarter),
      revision: this.room.revision + 1,
    };
    this.hoverCell = null;
    this.persistAndEmit();
    this.renderRoom();
  }

  private handleClearFloor(): void {
    this.floor = createHomeFloorTileLayer(this.floor.defaultMaterialId);
    this.persistAndEmit();
    this.renderRoom();
  }

  private handleResetRoom(): void {
    const reset = defaultHomeState();
    this.room = reset.room;
    this.floor = reset.floor;
    this.play = reset.play;
    this.mode = "play";
    this.hoverCell = null;
    this.persistAndEmit();
    this.renderRoom();
  }

  private handleMovePlayer(direction: HomeDirection): void {
    this.play = moveHomeActor(this.room, this.play, "player", direction);
    this.persistAndEmit();
    this.renderRoom();
  }

  private handlePetBuddy(): void {
    this.play = petHomeBuddy(this.play, Math.floor(Date.now() / 1000));
    this.persistAndEmit();
    this.renderRoom();
  }

  private handleInteractSelected(action?: HomeItemAction): void {
    const itemId = this.play.selectedItemId;
    if (!itemId) return;
    const item = this.room.items.find((candidate) => candidate.id === itemId);
    const definition = item ? homeAssetDefinition(item.assetId) : null;
    if (!item || !definition || definition.actions.length === 0) return;
    const chosen = action && definition.actions.includes(action) ? action : definition.actions[0];
    if (!chosen) return;
    try {
      const result = interactHomeItem(this.room, this.play, itemId, chosen, Math.floor(Date.now() / 1000));
      this.room = result.room;
      this.play = result.play;
      this.persistAndEmit();
      this.renderRoom();
    } catch (error) {
      console.warn("[home/phaser] Home item interaction rejected", error);
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (this.mode !== "play") return;
    const direction = directionForKey(event.key);
    if (!direction) return;
    event.preventDefault();
    this.handleMovePlayer(direction);
  }

  private handlePointerAction(pointerX: number, pointerY: number): void {
    if (this.mode === "paint") {
      this.paintPickedCell();
      return;
    }
    if (this.mode === "place") {
      this.placePickedItem();
      return;
    }
    if (this.mode === "remove") {
      this.removePickedItem();
      return;
    }

    if (this.isPointNearActor(pointerX, pointerY, this.play.buddy.cell, -28)) {
      this.handlePetBuddy();
      return;
    }
    const item = this.hoverCell ? this.itemAtCell(this.hoverCell) : null;
    this.play = selectHomeItem(this.play, item?.id ?? null);
    if (item && homeAssetDefinition(item.assetId)?.actions.length) {
      this.handleInteractSelected();
    } else {
      this.persistAndEmit();
    }
  }

  private paintPickedCell(): void {
    if (!this.hoverCell) return;
    const key = `${this.hoverCell.x},${this.hoverCell.y}`;
    if (key === this.lastPaintedKey) return;
    this.lastPaintedKey = key;

    this.floor = this.brush === "erase"
      ? resetHomeFloorTile(this.room, this.floor, this.hoverCell)
      : paintHomeFloorTile(this.room, this.floor, this.hoverCell, this.brush);
    this.persistAndEmit();
  }

  private placePickedItem(): void {
    if (!this.hoverCell) return;
    try {
      const id = `home-item-${this.room.revision + 1}`;
      this.room = placeHomeCatalogItem(this.room, {
        id,
        assetId: this.selectedAssetId,
        anchor: this.hoverCell,
      });
      this.play = selectHomeItem(this.play, id);
      this.persistAndEmit();
    } catch (error) {
      console.info("[home/phaser] Home item placement rejected", {
        assetId: this.selectedAssetId,
        cell: this.hoverCell,
        error,
      });
    }
  }

  private removePickedItem(): void {
    if (!this.hoverCell) return;
    const item = this.itemAtCell(this.hoverCell);
    if (!item) return;
    this.room = removeRoomItem(this.room, item.id);
    this.play = selectHomeItem(this.play, null);
    this.persistAndEmit();
  }

  private advanceBuddy(): void {
    const result = advanceHomeSession(this.room, this.play, Math.floor(Date.now() / 1000));
    if (result.room === this.room && result.play === this.play) return;
    this.room = result.room;
    this.play = result.play;
    this.persistAndEmit();
    this.renderRoom();
  }

  private persistAndEmit(): void {
    persistHomeState({ version: 2, room: this.room, floor: this.floor, play: this.play });
    this.emitSnapshot();
  }

  private emitSnapshot(): void {
    const creature = this.play.creature;
    const mood = isRecord(creature.mood) && typeof creature.mood.label === "string"
      ? creature.mood.label
      : "content";
    const name = typeof creature.display_name === "string" ? creature.display_name : "Buddy";
    this.onStateChange?.({
      cameraCorner: this.room.cameraCorner,
      mode: this.mode,
      brush: this.brush,
      paintedTiles: Object.keys(this.floor.overrides).length,
      itemCount: this.room.items.length,
      selectedAssetId: this.selectedAssetId,
      selectedItemId: this.play.selectedItemId,
      buddyName: name,
      buddyMood: mood,
      thought: this.play.thought,
    });
  }

  private renderRoom(): void {
    if (!this.graphics) return;
    const graphics = this.graphics;
    graphics.clear();

    const origin = this.roomOrigin();
    this.drawWalls(graphics, origin, false);

    const cells = this.sortedCells();
    for (const cell of cells) {
      const point = projectCanonicalCell(cell, this.room, this.room.cameraCorner, TILE_WIDTH, TILE_HEIGHT);
      const centerX = origin.x + point.x;
      const centerY = origin.y + point.y;
      const material = floorMaterialAt(this.floor, cell);
      const hovered = this.hoverCell?.x === cell.x && this.hoverCell?.y === cell.y;
      drawDiamond(
        graphics,
        centerX,
        centerY,
        MATERIAL_COLORS[material] ?? 0xc99968,
        hovered ? 0xffffff : 0x29334a,
        hovered ? 3 : 1,
      );
    }

    const drawables = [
      ...this.room.items.map((item) => ({
        kind: "item" as const,
        y: this.projectedY(item.placement.anchor),
        item,
      })),
      { kind: "player" as const, y: this.projectedY(this.play.player.cell), item: null },
      { kind: "buddy" as const, y: this.projectedY(this.play.buddy.cell), item: null },
    ].sort((a, b) => a.y - b.y || drawableOrder(a.kind) - drawableOrder(b.kind));

    for (const drawable of drawables) {
      if (drawable.kind === "item" && drawable.item) this.drawItem(graphics, origin, drawable.item);
      else if (drawable.kind === "player") this.drawPlayer(graphics, origin);
      else if (drawable.kind === "buddy") this.drawBuddy(graphics, origin);
    }

    this.drawWalls(graphics, origin, true);
  }

  private sortedCells(): GridCell[] {
    const cells: GridCell[] = [];
    for (let y = 0; y < this.room.height; y += 1) {
      for (let x = 0; x < this.room.width; x += 1) cells.push({ x, y });
    }
    cells.sort((a, b) => {
      const pa = projectCanonicalCell(a, this.room, this.room.cameraCorner, TILE_WIDTH, TILE_HEIGHT);
      const pb = projectCanonicalCell(b, this.room, this.room.cameraCorner, TILE_WIDTH, TILE_HEIGHT);
      return pa.y - pb.y || pa.x - pb.x;
    });
    return cells;
  }

  private drawWalls(
    graphics: Phaser.GameObjects.Graphics,
    origin: Phaser.Math.Vector2,
    cameraFacing: boolean,
  ): void {
    for (const wall of WORLD_WALLS) {
      const presentation = wallPresentation(wall, this.room.cameraCorner, this.room.cutaway, this.mode !== "play");
      if (!presentation.visible || presentation.cameraFacing !== cameraFacing) continue;
      const points = wallBoundaryCells(this.room.width, this.room.height, wall)
        .map((cell) => projectCanonicalCell(cell, this.room, this.room.cameraCorner, TILE_WIDTH, TILE_HEIGHT))
        .map((point) => ({ x: origin.x + point.x, y: origin.y + point.y }))
        .sort((a, b) => a.x - b.x || a.y - b.y);
      if (points.length === 0) continue;

      const color = WALL_COLORS[wall];
      graphics.lineStyle(cameraFacing ? 3 : 5, color, presentation.alpha);
      for (const point of points) {
        graphics.beginPath();
        graphics.moveTo(point.x, point.y);
        graphics.lineTo(point.x, point.y - WALL_HEIGHT);
        graphics.strokePath();
      }
      graphics.beginPath();
      graphics.moveTo(points[0].x, points[0].y - WALL_HEIGHT);
      for (const point of points.slice(1)) graphics.lineTo(point.x, point.y - WALL_HEIGHT);
      graphics.strokePath();
    }
  }

  private drawItem(
    graphics: Phaser.GameObjects.Graphics,
    origin: Phaser.Math.Vector2,
    item: HomeRoomItem,
  ): void {
    const definition = homeAssetDefinition(item.assetId);
    if (!definition) return;
    const point = projectCanonicalCell(item.placement.anchor, this.room, this.room.cameraCorner, TILE_WIDTH, TILE_HEIGHT);
    const x = origin.x + point.x;
    const y = origin.y + point.y;
    const selected = this.play.selectedItemId === item.id;
    const width = Math.max(22, definition.footprint.width * 25);
    const height = Math.max(16, definition.footprint.height * 15);

    graphics.fillStyle(0x0b1020, 0.24);
    graphics.fillCircle(x, y + 8, Math.max(width, height) * 0.42);

    if (definition.assetId === "home.toy.ball") {
      graphics.fillStyle(definition.color, 1);
      graphics.fillCircle(x, y - 8, 11);
      graphics.lineStyle(3, definition.accentColor, 1);
      graphics.strokeCircle(x, y - 8, 11);
    } else if (definition.assetId === "home.plant.basic") {
      graphics.lineStyle(5, 0x7a5338, 1);
      graphics.beginPath();
      graphics.moveTo(x, y + 4);
      graphics.lineTo(x, y - 22);
      graphics.strokePath();
      graphics.fillStyle(definition.color, 1);
      graphics.fillCircle(x - 8, y - 22, 9);
      graphics.fillCircle(x + 8, y - 18, 9);
      graphics.fillStyle(definition.accentColor, 1);
      graphics.fillCircle(x, y - 28, 8);
    } else {
      graphics.fillStyle(definition.color, 1);
      graphics.fillRect(x - width / 2, y - height - 9, width, height + 9);
      graphics.lineStyle(selected ? 4 : 2, selected ? 0xffd84d : definition.accentColor, 1);
      graphics.strokeRect(x - width / 2, y - height - 9, width, height + 9);
      if (definition.assetId === "home.tv.basic") {
        const powered = item.state.powered === true;
        graphics.fillStyle(powered ? definition.accentColor : 0x111827, 1);
        graphics.fillRect(x - width / 2 + 5, y - height - 4, width - 10, Math.max(6, height - 4));
      }
    }

    if (selected) {
      graphics.lineStyle(2, 0xffd84d, 0.9);
      graphics.strokeCircle(x, y - 8, Math.max(width, height) * 0.7);
    }
  }

  private drawPlayer(graphics: Phaser.GameObjects.Graphics, origin: Phaser.Math.Vector2): void {
    const point = projectCanonicalCell(this.play.player.cell, this.room, this.room.cameraCorner, TILE_WIDTH, TILE_HEIGHT);
    const x = origin.x + point.x;
    const y = origin.y + point.y - 25;
    graphics.fillStyle(0x4e8ee8, 1);
    graphics.fillRect(x - 10, y - 1, 20, 26);
    graphics.fillStyle(0xf0c6a8, 1);
    graphics.fillCircle(x, y - 8, 10);
    graphics.lineStyle(2, 0x172038, 1);
    graphics.strokeCircle(x, y - 8, 10);
  }

  private drawBuddy(graphics: Phaser.GameObjects.Graphics, origin: Phaser.Math.Vector2): void {
    const point = projectCanonicalCell(this.play.buddy.cell, this.room, this.room.cameraCorner, TILE_WIDTH, TILE_HEIGHT);
    const x = origin.x + point.x;
    const y = origin.y + point.y - 28;

    graphics.fillStyle(0xffd84d, 1);
    graphics.fillCircle(x, y, 19);
    graphics.lineStyle(2, 0x422f2f, 1);
    graphics.strokeCircle(x, y, 19);
    graphics.fillStyle(0x422f2f, 1);
    graphics.fillCircle(x - 6, y - 3, 2.5);
    graphics.fillCircle(x + 6, y - 3, 2.5);
    graphics.lineStyle(2, 0x422f2f, 1);
    graphics.beginPath();
    graphics.arc(x, y + 1, 8, 0.2, Math.PI - 0.2, false);
    graphics.strokePath();
  }

  private roomOrigin(): Phaser.Math.Vector2 {
    const minX = -(this.room.height - 1) * (TILE_WIDTH / 2);
    const maxX = (this.room.width - 1) * (TILE_WIDTH / 2);
    const roomPixelWidth = maxX - minX + TILE_WIDTH;
    const x = (this.scale.width - roomPixelWidth) / 2 - minX + TILE_WIDTH / 2;
    return new Phaser.Math.Vector2(x, Math.max(150, this.scale.height * 0.24));
  }

  private pickCell(pointerX: number, pointerY: number): GridCell | null {
    const origin = this.roomOrigin();
    let best: { cell: GridCell; distance: number } | null = null;
    for (let y = 0; y < this.room.height; y += 1) {
      for (let x = 0; x < this.room.width; x += 1) {
        const cell = { x, y };
        const point = projectCanonicalCell(cell, this.room, this.room.cameraCorner, TILE_WIDTH, TILE_HEIGHT);
        const dx = Math.abs(pointerX - (origin.x + point.x)) / (TILE_WIDTH / 2);
        const dy = Math.abs(pointerY - (origin.y + point.y)) / (TILE_HEIGHT / 2);
        const distance = dx + dy;
        if (distance <= 1 && (!best || distance < best.distance)) best = { cell, distance };
      }
    }
    return best?.cell ?? null;
  }

  private itemAtCell(cell: GridCell): HomeRoomItem | null {
    return [...this.room.items].reverse().find((item) => (
      item.placement.surface === "floor" &&
      footprintCells(item).some((occupied) => occupied.x === cell.x && occupied.y === cell.y)
    )) ?? null;
  }

  private projectedY(cell: GridCell): number {
    return projectCanonicalCell(cell, this.room, this.room.cameraCorner, TILE_WIDTH, TILE_HEIGHT).y;
  }

  private isPointNearActor(pointerX: number, pointerY: number, cell: GridCell, yOffset: number): boolean {
    const origin = this.roomOrigin();
    const point = projectCanonicalCell(cell, this.room, this.room.cameraCorner, TILE_WIDTH, TILE_HEIGHT);
    return Math.hypot(pointerX - (origin.x + point.x), pointerY - (origin.y + point.y + yOffset)) <= 28;
  }
}

export function mountPhaserHome(
  parent: HTMLElement,
  options: MountOptions = {},
): PhaserHomeController {
  const scene = new PhaserHomeScene(options.onStateChange);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: Math.max(320, parent.clientWidth),
    height: Math.max(320, parent.clientHeight),
    backgroundColor: "#182033",
    transparent: false,
    antialias: false,
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: "100%",
      height: "100%",
    },
    scene,
  });

  return {
    setMode(mode) {
      game.events.emit("home:set-mode", mode);
    },
    setBrush(brush) {
      game.events.emit("home:set-brush", brush);
    },
    setItemAsset(assetId) {
      game.events.emit("home:set-item-asset", assetId);
    },
    rotate(deltaQuarter) {
      game.events.emit("home:rotate", deltaQuarter);
    },
    clearFloor() {
      game.events.emit("home:clear-floor");
    },
    resetRoom() {
      game.events.emit("home:reset-room");
    },
    movePlayer(direction) {
      game.events.emit("home:move-player", direction);
    },
    petBuddy() {
      game.events.emit("home:pet-buddy");
    },
    interactSelected(action) {
      game.events.emit("home:interact-selected", action);
    },
    destroy() {
      game.destroy(true);
    },
  };
}

function drawDiamond(
  graphics: Phaser.GameObjects.Graphics,
  centerX: number,
  centerY: number,
  fill: number,
  stroke: number,
  strokeWidth: number,
): void {
  graphics.fillStyle(fill, 1);
  graphics.lineStyle(strokeWidth, stroke, 1);
  graphics.beginPath();
  graphics.moveTo(centerX, centerY - TILE_HEIGHT / 2);
  graphics.lineTo(centerX + TILE_WIDTH / 2, centerY);
  graphics.lineTo(centerX, centerY + TILE_HEIGHT / 2);
  graphics.lineTo(centerX - TILE_WIDTH / 2, centerY);
  graphics.closePath();
  graphics.fillPath();
  graphics.strokePath();
}

function seedStarterRoom(): HomeRoomDocument {
  let room = createHomeRoomDocument({ roomId: "primary-home", width: 8, height: 6 });
  const starters = [
    { id: "starter-bed", assetId: "home.bed.basic", anchor: { x: 1, y: 1 } },
    { id: "starter-tv", assetId: "home.tv.basic", anchor: { x: 6, y: 1 } },
    { id: "starter-bowl", assetId: "home.food-bowl.basic", anchor: { x: 2, y: 4 } },
    { id: "starter-toy", assetId: "home.toy.ball", anchor: { x: 5, y: 4 } },
    { id: "starter-plant", assetId: "home.plant.basic", anchor: { x: 7, y: 4 } },
  ] as const;
  for (const starter of starters) room = placeHomeCatalogItem(room, starter);
  return room;
}

function defaultHomeState(): PersistedHomeState {
  const room = seedStarterRoom();
  return {
    version: 2,
    room,
    floor: createHomeFloorTileLayer("floor.wood"),
    play: createHomePlayState(room, Math.floor(Date.now() / 1000)),
  };
}

function loadHomeState(): PersistedHomeState {
  const fallback = defaultHomeState();
  try {
    const raw = window.localStorage.getItem(HOME_STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed) || parsed.version !== 2) return fallback;
      const room = parseHomeRoomDocument(parsed.room);
      const floor = parseHomeFloorTileLayer(parsed.floor, room);
      const play = parseHomePlayState(parsed.play, room, Math.floor(Date.now() / 1000));
      return { version: 2, room, floor, play };
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_HOME_STORAGE_KEY);
    if (!legacyRaw) return fallback;
    const legacy: unknown = JSON.parse(legacyRaw);
    if (!isRecord(legacy) || legacy.version !== 1) return fallback;
    const room = parseHomeRoomDocument(legacy.room);
    const floor = parseHomeFloorTileLayer(legacy.floor, room);
    const migrated: PersistedHomeState = {
      version: 2,
      room,
      floor,
      play: createHomePlayState(room, Math.floor(Date.now() / 1000)),
    };
    persistHomeState(migrated);
    return migrated;
  } catch (error) {
    console.warn("[home/phaser] Ignoring invalid isolated Home preview save", error);
    return fallback;
  }
}

function persistHomeState(state: PersistedHomeState): void {
  window.localStorage.setItem(HOME_STORAGE_KEY, JSON.stringify(state));
}

function directionForKey(key: string): HomeDirection | null {
  switch (key.toLowerCase()) {
    case "arrowup":
    case "w":
      return "north";
    case "arrowright":
    case "d":
      return "east";
    case "arrowdown":
    case "s":
      return "south";
    case "arrowleft":
    case "a":
      return "west";
    default:
      return null;
  }
}

function drawableOrder(kind: "item" | "player" | "buddy"): number {
  if (kind === "item") return 0;
  if (kind === "player") return 1;
  return 2;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
