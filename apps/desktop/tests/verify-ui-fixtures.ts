/**
 * Contract-checked fixtures for the headless UI harness.
 *
 * These are deliberately written in TypeScript and annotated with the REAL
 * exported interfaces, so `tsc` fails the build the moment a fixture drifts from
 * the contract the renderer actually consumes. That is what stops the harness
 * from silently reverting to a false green: a fixture can no longer omit a
 * required field without breaking the type check.
 *
 * Running this file emits the JSON the harness preload serves.
 */
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildClaudeMcpPreview } from "@open-pets/claude";

import type { AgentSetupSnapshot } from "../src/agent-setup.js";
import type { InstalledPetState } from "../src/app-state.js";
import { defaultPetSprite, reactionAnimationMetadata, selectableAnimationMetadata } from "../src/reaction-animation-mapping.js";
import type { LanStatusSnapshot } from "../src/lan-controller.js";
import type { PluginCatalogSnapshot, PluginServiceSnapshot, SafePluginRecord } from "../src/plugin-service.js";
import type { PluginPermission } from "../src/plugin-manifest.js";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * This file runs from .test-dist after compilation, so the app root cannot be a
 * fixed number of levels up. Walk up until the directory that actually holds the
 * harness, which is unambiguous.
 */
function resolveAppDir(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, "scripts", "verify-ui", "main.cjs"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`could not locate the desktop app root from ${start}`);
}

const appDir = resolveAppDir(here);
const fixturesDir = join(appDir, "scripts", "verify-ui", "fixtures");

