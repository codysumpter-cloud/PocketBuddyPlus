/** Right version, missing required methods; must be rejected. */
export function createLifeModule() {
  return { identity: { apiVersion: 1, implementationVersion: "x", sourceRevision: "x", name: "partial", license: "LGPL-2.1-or-later", supportedSchemas: [], capabilities: [] }, snapshot: () => ({}) };
}
