# Single resolved node-state in `evaluateView` + generic gating input

## Motivation

`evaluateView(graph, view)` (`packages/core/src/view.ts`) is the one projection
solver that turns a graph + view into a `SceneGraph`. Today it emits parallel
arrays (`spatialNodes`, `latentNodes`). To support gating (dimming non-selected
`match` arms) without reintroducing the anti-pattern we just removed from
cactus — multiple visibility levers the renderer has to reconcile — this phase
makes `evaluateView` resolve **one authoritative state per node in a single
pass**, and accept **one optional generic gating input** that folds into that
same resolution.

Critically, `evaluateView` lives in core and MUST stay domain-blind. It learns
nothing about "match" or "arm". The gating input is a precomputed, generic
demotion set (node ids to drop to `peek`). The match-specific computation that
produces that set is Phase P3, in the domain layer.

This is a structure-preserving refactor (PDR direction): same projection, now
expressed as one resolved state, plus a generic seam for gating.

## Do NOT

- Do NOT teach `evaluateView` or anything in `packages/core` about `match`,
  `arm`, `rust.*`, `selectedArm`, or data-flow. The gating input is a generic
  `Set<NodeId>` / option object. No domain string literals in core.
- Do NOT add a second parallel visibility lever. After this phase there is ONE
  resolved state per node. Do NOT keep `spatialNodes`/`latentNodes` as
  independently-computed arrays AND add a peek flag — derive everything from the
  single resolution. (Convenience derived arrays are acceptable ONLY if computed
  directly from the single state map, never recomputed independently.)
- Do NOT compute reachability here or import the match caller. Gating arrives
  pre-resolved as the demotion set. (`reachable` from Phase P1 is used by P3, not
  here.)
- Do NOT change edge handling semantics (`arrows`/`summaryEdges`/containment)
  beyond what's needed to honor demoted nodes; keep edge roles as-is.
- Do NOT break the mcp view-tools or client-next consumers — migrate them in the
  same phase so the build stays green.

## Plan

### 1. Add a resolved node-state type (`packages/core/src/types.ts`)

Introduce `export type ResolvedNodeState = 'spatial' | 'latent' | 'peek' |
'hidden';`. Refactor `SceneGraph` so the single source of truth for node
visibility is a resolved state per node — e.g.:

```ts
export interface SceneGraph {
  /** One authoritative resolved state per node, single-solver output. */
  nodeStates: ReadonlyMap<NodeId, ResolvedNodeState>;
  /** Deterministic-order convenience views DERIVED from nodeStates. */
  spatialNodes: Node[];   // state === 'spatial'
  latentNodes: Node[];    // state === 'latent'
  peekNodes: Node[];      // state === 'peek'
  arrows: Edge[];
  summaryEdges: Edge[];
  containment: ContainmentTree;
  warnings: SceneWarning[];
}
```

Keep `spatial`/`latent` arrays as derived projections of `nodeStates` so the
diff to consumers is minimal, but make `nodeStates` the canonical field and add
`peekNodes`. (Only `hidden` nodes are absent from the scene entirely.)

### 2. Extend the `evaluateView` signature with a generic gating input

```ts
export function evaluateView(
  graph: Graph,
  view: View,
  gating?: { peek?: ReadonlySet<NodeId> }
): SceneGraph;
```

`gating` is optional; when absent, behavior is identical to today (no peek
nodes). The `peek` set is generic node ids to demote — `evaluateView` does not
know or care why.

### 3. Single-pass resolution

Replace the two role-partition loops with one pass that, for each node, resolves
its final `ResolvedNodeState`:
- start from `view.nodeRoles[node.kind]` (`spatial`/`latent`/`hidden`/undefined→
  hidden);
- if the node is in `gating.peek` AND its role would otherwise be `spatial` (or
  `latent`), demote to `'peek'`;
- record into the `nodeStates` map; push into the matching derived array.

A node already `hidden` stays hidden (gating never resurrects a hidden node).
Decide demotion of `latent` → keep simplest correct behavior: a latent node in
the peek set becomes `peek` (visible-but-dim) since peek is the "present but
de-emphasized" state. Document the choice in a comment.

