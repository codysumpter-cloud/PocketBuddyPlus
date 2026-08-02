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
 * The bundled implementation of `BuddyLifeModule`.
 *
 * This is the default the host loads. It is deliberately a thin, replaceable
 * wrapper over the ported subsystems, so a user exercising their LGPL right to
 * modify can swap it for their own build without touching the MIT host.
 *
 * Only the subsystems actually ported so far are wired up; `capabilities`
 * reports exactly that, so the host never assumes more than exists.
 */
import { ATP_ID, BuddyBiologyChemicalPool, CHEMICAL_COUNT, INJURY_ID, PUNISHMENT_ID, REWARD_ID, } from "./chemical-pool.js";
import { LIFE_MODULE_API_VERSION, } from "./contract.js";
export const LIFE_SCHEMA = "pbp-buddy-life-v1";
/** Fixed simulation step, matching the donor's 0.2s biological tick. */
export const TICK_SECONDS = 0.2;
/** Bounded catch-up: a machine asleep for a week must not spin for hours. */
export const MAX_CATCHUP_TICKS = 60 * 60 * 12 / TICK_SECONDS;
export const referenceIdentity = {
    apiVersion: LIFE_MODULE_API_VERSION,
    implementationVersion: "3.3.0",
    sourceRevision: "6a4396c83152fe9f9152be924b5a8edc8e759a6a",
    name: "@open-pets/buddy-life-lgpl (bundled)",
    license: "LGPL-2.1-or-later",
    supportedSchemas: [LIFE_SCHEMA],
    // Only what is genuinely implemented. Extended as subsystems land.
    capabilities: ["chemistry", "half-life-decay", "reinforcement-chemistry"],
};
export class ReferenceBuddyLifeModule {
    identity = referenceIdentity;
    chemicals = new BuddyBiologyChemicalPool();
    creatureId = "";
    simulationSeconds = 0;
    initialized = false;
    carrySeconds = 0;
    createCreature(request) {
        if (!request || typeof request.creatureId !== "string" || request.creatureId.trim() === "") {
            throw new Error("createCreature requires a non-empty creatureId");
        }
        if (request.schema !== LIFE_SCHEMA) {
            throw new Error(`unsupported schema "${request.schema}" (expected ${LIFE_SCHEMA})`);
        }
        this.chemicals = new BuddyBiologyChemicalPool();
        this.creatureId = request.creatureId;
        this.simulationSeconds = 0;
        this.carrySeconds = 0;
        this.initialized = true;
        return this.snapshot();
    }
    loadCreature(serialized) {
        if (typeof serialized !== "object" || serialized === null) {
            throw new Error("loadCreature requires an object");
        }
        const record = serialized;
        if (record.schema !== LIFE_SCHEMA) {
            throw new Error(`unsupported schema "${String(record.schema)}" (expected ${LIFE_SCHEMA})`);
        }
        this.chemicals = BuddyBiologyChemicalPool.fromData(record.chemicals);
        this.creatureId = typeof record.creatureId === "string" ? record.creatureId : "";
        this.simulationSeconds = typeof record.simulationSeconds === "number" && Number.isFinite(record.simulationSeconds)
            ? Math.max(record.simulationSeconds, 0)
            : 0;
        this.carrySeconds = 0;
        this.initialized = true;
        return this.snapshot();
    }
    /**
     * Deterministic fixed-step advancement. Elapsed time is accumulated and
     * consumed in whole TICK_SECONDS steps, so 600x1s and 1x600s produce the same
     * state -- simulation correctness never depends on how often the host calls.
     */
    advance(request) {
        this.requireInitialized();
        const raw = Number(request?.elapsedSeconds);
        const elapsed = Math.max(Number.isFinite(raw) ? raw : 0, 0);
        this.carrySeconds += elapsed;
        let ticks = Math.floor(this.carrySeconds / TICK_SECONDS);
        this.carrySeconds -= ticks * TICK_SECONDS;
        const events = [];
        if (ticks > MAX_CATCHUP_TICKS) {
            events.push({
                type: "life.catchup.clamped",
                at: this.simulationSeconds,
                data: { requestedTicks: ticks, appliedTicks: MAX_CATCHUP_TICKS },
            });
            ticks = MAX_CATCHUP_TICKS;
        }
        if (ticks > 0) {
            this.chemicals.tickHalfLives(ticks);
            this.simulationSeconds += ticks * TICK_SECONDS;
            events.push({ type: "life.advanced", at: this.simulationSeconds, data: { ticks } });
        }
        return { snapshot: this.snapshot(), events };
    }
    applyStimulus(request) {
        this.requireInitialized();
        if (!request || typeof request.kind !== "string")
            throw new Error("applyStimulus requires a kind");
        const magnitude = Number.isFinite(Number(request.magnitude)) ? Number(request.magnitude) : 0;
        const events = [];
        if (typeof request.chemicalId === "number") {
            this.chemicals.adjust(request.chemicalId, magnitude);
            events.push({
                type: "life.stimulus.applied",
                at: this.simulationSeconds,
                data: { kind: request.kind, chemicalId: request.chemicalId, magnitude },
            });
        }
        return { snapshot: this.snapshot(), events };
    }
    /**
     * Host-executed action outcomes arrive as reward/punishment CHEMISTRY rather
     * than a direct state write, preserving the donor's model in which credit
     * lingers and decays so it reaches the wiring that fired before the outcome.
     */
    submitOutcome(request) {
        this.requireInitialized();
        if (!request || typeof request.action !== "string")
            throw new Error("submitOutcome requires an action");
        const reward = Number.isFinite(Number(request.reward)) ? Number(request.reward) : 0;
        const punishment = Number.isFinite(Number(request.punishment)) ? Number(request.punishment) : 0;
        if (reward > 0)
            this.chemicals.adjust(REWARD_ID, reward);
        if (punishment > 0)
            this.chemicals.adjust(PUNISHMENT_ID, punishment);
        return {
            snapshot: this.snapshot(),
            events: [{
                    type: "life.outcome.recorded",
                    at: this.simulationSeconds,
                    data: { action: request.action, succeeded: Boolean(request.succeeded), reward, punishment },
                }],
        };
    }
    snapshot() {
        return {
            schema: LIFE_SCHEMA,
            creatureId: this.creatureId,
            simulationSeconds: this.simulationSeconds,
            // Bounded: only the named loci cross the boundary, not all 256 slots.
            chemicals: {
                atp: this.chemicals.concentration(ATP_ID),
                injury: this.chemicals.concentration(INJURY_ID),
                reward: this.chemicals.concentration(REWARD_ID),
                punishment: this.chemicals.concentration(PUNISHMENT_ID),
            },
            diagnostics: {
                chemicalCount: CHEMICAL_COUNT,
                tickSeconds: TICK_SECONDS,
                implementation: this.identity.name,
                sourceRevision: this.identity.sourceRevision,
            },
        };
    }
    serialize() {
        return {
            schema: LIFE_SCHEMA,
            creatureId: this.creatureId,
            simulationSeconds: this.simulationSeconds,
            chemicals: this.chemicals.toData(),
        };
    }
    health() {
        return {
            ok: true,
            identity: this.identity,
            initialized: this.initialized,
            details: { simulationSeconds: this.simulationSeconds, carrySeconds: this.carrySeconds },
        };
    }
    requireInitialized() {
        if (!this.initialized)
            throw new Error("life module is not initialized; call createCreature or loadCreature");
    }
}
/** Factory the host looks for when loading a module. */
export function createLifeModule() {
    return new ReferenceBuddyLifeModule();
}
