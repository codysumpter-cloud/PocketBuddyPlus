// A very small Phaser-shaped engine backed by a plain 2D canvas.
//
// Home used to run on Phaser. Phaser cannot come into a plugin panel: the
// minified build is 1.31 MB against a 1.00 MB panel cap, and there is no script
// asset kind, so panel JavaScript has to be inline. But Home only ever used
// Phaser as a canvas wrapper - one Graphics object, pointer and keyboard input,
// a resize hook, and a 1 Hz timer. Seventeen draw calls in total.
//
// So rather than rewrite ~750 lines of drawing and picking code against a
// different API (and risk changing what the room looks like), this reproduces
// the slice of Phaser that Home actually touched. The scene code moved over
// unchanged.
//
// Faithfulness notes, where Phaser's semantics are not simply canvas's:
//   - `fillStyle`/`lineStyle` take 0xRRGGBB numbers plus a separate alpha.
//   - `fillCircle`/`fillRect`/`strokeCircle`/`strokeRect` draw immediately and
//     do NOT disturb a path being built with `beginPath`/`moveTo`/`lineTo`.
//     Paths are built into a `Path2D` rather than into the context so the two
//     cannot interfere. No current call site interleaves them, so this is
//     defensive - it keeps the shim safe for drawing code added later.
//   - `strokePath`/`fillPath` render the current path without clearing it,
//     which is why `drawDiamond` can fill and then stroke the same diamond.

function css(color: number, alpha: number): string {
  const value = Math.max(0, Math.min(0xffffff, Math.trunc(color)));
  return `rgba(${(value >> 16) & 0xff}, ${(value >> 8) & 0xff}, ${value & 0xff}, ${Math.max(0, Math.min(1, alpha))})`;
}

/** The Phaser `GameObjects.Graphics` surface Home uses. */
export class Graphics {
  private path = new Path2D();

  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  clear(): this {
    const { canvas } = this.ctx;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.path = new Path2D();
    return this;
  }

  fillStyle(color: number, alpha = 1): this {
    this.ctx.fillStyle = css(color, alpha);
    return this;
  }

  lineStyle(width: number, color: number, alpha = 1): this {
    this.ctx.lineWidth = width;
    this.ctx.strokeStyle = css(color, alpha);
    return this;
  }

  beginPath(): this {
    this.path = new Path2D();
    return this;
  }

  moveTo(x: number, y: number): this {
    this.path.moveTo(x, y);
    return this;
  }

  lineTo(x: number, y: number): this {
    this.path.lineTo(x, y);
    return this;
  }

  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise = false): this {
    this.path.arc(x, y, radius, startAngle, endAngle, anticlockwise);
    return this;
  }

  closePath(): this {
    this.path.closePath();
    return this;
  }

  fillPath(): this {
    this.ctx.fill(this.path);
    return this;
  }

  strokePath(): this {
    this.ctx.stroke(this.path);
    return this;
  }

  fillRect(x: number, y: number, width: number, height: number): this {
    this.ctx.fillRect(x, y, width, height);
    return this;
  }

  strokeRect(x: number, y: number, width: number, height: number): this {
    this.ctx.strokeRect(x, y, width, height);
    return this;
  }

  fillCircle(x: number, y: number, radius: number): this {
    const circle = new Path2D();
    circle.arc(x, y, Math.max(0, radius), 0, Math.PI * 2);
    this.ctx.fill(circle);
    return this;
  }

  strokeCircle(x: number, y: number, radius: number): this {
    const circle = new Path2D();
    circle.arc(x, y, Math.max(0, radius), 0, Math.PI * 2);
    this.ctx.stroke(circle);
    return this;
  }
}

export class Vector2 {
  constructor(public x: number, public y: number) {}
}

export interface Pointer {
  readonly x: number;
  readonly y: number;
  readonly isDown: boolean;
}

type Handler = (...args: never[]) => void;

/** Phaser's emitter shape, including the `context` argument `off` needs. */
export class Emitter {
  private readonly handlers = new Map<string, { handler: Handler; context: unknown }[]>();

  on(event: string, handler: Handler, context?: unknown): void {
    const list = this.handlers.get(event) ?? [];
    list.push({ handler, context });
    this.handlers.set(event, list);
  }

  once(event: string, handler: Handler, context?: unknown): void {
    const wrapped = ((...args: never[]) => {
      this.off(event, wrapped, context);
      handler.apply(context, args);
    }) as Handler;
    this.on(event, wrapped, context);
  }

