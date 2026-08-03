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
/**
 * Structural validation of a candidate implementation.
 *
 * The host uses this before trusting a replacement module, so a malformed or
 * version-mismatched implementation is rejected cleanly instead of corrupting
 * the save. Returns null when acceptable.
 */
export function validateLifeModule(candidate) {
    if (typeof candidate !== "object" || candidate === null) {
        return { code: "invalid_request", message: "life module must be an object" };
    }
    const module = candidate;
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
    for (const method of ["createCreature", "loadCreature", "advance", "applyStimulus", "submitOutcome", "snapshot", "serialize", "health"]) {
        if (typeof module[method] !== "function") {
            return { code: "invalid_request", message: `life module is missing method \`${method}\`` };
        }
    }
    return null;
}
