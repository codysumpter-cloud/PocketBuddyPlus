/** Declares an unsupported API version; must be rejected. */
export function createLifeModule() {
  return {
    identity: { apiVersion: 99, implementationVersion: "x", sourceRevision: "x", name: "too-new", license: "LGPL-2.1-or-later", supportedSchemas: [], capabilities: [] },
    createCreature: () => ({}), loadCreature: () => ({}), advance: () => ({}),
    applyStimulus: () => ({}), submitOutcome: () => ({}), snapshot: () => ({}),
    serialize: () => ({}), health: () => ({}),
  };
}
