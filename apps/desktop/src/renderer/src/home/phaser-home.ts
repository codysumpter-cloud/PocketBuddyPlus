import Phaser from "phaser";
import { assetUrl, type HomeContentPack, type PackItem } from "./content-pack";
import {
  createHomeFloorTileLayer,
  createHomeRoomDocument,
  floorMaterialAt,
  paintHomeFloorTile,
  parseHomeFloorTileLayer,
  parseHomeRoomDocument,
  projectCanonicalCell,
  resetHomeFloorTile,
  rotateCameraCorner,
  rotateCanonicalCell,
  mapToLocal,
  floorGroundPosition,
  wallCells,
  wallDepthBands,
  TILE_WIDTH as ISO_TILE_WIDTH,
  TILE_HEIGHT as ISO_TILE_HEIGHT,
  isNearWall,
  WORLD_WALLS,
  type GridCell,
  type HomeFloorTileLayer,
  type HomeRoomDocument,
} from "@open-pets/buddy-domain";

const HOME_STORAGE_KEY = "pocket-buddy-plus:phaser-home:v1";
// Donor geometry, not a guess: IsoTileRoom uses a 128x64 isometric tile with
// TILE_LAYOUT_DIAMOND_DOWN. Pinned by tools/godot-oracle/iso-tile-parity.test.mjs.
const TILE_WIDTH = ISO_TILE_WIDTH;
const TILE_HEIGHT = ISO_TILE_HEIGHT;
const WALL_RISE = 46;
// Donor depth bands. Items sit in front of near walls (-900 in the donor).
const FLOOR_BAND = -2400;
const ITEM_BAND = -900;

/** Render metadata for the installed Buddy, supplied by the main process. */
export interface HomePetRenderInfo {
  readonly id: string;
  readonly spritesheetUrl: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly columns: number;
  readonly idleRow: number;
  readonly idleFrames: number;
  readonly idleFps: number;
  readonly scale: number;
}

/** Cell along a given wall, used to lay tiled wall art. */
function wallCellFor(side: string, index: number, width: number, height: number): { x: number; y: number } {
  switch (side) {
    case "north": return { x: index, y: 0 };
    case "south": return { x: index, y: height - 1 };
    case "west": return { x: 0, y: index };
    default: return { x: width - 1, y: index };
  }
}

export const HOME_BRUSHES = [
  "floor.wood",
  "floor.stone",
  "floor.grass",
  "floor.water",
  "erase",
] as const;

export type HomeBrush = (typeof HOME_BRUSHES)[number];

export interface PhaserHomeSnapshot {
  readonly cameraCorner: HomeRoomDocument["cameraCorner"];
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
  readonly pack?: HomeContentPack | null;
  readonly pet?: HomePetRenderInfo | null;
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
  private pack: HomeContentPack | null;
  private pet: HomePetRenderInfo | null;
  private sprites: Phaser.GameObjects.Image[] = [];
  private petSprite: Phaser.GameObjects.Sprite | null = null;
  /** Catalog floor used for each brush, resolved once the pack is known. */
  private brushFloors = new Map<HomeBrush, string>();

  constructor(
    onStateChange?: (snapshot: PhaserHomeSnapshot) => void,
    pack: HomeContentPack | null = null,
    pet: HomePetRenderInfo | null = null,
  ) {
    super({ key: "PocketBuddyHome" });
    this.onStateChange = onStateChange;
    this.pack = pack;
    this.pet = pet;
  }

