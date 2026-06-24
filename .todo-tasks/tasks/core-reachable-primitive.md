# Core `reachable` transitive primitive

## Motivation

Data-flow gating (filtering flow through a Rust `match` arm) is inherently
**transitive**: suppressing one arm must hide everything reachable *only* through
it, while keeping nodes still reachable another way. The existing `GraphQuery`
(`packages/core/src/query.ts`) is a flat per-element predicate and can't express
this. We already have `neighborhood()` — a seeded frontier-BFS over
`outgoing`/`incoming` with a visited set — which is exactly this traversal minus
two degrees of freedom (multiple seeds, an edge gate). This phase extracts a
pure, domain-blind `reachable` primitive and collapses `neighborhood` onto it so
we don't ship two BFS implementations.

This is the foundational primitive for the match-gating chain. It must know
nothing about "match", "arm", or "data flow" — those are domain concepts that
enter only through the caller's `seeds` and `edgeAllowed` arguments (downstream
Phase P3).

## Do NOT

- Do NOT put any domain knowledge in `reachable` — no `match`, `arm`, `rust.*`,
  `dataflow`, or kind-name string literals. It takes a graph, seed ids, and a
  generic edge predicate. Meaning belongs to the caller.
- Do NOT mutate the graph or any input. Return new `Set`/arrays only.
- Do NOT use `Date.now()`/`Math.random()` or anything non-deterministic. Map
  iteration order is insertion-stable; preserve deterministic output ordering.
- Do NOT change the public signature/return shape of `neighborhood` (its
  callers and tests must keep passing) — only re-implement its body on top of
  `reachable`.
- Do NOT touch `view.ts`, `types.ts` scene types, or anything outside the query
  module + its tests. Scene wiring is Phase P2; the match caller is Phase P3.

## Plan

### 1. Add `reachable` to `packages/core/src/query.ts`

Export a pure function:

```ts
export function reachable(
  graph: Graph,
  seeds: Iterable<NodeId>,
  opts?: {
    direction?: 'out' | 'in' | 'both';      // default 'out'
    edgeAllowed?: (edge: Edge) => boolean;   // default () => true
    maxHops?: number;                         // default Infinity
  }
): Set<NodeId>;
```

Behavior:
- Seed the visited set with every seed id that exists in `graph.nodes` (skip
  unknown ids, mirroring `neighborhood`'s `graph.nodes.has` guard).
- Frontier-BFS: for each frontier node, walk `graph.outgoing` when direction is
  `'out'`/`'both'` and `graph.incoming` when `'in'`/`'both'`. For each candidate
  edge, skip it when `edgeAllowed(edge)` is false; otherwise add the other
  endpoint (`edge.to` for outgoing, `edge.from` for incoming) to the visited set
  and next frontier if unseen.
- Stop after `maxHops` expansions or when the frontier empties.
- Return the visited `Set<NodeId>` (includes the seeds themselves).

Keep it allocation-disciplined like `neighborhood` (Set-based frontier, single
`visited`). Add a short doc comment in the same style as the surrounding
exports.

### 2. Re-implement `neighborhood` on top of `reachable`

`neighborhood(graph, id, hops)` currently returns `{ nodes, edges }` and
traverses both directions unconditionally collecting visited edges. Refactor so
the node-visitation uses `reachable(graph, [id], { direction: 'both', maxHops:
hops })` for the node set, then derive the edge set from the visited nodes (an
edge is included when both endpoints are visited, matching current semantics —
verify against the existing test expectations and adjust the derivation if the
current behavior includes boundary edges). The public signature and return shape
must not change.

If exactly preserving `neighborhood`'s edge-collection semantics through
`reachable` proves awkward (e.g. it collects frontier-crossing edges that the
node-only `reachable` discards), keep `reachable` as the node-reachability core
and collect edges in a thin wrapper inside `neighborhood` — do not contort
`reachable`'s return type to carry edges.

### 3. Tests

Add a `reachable` test block to `packages/core/tests/query.test.ts` matching the
existing assertion style. Cover:
- single seed, default `direction: 'out'`, linear chain → full downstream set.
- `edgeAllowed` gate that suppresses one edge → downstream-only-via-that-edge
  nodes excluded, but a node reachable by a second path still included
  (the transitive correctness case the whole chain depends on).
- `direction: 'in'` and `'both'`.
- `maxHops` bound.
- unknown seed id skipped; empty seeds → empty set.
- determinism: same inputs → identical ordering when spread to an array.

Confirm the existing `neighborhood` tests still pass unchanged.

## Files to Modify

- `packages/core/src/query.ts` — add `reachable`; re-implement `neighborhood` on it.
- `packages/core/tests/query.test.ts` — add `reachable` coverage; keep `neighborhood` tests green.

## Verification

```bash
pnpm -C packages/core exec vitest run query
just typecheck-core
```

## Out of Scope

- Scene/view integration (Phase P2).
- Any match/arm/dataflow domain logic or the gating caller (Phase P3).
- A generic `GraphQuery`-driven transitive operator — only the imperative
  `reachable` primitive is in scope.

## Notes

- Reviewer watch: ensure no domain string literals leaked into `reachable`, and
  that `neighborhood`'s return shape is byte-identical to before.

## Surface after this phase

- `reachable(graph: Graph, seeds: Iterable<NodeId>, opts?: { direction?: 'out' |
  'in' | 'both'; edgeAllowed?: (edge: Edge) => boolean; maxHops?: number }):
  Set<NodeId>` — exported from `packages/core/src/query.ts`. Pure, domain-blind,
  deterministic. Returns the set of node ids reachable from the seeds under the
  given direction/edge-gate/hop bound, including the seeds.
- `neighborhood` keeps its existing signature and `{ nodes, edges }` return
  shape, now implemented over `reachable`.
- Negative space: `reachable` contains NO domain vocabulary. `view.ts`,
  `SceneGraph`, and all scene consumers are unchanged by this phase.
