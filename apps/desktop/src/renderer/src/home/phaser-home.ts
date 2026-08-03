import Phaser from "phaser";
import {
  createHomeFloorTileLayer,
  createHomeRoomDocument,
  floorMaterialAt,
  paintHomeFloorTile,
  parseHomeFloorTileLayer,
  parseHomeRoomDocument,
  projectCanonicalCell,
  resetHomeFloorTile,
  rotateOrientation,
  type GridCell,
  type HomeFloorTileLayer,
  type HomeRoomDocument,
} from "@open-pets/buddy-domain";

const HOME_STORAGE_KEY = "pocket-buddy-plus:phaser-home:v1";
const TILE_WIDTH = 72;
const TILE_HEIGHT = 36;

export const HOME_BRUSHES = [
  "floor.wood",
  "floor.stone",
  "floor.grass",
  "floor.water",
  "erase",
] as const;

export type HomeBrush = (typeof HOME_BRUSHES)[number];

export interface PhaserHomeSnapshot {
  readonly orientation: HomeRoomDocument["orientation"];
  readonly brush: HomeBrush;
  readonly paintedTiles: number;
}

export interface PhaserHomeController {
  setBrush(brush: HomeBrush): void;
  rotate(deltaQuarter: number): void;
  clear(): void;
  destroy(): void;
}

