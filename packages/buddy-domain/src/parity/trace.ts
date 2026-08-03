/** A JSON-safe value shared by Godot trace emitters and TypeScript runners. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | { readonly [key: string]: JsonValue } | readonly JsonValue[];

export const PARITY_TRACE_SCHEMA = "prismtek-parity-trace-v1" as const;

export interface ParityTraceStep {
  readonly atMs: number;
  readonly input: JsonValue;
  readonly snapshot: JsonValue;
  readonly events: readonly JsonValue[];
}

export interface ParityTrace {
  readonly schema: typeof PARITY_TRACE_SCHEMA;
  readonly scenarioId: string;
  readonly donor: string;
  readonly implementation: string;
  readonly seed: number;
  readonly steps: readonly ParityTraceStep[];
}

export interface ParityMismatch {
  readonly path: string;
  readonly expected: JsonValue | undefined;
  readonly actual: JsonValue | undefined;
  readonly reason: "type" | "value" | "missing" | "extra" | "length";
}

export interface CompareParityOptions {
  readonly numberEpsilon?: number;
  readonly ignoredPathPrefixes?: readonly string[];
  readonly maxMismatches?: number;
}

function isObject(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shouldIgnore(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`));
}

export function compareParityTraces(
  expected: ParityTrace,
  actual: ParityTrace,
  options: CompareParityOptions = {},
): ParityMismatch[] {
  const epsilon = options.numberEpsilon ?? 1e-9;
  if (!Number.isFinite(epsilon) || epsilon < 0) throw new RangeError("numberEpsilon must be finite and non-negative");
  const ignored = options.ignoredPathPrefixes ?? ["$.implementation"];
  const limit = Math.max(1, Math.trunc(options.maxMismatches ?? 100));
  const mismatches: ParityMismatch[] = [];

  function push(mismatch: ParityMismatch): void {
    if (mismatches.length < limit) mismatches.push(mismatch);
  }

  function walk(expectedValue: JsonValue | undefined, actualValue: JsonValue | undefined, path: string): void {
    if (mismatches.length >= limit || shouldIgnore(path, ignored)) return;
    if (expectedValue === undefined) {
      push({ path, expected: undefined, actual: actualValue, reason: "extra" });
      return;
    }
    if (actualValue === undefined) {
      push({ path, expected: expectedValue, actual: undefined, reason: "missing" });
      return;
    }
    if (typeof expectedValue === "number" && typeof actualValue === "number") {
      if (!Number.isFinite(expectedValue) || !Number.isFinite(actualValue) || Math.abs(expectedValue - actualValue) > epsilon) {
        push({ path, expected: expectedValue, actual: actualValue, reason: "value" });
      }
      return;
    }
    if (Array.isArray(expectedValue) || Array.isArray(actualValue)) {
      if (!Array.isArray(expectedValue) || !Array.isArray(actualValue)) {
        push({ path, expected: expectedValue, actual: actualValue, reason: "type" });
        return;
      }
      if (expectedValue.length !== actualValue.length) {
        push({ path, expected: expectedValue.length, actual: actualValue.length, reason: "length" });
      }
      const length = Math.max(expectedValue.length, actualValue.length);
      for (let index = 0; index < length; index += 1) {
        walk(expectedValue[index], actualValue[index], `${path}[${index}]`);
      }
      return;
    }
    if (isObject(expectedValue) || isObject(actualValue)) {
      if (!isObject(expectedValue) || !isObject(actualValue)) {
        push({ path, expected: expectedValue, actual: actualValue, reason: "type" });
        return;
      }
      const keys = new Set([...Object.keys(expectedValue), ...Object.keys(actualValue)]);
      for (const key of [...keys].sort()) {
        walk(expectedValue[key], actualValue[key], `${path}.${key}`);
      }
      return;
    }
    if (typeof expectedValue !== typeof actualValue) {
      push({ path, expected: expectedValue, actual: actualValue, reason: "type" });
      return;
    }
    if (expectedValue !== actualValue) {
      push({ path, expected: expectedValue, actual: actualValue, reason: "value" });
    }
  }

  walk(expected as unknown as JsonValue, actual as unknown as JsonValue, "$");
  return mismatches;
}

export function assertParityTraces(
  expected: ParityTrace,
  actual: ParityTrace,
  options: CompareParityOptions = {},
): void {
  const mismatches = compareParityTraces(expected, actual, options);
  if (mismatches.length === 0) return;
  const details = mismatches
    .slice(0, 12)
    .map((mismatch) => `${mismatch.path}: ${mismatch.reason} expected=${JSON.stringify(mismatch.expected)} actual=${JSON.stringify(mismatch.actual)}`)
    .join("\n");
  throw new Error(`parity trace mismatch (${mismatches.length})\n${details}`);
}

function cloneJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("parity traces require finite JSON numbers");
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => cloneJson(entry)) as unknown as T;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneJson(entry)])) as unknown as T;
}

export function createParityTrace(options: Omit<ParityTrace, "schema">): ParityTrace {
  if (!options.scenarioId.trim()) throw new Error("scenarioId must be non-empty");
  if (!options.donor.trim()) throw new Error("donor must be non-empty");
  if (!options.implementation.trim()) throw new Error("implementation must be non-empty");
  if (!Number.isSafeInteger(options.seed)) throw new Error("seed must be a safe integer");
  let previous = -1;
  for (const [index, step] of options.steps.entries()) {
    if (!Number.isFinite(step.atMs) || step.atMs < previous) {
      throw new Error(`steps[${index}].atMs must be finite and monotonic`);
    }
    previous = step.atMs;
  }
  return {
    schema: PARITY_TRACE_SCHEMA,
    scenarioId: options.scenarioId,
    donor: options.donor,
    implementation: options.implementation,
    seed: options.seed,
    steps: options.steps.map((step) => ({
      atMs: step.atMs,
      input: cloneJson(step.input),
      snapshot: cloneJson(step.snapshot),
      events: step.events.map((event) => cloneJson(event)),
    })),
  };
}