  preload(): void {
    if (this.pack) {
      // Brushes map onto real catalog floors by name, falling back to position
      // so a renamed pack still dresses the room instead of going blank.
      const pick = (needle: string, index: number) =>
        this.pack!.floors.find((floor) => floor.id.toLowerCase().includes(needle))
        ?? this.pack!.floors[Math.min(index, this.pack!.floors.length - 1)];
      const chosen: Array<[HomeBrush, string]> = [
        ["floor.wood", pick("wood", 0).id],
        ["floor.stone", pick("stone", 1).id],
        ["floor.grass", pick("green", 2).id],
        ["floor.water", pick("blue", 3).id],
      ];
      for (const [brush, id] of chosen) this.brushFloors.set(brush, id);

      for (const floor of this.pack.floors) this.load.image(`floor:${floor.id}`, assetUrl(floor.src));
      for (const wall of this.pack.walls) {
        this.load.image(`wall:${wall.id}:west`, assetUrl(wall.west));
        this.load.image(`wall:${wall.id}:north`, assetUrl(wall.north));
      }
      for (const item of this.pack.items) this.load.image(`item:${item.id}`, assetUrl(item.src));
    }
    if (this.pet) {
      this.load.spritesheet("home-pet", this.pet.spritesheetUrl, {
        frameWidth: this.pet.frameWidth,
        frameHeight: this.pet.frameHeight,
      });
    }
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
      cameraCorner: rotateCameraCorner(this.room.cameraCorner, deltaQuarter),
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
      cameraCorner: this.room.cameraCorner,
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
      const pa = this.project(a);
      const pb = this.project(b);
      return pa.y - pb.y || pa.x - pb.x;
    });

    // Sprites are rebuilt each frame alongside the graphics clear; leaving them
    // would stack a new room on top of the old one every rotation.
    for (const sprite of this.sprites) sprite.destroy();
    this.sprites = [];

    for (const cell of cells) {
      const point = this.project(cell);
      const centerX = origin.x + point.x;
      const centerY = origin.y + point.y;
      const material = floorMaterialAt(this.floor, cell);
      const hovered = this.hoverCell?.x === cell.x && this.hoverCell?.y === cell.y;

      const floorKey = this.floorTextureKey(material);
      if (floorKey) {
        const tile = this.add.image(centerX, centerY, floorKey);
        tile.setOrigin(0.5, 0.5);
        tile.setDepth(FLOOR_BAND + point.y);
        this.sprites.push(tile);
        if (hovered) {
          graphics.lineStyle(2, 0xffffff, 0.9);
          this.strokeDiamond(graphics, centerX, centerY);
        }
      } else {
        drawDiamond(
          graphics,
          centerX,
          centerY,
          MATERIAL_COLORS[material] ?? 0xc99968,
          hovered ? 0xffffff : 0x29334a,
          hovered ? 3 : 1,
        );
      }
    }

    if (!this.renderPackWalls(origin)) this.drawRearWalls(graphics, origin);
    this.renderItems(origin);
    if (!this.renderPetSprite(origin)) this.drawBuddy(graphics, origin);
  }

  private drawRearWalls(graphics: Phaser.GameObjects.Graphics, origin: Phaser.Math.Vector2): void {
    const corners = [
      this.project({ x: 0, y: 0 }),
      this.project({ x: this.room.width - 1, y: 0 }),
      this.project({ x: this.room.width - 1, y: this.room.height - 1 }),
      this.project({ x: 0, y: this.room.height - 1 }),
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
    const point = this.project(cell);
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

  /** Catalog texture for a brush material, or null when running on placeholders. */
  private floorTextureKey(material: string): string | null {
    const id = this.brushFloors.get(material as HomeBrush);
    if (!id) return null;
    const key = `floor:${id}`;
    return this.textures.exists(key) ? key : null;
  }

  private strokeDiamond(graphics: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    graphics.beginPath();
    graphics.moveTo(cx, cy - TILE_HEIGHT / 2);
    graphics.lineTo(cx + TILE_WIDTH / 2, cy);
    graphics.lineTo(cx, cy + TILE_HEIGHT / 2);
    graphics.lineTo(cx - TILE_WIDTH / 2, cy);
    graphics.closePath();
    graphics.strokePath();
  }

  /**
   * Dress the two rear walls from the pack.
   *
   * Which walls are rear depends on the camera corner, so this asks the domain
   * rather than assuming north/west -- assuming would leave walls floating in
   * front of the room on half the rotations.
   */
  private renderPackWalls(origin: Phaser.Math.Vector2): boolean {
    const wall = this.pack?.walls[0];
    if (!wall) return false;
    const westKey = `wall:${wall.id}:west`;
    const northKey = `wall:${wall.id}:north`;
    if (!this.textures.exists(westKey) || !this.textures.exists(northKey)) return false;

    const bands = wallDepthBands(this.room.cameraCorner);
    const cells = wallCells(this.room.width, this.room.height);
    const place = (cell: GridCell, key: string, worldWall: "west" | "north") => {
      const point = this.project(cell);
      const band = (bands[worldWall] as { z: number }).z;
      const image = this.add.image(origin.x + point.x, origin.y + point.y, key);
      // Wall art is drawn from the cell it occupies; the donor's tileset
      // registration already carries the rise, so no manual offset is applied.
      image.setOrigin(0.5, 1);
      image.setDepth(band + point.y);
      this.sprites.push(image);
    };

    for (const cell of cells.left) place(cell, westKey, "west");
    for (const cell of cells.right) place(cell, northKey, "north");
    return true;
  }

  /** Furniture placed in the room document, depth-sorted with the floor. */
  private renderItems(origin: Phaser.Math.Vector2): void {
    if (!this.pack) return;
    const byId = new Map(this.pack.items.map((item) => [item.id, item]));
    for (const placed of this.room.items) {
      const item = byId.get(placed.assetId.replace(/^asset:/, "")) ?? byId.get(placed.assetId);
      if (!item) continue;
      const key = `item:${item.id}`;
      if (!this.textures.exists(key)) continue;
      const anchorCell = placed.placement.anchor;
      const point = this.project(anchorCell);
      const image = this.add.image(origin.x + point.x, origin.y + point.y, key);
      // `anchor` is the fraction of sprite height sitting below the tile centre.
      image.setOrigin(0.5, item.anchor);
      image.setScale(item.scale * (placed.placement.scale ?? 1));
      image.setDepth(ITEM_BAND + point.y);
      this.sprites.push(image);
    }
  }

  /** The real installed Buddy, standing in the middle of the room. */
  private renderPetSprite(origin: Phaser.Math.Vector2): boolean {
    if (!this.pet || !this.textures.exists("home-pet")) return false;
    const cell = { x: Math.floor(this.room.width / 2), y: Math.floor(this.room.height / 2) };
    const ground = floorGroundPosition(rotateCanonicalCell(cell, this.room, this.room.cameraCorner));
    const point = this.project(cell);
    const x = origin.x + ground.x;
    const y = origin.y + ground.y;

    if (!this.petSprite) {
      const first = this.pet.idleRow * this.pet.columns;
      this.petSprite = this.add.sprite(x, y, "home-pet", first);
      this.petSprite.setOrigin(0.5, 0.92);
      this.petSprite.setScale(this.pet.scale * 0.45);
      if (!this.anims.exists("home-pet-idle")) {
        this.anims.create({
          key: "home-pet-idle",
          frames: this.anims.generateFrameNumbers("home-pet", {
            start: first,
            end: first + this.pet.idleFrames - 1,
          }),
          frameRate: this.pet.idleFps,
          repeat: -1,
        });
      }
      this.petSprite.play("home-pet-idle");
    }
    this.petSprite.setPosition(x, y);
    this.petSprite.setDepth(ITEM_BAND + point.y + 1);
    return true;
  }

  /**
   * Cell -> room-local pixels, via the ported donor mapping.
   *
   * Rotation happens by rotating the CANONICAL CELL and then projecting, which
   * is what the donor does: camera orbit rebuilds from canonical cells rather
   * than renaming walls or re-deriving the projection per view.
   */
  private project(cell: GridCell): { x: number; y: number } {
    return mapToLocal(rotateCanonicalCell(cell, this.room, this.room.cameraCorner));
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
        const point = this.project(cell);
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
  const scene = new PhaserHomeScene(options.onStateChange, options.pack ?? null, options.pet ?? null);
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