interface PersistedHomeState {
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

class PhaserHomeScene extends Phaser.Scene {
  private room = createHomeRoomDocument({ roomId: "primary-home", width: 8, height: 6 });
  private floor = createHomeFloorTileLayer();
  private brush: HomeBrush = "floor.wood";
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
    this.graphics = this.add.graphics();

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.hoverCell = this.pickCell(pointer.x, pointer.y);
      if (pointer.isDown) this.paintPickedCell();
      this.renderRoom();
    });
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.lastPaintedKey = null;
      this.hoverCell = this.pickCell(pointer.x, pointer.y);
      this.paintPickedCell();
      this.renderRoom();
    });
    this.input.on("pointerup", () => {
      this.lastPaintedKey = null;
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.renderRoom());

    this.game.events.on("home:set-brush", this.handleSetBrush, this);
    this.game.events.on("home:rotate", this.handleRotate, this);
    this.game.events.on("home:clear", this.handleClear, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off("home:set-brush", this.handleSetBrush, this);
      this.game.events.off("home:rotate", this.handleRotate, this);
      this.game.events.off("home:clear", this.handleClear, this);
    });

    this.renderRoom();
    this.emitSnapshot();
  }

  private handleSetBrush(brush: HomeBrush): void {
    if (!HOME_BRUSHES.includes(brush)) return;
    this.brush = brush;
    this.emitSnapshot();
    this.renderRoom();
  }

  private handleRotate(deltaQuarter: number): void {
    this.room = {
      ...this.room,
      orientation: rotateOrientation(this.room.orientation, deltaQuarter),
      revision: this.room.revision + 1,
    };
    this.hoverCell = null;
    this.persistAndEmit();
    this.renderRoom();
  }

  private handleClear(): void {
    this.floor = createHomeFloorTileLayer(this.floor.defaultMaterialId);
    this.persistAndEmit();
    this.renderRoom();
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

  private persistAndEmit(): void {
    persistHomeState({ version: 1, room: this.room, floor: this.floor });
    this.emitSnapshot();
  }

  private emitSnapshot(): void {
    this.onStateChange?.({
      orientation: this.room.orientation,
      brush: this.brush,
      paintedTiles: Object.keys(this.floor.overrides).length,
    });
  }

  private renderRoom(): void {
    if (!this.graphics) return;
    const graphics = this.graphics;
    graphics.clear();

    const origin = this.roomOrigin();
    const cells: GridCell[] = [];
    for (let y = 0; y < this.room.height; y += 1) {
      for (let x = 0; x < this.room.width; x += 1) cells.push({ x, y });
    }
    cells.sort((a, b) => {
      const pa = projectCanonicalCell(a, this.room, this.room.orientation, TILE_WIDTH, TILE_HEIGHT);
      const pb = projectCanonicalCell(b, this.room, this.room.orientation, TILE_WIDTH, TILE_HEIGHT);
      return pa.y - pb.y || pa.x - pb.x;
    });

    for (const cell of cells) {
      const point = projectCanonicalCell(cell, this.room, this.room.orientation, TILE_WIDTH, TILE_HEIGHT);
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

    this.drawRearWalls(graphics, origin);
    this.drawBuddy(graphics, origin);
  }

  private drawRearWalls(graphics: Phaser.GameObjects.Graphics, origin: Phaser.Math.Vector2): void {
    const corners = [
      projectCanonicalCell({ x: 0, y: 0 }, this.room, this.room.orientation, TILE_WIDTH, TILE_HEIGHT),
      projectCanonicalCell({ x: this.room.width - 1, y: 0 }, this.room, this.room.orientation, TILE_WIDTH, TILE_HEIGHT),
      projectCanonicalCell({ x: this.room.width - 1, y: this.room.height - 1 }, this.room, this.room.orientation, TILE_WIDTH, TILE_HEIGHT),
      projectCanonicalCell({ x: 0, y: this.room.height - 1 }, this.room, this.room.orientation, TILE_WIDTH, TILE_HEIGHT),
    ];
    const top = corners.reduce((best, point) => point.y < best.y ? point : best, corners[0]);
    const left = corners.reduce((best, point) => point.x < best.x ? point : best, corners[0]);
    const right = corners.reduce((best, point) => point.x > best.x ? point : best, corners[0]);
    const wallHeight = 92;

    graphics.lineStyle(5, 0x5d4b47, 0.9);
    graphics.beginPath();
    graphics.moveTo(origin.x + left.x, origin.y + left.y);
    graphics.lineTo(origin.x + top.x, origin.y + top.y);
    graphics.lineTo(origin.x + right.x, origin.y + right.y);
    graphics.strokePath();

    graphics.lineStyle(3, 0x8f7770, 0.65);
    for (const point of [left, top, right]) {
      graphics.beginPath();
      graphics.moveTo(origin.x + point.x, origin.y + point.y);
      graphics.lineTo(origin.x + point.x, origin.y + point.y - wallHeight);
      graphics.strokePath();
    }
  }

  private drawBuddy(graphics: Phaser.GameObjects.Graphics, origin: Phaser.Math.Vector2): void {
    const cell = { x: Math.floor(this.room.width / 2), y: Math.floor(this.room.height / 2) };
    const point = projectCanonicalCell(cell, this.room, this.room.orientation, TILE_WIDTH, TILE_HEIGHT);
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
        const point = projectCanonicalCell(cell, this.room, this.room.orientation, TILE_WIDTH, TILE_HEIGHT);
        const dx = Math.abs(pointerX - (origin.x + point.x)) / (TILE_WIDTH / 2);
        const dy = Math.abs(pointerY - (origin.y + point.y)) / (TILE_HEIGHT / 2);
        const distance = dx + dy;
        if (distance <= 1 && (!best || distance < best.distance)) best = { cell, distance };
      }
    }
    return best?.cell ?? null;
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
    setBrush(brush) {
      game.events.emit("home:set-brush", brush);
    },
    rotate(deltaQuarter) {
      game.events.emit("home:rotate", deltaQuarter);
    },
    clear() {
      game.events.emit("home:clear");
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

function defaultHomeState(): PersistedHomeState {
  const room = createHomeRoomDocument({ roomId: "primary-home", width: 8, height: 6 });
  return { version: 1, room, floor: createHomeFloorTileLayer("floor.wood") };
}

function loadHomeState(): PersistedHomeState {
  const fallback = defaultHomeState();
  try {
    const raw = window.localStorage.getItem(HOME_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1) return fallback;
    const room = parseHomeRoomDocument(parsed.room);
    const floor = parseHomeFloorTileLayer(parsed.floor, room);
    return { version: 1, room, floor };
  } catch (error) {
    console.warn("[home/phaser] Ignoring invalid isolated Home preview save", error);
    return fallback;
  }
}

function persistHomeState(state: PersistedHomeState): void {
  window.localStorage.setItem(HOME_STORAGE_KEY, JSON.stringify(state));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
