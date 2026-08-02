/** A minimal COMPATIBLE replacement module, proving the LGPL replacement right. */
const snapshot = (id, secs) => ({
  schema: "pbp-buddy-life-v1", creatureId: id, simulationSeconds: secs,
  chemicals: { atp: 0.5, injury: 0, reward: 0, punishment: 0 },
  diagnostics: { implementation: "fake-compatible" },
});
export function createLifeModule() {
  let id = "", secs = 0;
  return {
    identity: {
      apiVersion: 1, implementationVersion: "9.9.9-fake",
      sourceRevision: "fake-revision", name: "fake-compatible",
      license: "LGPL-2.1-or-later", supportedSchemas: ["pbp-buddy-life-v1"],
      capabilities: ["chemistry"],
    },
    createCreature: (r) => { id = r.creatureId; return snapshot(id, secs); },
    loadCreature: () => snapshot(id, secs),
    advance: (r) => { secs += Math.max(r.elapsedSeconds, 0); return { snapshot: snapshot(id, secs), events: [] }; },
    applyStimulus: () => ({ snapshot: snapshot(id, secs), events: [] }),
    submitOutcome: () => ({ snapshot: snapshot(id, secs), events: [] }),
    snapshot: () => snapshot(id, secs),
    serialize: () => ({ schema: "pbp-buddy-life-v1", creatureId: id }),
    health: () => ({ ok: true, identity: { apiVersion: 1 }, initialized: true, details: {} }),
  };
}
