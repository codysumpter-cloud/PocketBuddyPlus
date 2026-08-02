// SPDX-License-Identifier: LGPL-2.1-or-later
//
// Copyright (C) the openc2e project and contributors.
// Copyright (C) 2026 Prismtek (TypeScript port).
//
// Derived from `buddy_biology_chemical_pool.gd` in
// prismtek-apps/packages/godot/prismtek-buddy-core/addons/prismtek_buddy_core/life/,
// itself a port of behavioural algorithms and data structures from the openc2e
// project (https://github.com/openc2e/openc2e), reviewed upstream revision
// 6a4396c83152fe9f9152be924b5a8edc8e759a6a.
//
// Modified by Prismtek on 2026-08-02: translated from GDScript to TypeScript.
// Constants, loci, equations and clamping order are preserved; no algorithmic
// change is intended.
//
// This library is free software; you can redistribute it and/or modify it under
// the terms of the GNU Lesser General Public License as published by the Free
// Software Foundation; either version 2.1 of the License, or (at your option)
// any later version.
//
// This library is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
// FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more
// details.
/**
 * Compact C2e-compatible chemistry store.
 *
 * openc2e models C2e creatures with 256 normalized chemicals. Chemical 0 is the
 * sentinel/no-op slot; ATP, ADP and Injury are the engine's hard-coded 35, 36
 * and 127 loci. This port keeps the same boundaries and half-life equation while
 * remaining host-engine independent and serializable inside Buddy state.
 */
export const CHEMICAL_COUNT = 256;
export const ATP_ID = 35;
export const ADP_ID = 36;
export const INJURY_ID = 127;
/**
 * C2e's reward and punishment loci. Per the donor's note, these are what make a
 * Buddy learn from an outcome rather than merely react to it: they are chemicals
 * rather than a function argument on purpose, so they linger and decay, letting
 * credit reach the wiring that fired shortly BEFORE the outcome arrived.
 */
export const REWARD_ID = 78;
export const PUNISHMENT_ID = 79;
function clamp01(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.min(1, Math.max(0, value));
}
function clampInt(value, min, max) {
    if (!Number.isFinite(value))
        return min;
    return Math.min(max, Math.max(min, Math.trunc(value)));
}
export class BuddyBiologyChemicalPool {
    /** Normalized [0,1] concentrations, one per chemical id. */
    concentrations = new Float32Array(CHEMICAL_COUNT);
    /** Encoded half-life rates, 0..255. */
    halfLives = new Uint8Array(CHEMICAL_COUNT);
    constructor() {
        // Donor `_init`: 255 is long-lived; a zero half-life intentionally clears
        // the chemical on the next tick.
        this.halfLives.fill(255);
    }
    /**
     * Donor `_valid_id`: `chemical_id > 0 and chemical_id < CHEMICAL_COUNT`.
     *
     * Chemical zero is the Creatures genome sentinel and NEVER stores a value, so
     * it is rejected for reads and writes alike -- not merely skipped by the decay
     * loop. Using `>= 0` here was a real translation bug caught by the Godot
     * cross-runtime oracle, which a constants-only test could not have found.
     */
    static validId(chemicalId) {
        return Number.isInteger(chemicalId) && chemicalId > 0 && chemicalId < CHEMICAL_COUNT;
    }
    concentration(chemicalId) {
        if (!BuddyBiologyChemicalPool.validId(chemicalId))
            return 0;
        return this.concentrations[chemicalId];
    }
    setConcentration(chemicalId, value) {
        if (!BuddyBiologyChemicalPool.validId(chemicalId))
            return;
        this.concentrations[chemicalId] = clamp01(value);
    }
    adjust(chemicalId, delta) {
        this.setConcentration(chemicalId, this.concentration(chemicalId) + delta);
    }
    halfLife(chemicalId) {
        if (!BuddyBiologyChemicalPool.validId(chemicalId))
            return 0;
        return this.halfLives[chemicalId];
    }
    setHalfLife(chemicalId, encodedRate) {
        if (!BuddyBiologyChemicalPool.validId(chemicalId))
            return;
        this.halfLives[chemicalId] = clampInt(encodedRate, 0, 255);
    }
    /**
     * Donor `tick_half_lives`. Matches the C2e equation used by openc2e:
     *   rate = 1 - 0.5 ** (1 / 2.2 ** (encoded * 32 / 255))
     *
     * Chemical 0 is skipped (sentinel slot), and an encoded rate of 0 clears the
     * chemical outright rather than decaying it.
     */
    tickHalfLives(steps = 1) {
        const stepCount = Math.max(Number.isFinite(steps) ? Math.trunc(steps) : 0, 0);
        for (let step = 0; step < stepCount; step += 1) {
            for (let chemicalId = 1; chemicalId < CHEMICAL_COUNT; chemicalId += 1) {
                const encoded = this.halfLives[chemicalId];
                if (encoded === 0) {
                    this.concentrations[chemicalId] = 0;
                    continue;
                }
                const exponent = (encoded * 32) / 255;
                const decayRate = 1 - Math.pow(0.5, 1 / Math.pow(2.2, exponent));
                const current = this.concentrations[chemicalId];
                this.concentrations[chemicalId] = clamp01(current - current * decayRate);
            }
        }
    }
    toData() {
        return {
            concentrations: Array.from(this.concentrations),
            half_lives: Array.from(this.halfLives),
        };
    }
    static fromData(data) {
        const pool = new BuddyBiologyChemicalPool();
        if (typeof data !== "object" || data === null)
            return pool;
        const record = data;
        if (Array.isArray(record.concentrations)) {
            record.concentrations.slice(0, CHEMICAL_COUNT).forEach((value, index) => {
                if (typeof value === "number")
                    pool.setConcentration(index, value);
            });
        }
        if (Array.isArray(record.half_lives)) {
            record.half_lives.slice(0, CHEMICAL_COUNT).forEach((value, index) => {
                if (typeof value === "number")
                    pool.setHalfLife(index, value);
            });
        }
        return pool;
    }
}
