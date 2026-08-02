// SPDX-License-Identifier: LGPL-2.1-or-later
//
// Copyright (C) the openc2e project and contributors.
// Copyright (C) 2026 Prismtek (TypeScript port).
//
// See NOTICE and LICENSE in this package. Derived from openc2e via the Prismtek
// Buddy Core life/ module, reviewed upstream revision
// 6a4396c83152fe9f9152be924b5a8edc8e759a6a.
//
// This library is free software; you can redistribute it and/or modify it under
// the terms of the GNU Lesser General Public License, version 2.1 or later. It is
// distributed WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.

/**
 * The narrow, versioned boundary between the MIT host and this LGPL module.
 *
 * Everything crossing it is plain JSON-compatible data: commands in, snapshots
 * and events out. That is what makes this module independently replaceable, as
 * the LGPL requires -- a user can build their own implementation of
 * `BuddyLifeModule` and run Pocket Buddy+ against it.
 *
 * Deliberately absent, and never to be added: filesystem handles, provider
 * credentials, plugin authority, scene/window authority, network clients, command
 * execution, and raw Electron objects. The module proposes physiological state
 * and bounded intents; the Electron main process validates and executes. There is
 * exactly one authoritative Buddy identity and one authoritative save, and both
 * belong to the host.
 */

/** Bumped only on a breaking change to this interface. */
export const LIFE_MODULE_API_VERSION = 1;

export interface LifeModuleIdentity {
  /** Must equal LIFE_MODULE_API_VERSION or the host refuses to load. */
  readonly apiVersion: number;
  /** Implementation's own version, free-form. */
  readonly implementationVersion: string;
  /** Upstream revision this implementation was derived from, for diagnostics. */
  readonly sourceRevision: string;
  readonly name: string;
  readonly license: string;
  readonly supportedSchemas: readonly string[];
  readonly capabilities: readonly string[];
}

export interface CreateCreatureRequest {
  readonly creatureId: string;
  /** Deterministic seed. Identical seed + inputs must give identical output. */
  readonly seed: number;
  readonly schema: string;
}

export interface AdvanceRequest {
  /** Fixed simulation time to advance, in seconds. Negative is floored to zero. */
  readonly elapsedSeconds: number;
}

export interface StimulusRequest {
  readonly kind: string;
  /** Normalized magnitude, clamped by the implementation. */
  readonly magnitude?: number;
  readonly chemicalId?: number;
}

/** Result of a host-executed action, fed back so the module can learn from it. */
export interface HostOutcomeRequest {
  readonly action: string;
  readonly succeeded: boolean;
  readonly reward?: number;
  readonly punishment?: number;
}

export interface LifeEvent {
  readonly type: string;
  readonly at: number;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface LifeSnapshot {
  readonly schema: string;
  readonly creatureId: string;
  readonly simulationSeconds: number;
  readonly chemicals: Readonly<Record<string, number>>;
  readonly diagnostics: Readonly<Record<string, unknown>>;
}

export interface LifeModuleError {
  readonly code: "unsupported_schema" | "invalid_request" | "not_initialized" | "internal";
  readonly message: string;
}

export interface LifeModuleHealth {
  readonly ok: boolean;
  readonly identity: LifeModuleIdentity;
  readonly initialized: boolean;
  readonly details: Readonly<Record<string, unknown>>;
}

/**
 * The replaceable surface. A conforming implementation is a plain object; the
 * host never passes it anything but JSON-compatible values.
 */
export interface BuddyLifeModule {
  readonly identity: LifeModuleIdentity;
  createCreature(request: CreateCreatureRequest): LifeSnapshot;
  loadCreature(serialized: unknown): LifeSnapshot;
  advance(request: AdvanceRequest): { snapshot: LifeSnapshot; events: readonly LifeEvent[] };
  applyStimulus(request: StimulusRequest): { snapshot: LifeSnapshot; events: readonly LifeEvent[] };
  submitOutcome(request: HostOutcomeRequest): { snapshot: LifeSnapshot; events: readonly LifeEvent[] };
  snapshot(): LifeSnapshot;
  serialize(): unknown;
  health(): LifeModuleHealth;
}

/**
 * Structural validation of a candidate implementation.
 *
 * The host uses this before trusting a replacement module, so a malformed or
 * version-mismatched implementation is rejected cleanly instead of corrupting
 * the save. Returns null when acceptable.
 */
export function validateLifeModule(candidate: unknown): LifeModuleError | null {
  if (typeof candidate !== "object" || candidate === null) {
    return { code: "invalid_request", message: "life module must be an object" };
  }
  const module = candidate as Partial<BuddyLifeModule>;
  const identity = module.identity;
  if (typeof identity !== "object" || identity === null) {
    return { code: "invalid_request", message: "life module is missing `identity`" };
  }
  if (identity.apiVersion !== LIFE_MODULE_API_VERSION) {
    return {
      code: "invalid_request",
      message: `life module API version ${String(identity.apiVersion)} is not supported (host expects ${LIFE_MODULE_API_VERSION})`,
    };
  }
  for (const method of ["createCreature", "loadCreature", "advance", "applyStimulus", "submitOutcome", "snapshot", "serialize", "health"] as const) {
    if (typeof module[method] !== "function") {
      return { code: "invalid_request", message: `life module is missing method \`${method}\`` };
    }
  }
  return null;
}
