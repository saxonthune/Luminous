---
title: "ADR: Schema discriminant for node vs edge schemas"
status: accepted
summary: ADR: Schema becomes a discriminated union NodeSchema | EdgeSchema with an optional kind field on the node variant for backwards compatibility
tags: [adr, schema, types, discriminant]
deps: [doc01.03.03, doc01.02.05.01]
---

# ADR: Schema discriminant for node vs edge schemas

## Status

Accepted — implemented in `packages/server-next/src/types.ts`.

## Context

The research session (doc01.03.03) concluded that edges need schemas to express semantics: directionality, tree-layout participation, connection constraints, and visual style. Node schemas already existed as `{name, label, primitives, accepts?}`. The question was how to introduce edge schemas into the same schema registry without breaking every node-schema consumer in the codebase.

Node schemas and edge schemas coexist in `doc.schemas`, a flat `Record<string, Schema>`. Any code that iterates or accesses this table must distinguish the two. Without a discriminant, the only signal is the presence or absence of `primitives` — fragile and implicit.

## Decision

Make `Schema` a discriminated union: `Schema = NodeSchema | EdgeSchema`.

Add a `kind` field to distinguish them:
- `NodeSchema`: `kind?: 'node'` — **optional** for backwards compatibility. Absence means node.
- `EdgeSchema`: `kind: 'edge'` — **required**. There is no backwards-compat edge schema.

The store loader (`store.ts`) injects `kind: 'node'` onto any schema lacking the field on load. Existing canvas files with un-discriminated node schemas load cleanly and round-trip without modification.

Two exported type guards (`packages/server-next/src/types.ts`):

```ts
export function isEdgeSchema(s: Schema): s is EdgeSchema {
  return s.kind === 'edge'
}

export function isNodeSchema(s: Schema): s is NodeSchema {
  return s.kind !== 'edge'
}
```

Call sites that access `schema.primitives` narrow via `isNodeSchema(schema)` before the access. This was a mechanical, finite-list change.

The discriminant pattern matches the existing `PrimitiveDef.type` precedent in the same file — the codebase stays consistent with how it already dispatches on type variants.

## Consequences

**Positive:**
- Existing canvases load unchanged.
- Type narrowing at the access site is mechanical and caught by TypeScript — no silent runtime errors.
- New edge schemas declare `kind: 'edge'` explicitly; the shape is unambiguous.
- The single schema registry stays intact — `doc.schemas` remains the one place to look up any schema.

**Negative:**
- Every code path reading `.primitives` now requires type narrowing, even when the call site has contextual certainty it's a node schema. The overhead is low but non-zero.

## Alternatives Considered

**Required `kind` on both variants.** Rejected: breaks backwards compatibility with existing canvases. Every canvas file would need a migration pass on first load.

**Separate `edgeSchemas` top-level table in the canvas file.** Rejected: violates the single-schema-registry principle established in the data architecture research (doc01.03.03). Two tables means consumers must check two places; a canvas becomes less self-describing.

**`primitives: []` workaround** — no discriminant, edge schemas defined as node schemas with empty primitive lists. Rejected as a kludge: it works short-term but poisons the type model. Every reader of `primitives` must wonder whether an empty array means "it's an edge" or "it's a node with no primitives." The type system can't help.

## References

- Data architecture rationale: doc01.03.03
- Cactus data contract (opaque `schemaName`): doc01.02.05.01
- Implementation: `packages/server-next/src/types.ts`