Keep the existing latent/summary warnings working against the derived arrays.

### 4. Migrate consumers (keep build green)

Update every `SceneGraph` consumer to read from the new shape. Prefer reading
`nodeStates`/`peekNodes` where peek matters; otherwise the derived
`spatialNodes`/`latentNodes` keep working:
- `packages/client-next/src/PgCanvasView.tsx` — render `peekNodes` dimmed
  (reduced opacity / de-emphasis); cactus decides the visual treatment of a
  de-emphasized node — pass peek through as scene state, do not hand cactus a
  separate opacity lever.
- `packages/client-next/src/deepLodMeasure.tsx` — include peek nodes wherever
  spatial nodes are measured/laid out (peek nodes still occupy space).
- `packages/mcp/src/view-tools.ts` (+ `tools.config.ts` if shapes are
  referenced) — peek is not relevant to headless queries; ensure it compiles and
  treats peek nodes as present. mcp calls `evaluateView` without the `gating`
  arg.
- Update tests: `packages/core/tests/view.test.ts`,
  `packages/client-next/tests/PgCanvasView.test.ts`,
  `packages/mcp/tests/view-tools.test.ts`.

### 5. Core test for gating seam

In `packages/core/tests/view.test.ts`, add a case: pass `gating: { peek: new
Set([id]) }` and assert that node resolves to `'peek'` (present in `peekNodes`,
absent from `spatialNodes`), a hidden node stays hidden, and omitting `gating`
reproduces the prior scene exactly.

## Files to Modify

- `packages/core/src/types.ts` — `ResolvedNodeState`, refactor `SceneGraph`.
- `packages/core/src/view.ts` — single-pass resolution + generic `gating` param.
- `packages/core/tests/view.test.ts` — gating seam + unchanged-default cases.
- `packages/client-next/src/PgCanvasView.tsx` — render peek nodes dimmed.
- `packages/client-next/src/deepLodMeasure.tsx` — measure/layout peek nodes.
- `packages/mcp/src/view-tools.ts` — adapt to new SceneGraph shape.
- `packages/client-next/tests/PgCanvasView.test.ts`,
  `packages/mcp/tests/view-tools.test.ts` — update expectations.

## Verification

```bash
just typecheck
just test
```

## Out of Scope

- Any `match`/`arm`/`selectedArm`/data-flow logic — Phase P3.
- Computing the peek set via `reachable` — Phase P3 (domain caller).
- The `match-gating` layer/pack vocabulary — Phase P3.
- Edge dimming/peek for edges — only node state is in scope here; gated edges
  fall out of the scene via their endpoints' downstream pruning in P3.

## Notes

- The whole point is ONE solver, ONE state. A reviewer should confirm there is
  exactly one place a node's final visibility is decided, and that core received
  no domain knowledge — only a generic `Set<NodeId>`.
- This phase is mechanical-but-wide (9 files). Most consumer edits are
  field-access migrations.

## Surface after this phase

- `ResolvedNodeState = 'spatial' | 'latent' | 'peek' | 'hidden'` exported from
  `packages/core/src/types.ts`.
- `SceneGraph` exposes `nodeStates: ReadonlyMap<NodeId, ResolvedNodeState>` as
  the canonical per-node visibility, plus derived `spatialNodes`, `latentNodes`,
  `peekNodes` arrays; `arrows`, `summaryEdges`, `containment`, `warnings`
  unchanged.
- `evaluateView(graph, view, gating?: { peek?: ReadonlySet<NodeId> }):
  SceneGraph` — third arg optional; when omitted, scene equals pre-phase
  behavior. The `peek` set demotes spatial/latent nodes to `'peek'`.
- `evaluateView` and all of `packages/core` remain domain-blind: gating is a
  generic node-id set, no match/arm/dataflow vocabulary.
- Negative space: `reachable` (Phase P1) is NOT called from core scene code. No
  pack/domain match vocabulary exists yet. mcp calls `evaluateView` with no
  gating arg and is unaffected by gating.