  off(event: string, handler?: Handler, context?: unknown): void {
    if (!handler) { this.handlers.delete(event); return; }
    const list = (this.handlers.get(event) ?? []).filter((entry) => entry.handler !== handler || (context !== undefined && entry.context !== context));
    this.handlers.set(event, list);
  }

  emit(event: string, ...args: unknown[]): void {
    // Copy first: a handler that calls `off` (SHUTDOWN does) must not shorten
    // the list mid-iteration and skip the next handler.
    for (const entry of [...(this.handlers.get(event) ?? [])]) entry.handler.apply(entry.context, args as never[]);
  }
}

export interface SceneScale {
  readonly width: number;
  readonly height: number;
  on(event: "resize", handler: Handler, context?: unknown): void;
}

/** Base class matching the `Phaser.Scene` members Home relies on. */
export abstract class Scene {
  add!: { graphics(): Graphics };
  input!: { on(event: string, handler: Handler, context?: unknown): void; keyboard?: Emitter };
  scale!: SceneScale;
  time!: { addEvent(config: { delay: number; loop?: boolean; callback: () => void }): { remove(): void } };
  events = new Emitter();
  game!: { events: Emitter };

  abstract create(): void;
}

export const SHUTDOWN = "shutdown";
export const RESIZE = "resize";

export interface EngineHandle {
  readonly events: Emitter;
  destroy(): void;
}

/**
 * Mount a scene onto a canvas inside `parent`, wiring the input, resize and
 * timer plumbing Phaser used to provide.
 */
export function mountScene(parent: HTMLElement, scene: Scene, backgroundColor = "#182033"): EngineHandle {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
  canvas.tabIndex = 0;
  parent.append(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Home needs a 2D canvas context.");

  const scaleEvents = new Emitter();
  const gameEvents = new Emitter();
  const keyboard = new Emitter();
  const pointerEvents = new Emitter();
  const graphics = new Graphics(ctx);
  const timers: number[] = [];
  let pointerDown = false;
  let width = 0;
  let height = 0;

  // The scene draws in CSS pixels; scale the backing store so the room is not
  // blurry on a retina display, and keep pixel art crisp.
  // A `const` arrow, not a hoisted declaration: hoisting would discard the
  // narrowing from the null check above, since the body could run before it.
  const resize = (): void => {
    const ratio = window.devicePixelRatio || 1;
    width = Math.max(320, parent.clientWidth);
    height = Math.max(320, parent.clientHeight);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.imageSmoothingEnabled = false;
    scaleEvents.emit(RESIZE);
  };

  const scale: SceneScale = {
    get width() { return width; },
    get height() { return height; },
    on(event, handler, context) { scaleEvents.on(event, handler, context); },
  };

  function pointerAt(event: PointerEvent): Pointer {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, isDown: pointerDown };
  }

  const onPointerMove = (event: PointerEvent) => pointerEvents.emit("pointermove", pointerAt(event));
  const onPointerDown = (event: PointerEvent) => {
    pointerDown = true;
    canvas.focus();
    pointerEvents.emit("pointerdown", pointerAt(event));
  };
  const onPointerUp = (event: PointerEvent) => {
    pointerDown = false;
    pointerEvents.emit("pointerup", pointerAt(event));
  };
  const onKeyDown = (event: KeyboardEvent) => keyboard.emit("keydown", event);

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  // On window, so releasing outside the canvas still ends a paint drag.
  window.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("keydown", onKeyDown);

  const observer = new ResizeObserver(() => resize());
  observer.observe(parent);

  scene.add = {
    graphics: () => {
      // Phaser clears the frame for you; a bare canvas does not, so repaint the
      // background on every clear or the room would smear as it redraws.
      const wrapped = graphics.clear.bind(graphics);
      graphics.clear = () => {
        wrapped();
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);
        return graphics;
      };
      return graphics;
    },
  };
  scene.input = { on: (event, handler, context) => pointerEvents.on(event, handler, context), keyboard };
  scene.scale = scale;
  scene.time = {
    addEvent: ({ delay, loop, callback }) => {
      const id = loop === false ? window.setTimeout(callback, delay) : window.setInterval(callback, delay);
      timers.push(id);
      return { remove: () => { window.clearInterval(id); window.clearTimeout(id); } };
    },
  };
  scene.game = { events: gameEvents };

  resize();
  scene.create();

  return {
    events: gameEvents,
    destroy() {
      scene.events.emit(SHUTDOWN);
      for (const id of timers) { window.clearInterval(id); window.clearTimeout(id); }
      observer.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("keydown", onKeyDown);
      canvas.remove();
    },
  };
}