function write(name: string, value: unknown): void {
  mkdirSync(fixturesDir, { recursive: true });
  writeFileSync(join(fixturesDir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

// --- Integrations -----------------------------------------------------------
// Annotated with AgentSetupSnapshot: tsc enforces every required member.
export const integrations: AgentSetupSnapshot = {
  selectedPetId: "builtin",
  commandMode: "published",
  localDevAvailable: false,
  petOptions: [
    { id: "builtin", displayName: "Professor Hoot", default: true },
    { id: "catalog-fox", displayName: "Ember Fox", default: false },
  ],
  // Real constructor from @open-pets/claude rather than a hand-built literal.
  preview: buildClaudeMcpPreview("builtin", "published", "node"),
  status: {
    state: "needs_setup",
    label: "Needs setup",
    details: "Claude Code was not configured for this companion yet.",
    mcpListWorks: false,
    openPetsEntry: { present: false, source: "none", verified: false, matchesExpected: false },
    canConfigure: true,
    canReplace: false,
    canRemove: false,
  },
  hookStatus: {
    status: "not_installed",
    settingsPath: "/tmp/verify-ui/claude/settings.json",
    exists: false,
    valid: false,
    message: "Hooks are not installed.",
    preview: {},
    asyncSupported: true,
  },
  memoryStatus: {
    status: "not_installed",
    message: "Memory file is not installed.",
    claudeMdPath: "/tmp/verify-ui/claude/CLAUDE.md",
    openPetsMemoryPath: "/tmp/verify-ui/claude/openpets.md",
  },
  opencodeStatus: {
    state: "not_detected",
    label: "Not detected",
    details: "OpenCode was not found on this machine.",
    configDir: "/tmp/verify-ui/opencode",
    canInstall: true,
    canRemove: false,
  },
  opencodePreview: {
    global: true,
    configDir: "/tmp/verify-ui/opencode",
    configPath: "/tmp/verify-ui/opencode/opencode.json",
    cleanupConfigPaths: [],
    mcpCommand: ["npx", "-y", "@open-pets/mcp"],
    plugin: [],
    instructionPath: "/tmp/verify-ui/opencode/AGENTS.md",
    configPreview: {},
  },
  cursorStatus: {
    state: "not_detected",
    label: "Not detected",
    details: "Cursor global MCP config was not found.",
    configPath: "/tmp/verify-ui/cursor/mcp.json",
    canInstall: true,
    canReplace: false,
    canRemove: false,
  },
  cursorPreview: {
    global: true,
    configPath: "/tmp/verify-ui/cursor/mcp.json",
    mcpEntry: {},
    rulesPath: "/tmp/verify-ui/cursor/rules.mdc",
    rulesContent: "",
    commandMode: "published",
  },
  commandPaths: {
    claude: "claude",
    node: "node",
    opencode: "opencode",
  },
  busy: false,
};

// --- Pets -------------------------------------------------------------------
// `source` is a discriminated union of OBJECTS (or absent) -- never a string.
// The Pets route relies on that: it evaluates `p.source && "preview" in p.source`,
// which throws a TypeError if `source` is a primitive. Typing these as
// InstalledPetState is what makes that impossible to get wrong again.
const installedPets: readonly InstalledPetState[] = [
  {
    id: "builtin",
    displayName: "Professor Hoot",
    description: "The bundled companion.",
    builtIn: true,
    protected: true,
    installed: true,
  },
  {
    id: "catalog-fox",
    displayName: "Ember Fox",
    description: "A catalog companion.",
    builtIn: false,
    protected: false,
    installed: true,
    source: { kind: "catalog", catalogVersion: 2, zip: "ember-fox.zip", preview: "" },
  },
  {
    id: "codex-owl",
    displayName: "Codex Owl",
    builtIn: false,
    protected: false,
    installed: true,
    source: { kind: "codex", path: "/tmp/verify-ui/codex/codex-owl" },
  },
];

export const petsState: { preferences: { defaultPetId: string }; pets: { installed: readonly InstalledPetState[] } } = {
  preferences: { defaultPetId: "builtin" },
  pets: { installed: installedPets },
};

// --- Reaction animation settings --------------------------------------------
// Built from the SAME exported metadata the main process uses, so the fixture
// cannot drift from the real reaction/animation catalogue.
export const reactionAnimationSettings = {
  reactions: reactionAnimationMetadata.map((reaction) => ({ ...reaction, label: reaction.id, description: reaction.id })),
  animations: selectableAnimationMetadata.map((animation) => ({ ...animation, label: animation.id, description: animation.id })),
  sprite: defaultPetSprite,
  overrides: {},
  previewSpriteUrl: "openpets-pet-preview://spritesheet/default?v=test-0-0",
};

// --- LAN status --------------------------------------------------------------
// Annotated with the real LanStatusSnapshot so no required member can be missed.
export const lanStatus: LanStatusSnapshot = {
  mode: "off",
  localHost: "verify-ui",
  serverUrl: "",
  port: 0,
  auth: "none",
  authSource: "none",
  authInsecure: false,
  tokenHint: null,
  topologyHosts: 0,
  topologyLinks: 0,
  topologyIssues: [],
  currentHost: null,
  clients: [],
  updatedAt: 0,
  persistedCurrentHost: null,
  persistedUpdatedAt: null,
};

// --- Plugins ----------------------------------------------------------------
// Typed as SafePluginRecord so the compiler demands every member the renderer
// relies on -- notably approvedPermissions, whose absence crashed the Settings
// route with "Cannot read properties of undefined (reading 'includes')".
const pluginRecord = (id: string, name: string, description: string, enabled: boolean, approvedPermissions: readonly PluginPermission[]): SafePluginRecord => ({
  id,
  name,
  description,
  version: "1.0.0",
  source: "catalog",
  bundled: true,
  runtime: "javascript",
  enabled,
  approvedPermissions,
});

export const plugins: PluginServiceSnapshot = {
  plugins: [
    pluginRecord("openpets.focus-buddy", "Focus Buddy", "A pet Pomodoro-style focus timer.", true, ["pet:move", "status"]),
    pluginRecord("openpets.launch-buddy", "Launch Buddy", "A friendly startup greeting.", true, ["status"]),
    pluginRecord("openpets.reminders", "Quick Reminders", "Set short local reminders from the pet menu.", true, ["status"]),
    pluginRecord("openpets.virtual-pet", "Virtual Pet", "Care for a little desktop companion.", false, []),
  ],
};
export const pluginCatalog: PluginCatalogSnapshot = { plugins: [] };

function main(): void {
  write("integrations.json", integrations);
  write("pets-state.json", petsState);
  write("reaction-animation-settings.json", reactionAnimationSettings);
  write("lan-status.json", lanStatus);
  write("plugins.json", plugins);
  write("plugin-catalog.json", pluginCatalog);
  console.log(`verify-ui contract fixtures written to ${fixturesDir}`);
}

main();
