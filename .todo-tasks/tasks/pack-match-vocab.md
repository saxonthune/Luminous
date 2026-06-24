# Match-gating domain caller + pack vocabulary

## Motivation

With the pure `reachable` primitive (Phase P1) and the single-resolved-state
`evaluateView` that accepts a generic `gating.peek` set (Phase P2) in place,
this phase delivers the actual feature: gating Rust data flow through a selected
`match` arm. It supplies the **domain layer** — the only place that knows what a
`match` arm is — that computes the peek set and feeds it to `evaluateView`, plus
the **pack vocabulary** (a `rust.match` node kind, arm-tagged data-flow edges, a
`match-gating` layer).

This phase keeps the engine/domain boundary intact: core stays generic; all
match meaning lives in client-next + the pack. The domain caller turns
`selectedArm` (graph-side node data) into a set of suppressed edges, runs
`reachable` from the data-flow sources skipping those edges, and demotes the
non-survivors to peek.

## Do NOT

- Do NOT add match/arm logic to `packages/core`. Core's `reachable` and
  `evaluateView` are generic and final. This phase only *calls* them.
- Do NOT store selection on the view or in a new runtime store. Selection lives
  as `matchNode.props.selectedArm` (graph-side, churny/per-canvas authored
  state) per the graph-vs-pack rule. Absent `selectedArm` = no gating for that
  match (all its arms full).
- Do NOT hard-delete non-selected arms by default. Default gate mode is `peek`
  (dim), gated by the `match-gating` layer; layer `off` = all arms full. Only
  layer state `on` hides.
- Do NOT introduce a second visibility lever into the scene. The domain caller
  produces ONE `peek` set and passes it as `evaluateView`'s generic `gating`
  argument. cactus decides how peek renders.
- Do NOT skip the SKILL.md update — per CLAUDE.md, pack/graph schema changes
  (new node kind, edge props, layer) must be reflected in
  `.claude/skills/luminous-pipeline/SKILL.md` in the same change.

## Plan

### 1. Domain gating module (`packages/client-next/src/matchGating.ts`)

Add a pure helper that computes the peek set from the graph + view:

```ts
export function computeMatchGating(
  graph: Graph,
  view: View,
  cfg: { matchKind: KindId; dataflowKind: KindId; armProp: string }
): ReadonlySet<NodeId>;
```

Logic:
- If `view.layers['match-gating']` is `off`/absent → return empty set (no peek).
- Build the suppressed-edge set: for each node of `cfg.matchKind` whose
  `props.selectedArm` is set, mark every outgoing `cfg.dataflowKind` edge whose
  `props[cfg.armProp] !== selectedArm` as suppressed.
- If no edges are suppressed → return empty set.
- Compute `seeds` = data-flow source nodes (nodes with no *incoming*
  `cfg.dataflowKind` edge). Use the graph adjacency indices.
- `survivors = reachable(graph, seeds, { direction: 'out', edgeAllowed: e =>
  e.kind !== cfg.dataflowKind || !suppressed.has(e.id) })`. (Non-dataflow edges
  never gate reachability.)
- The peek set = every node that participates in data flow (touched by any
  `cfg.dataflowKind` edge) but is NOT in `survivors`. Return it.

Keep it pure and deterministic; no mutation. This is where `reachable` (P1) is
consumed.

### 2. Wire into the render path (`packages/client-next/src/PgCanvasView.tsx`)

Where `evaluateView(graph, view)` is currently called, compute the gating set
and pass it through:

```ts
const peek = computeMatchGating(graph, view, MATCH_GATING_CFG);
const scene = evaluateView(graph, view, { peek });
```

`MATCH_GATING_CFG` names the pack's match/dataflow kinds + arm prop (see step 4).
When the layer is off or no rust.match nodes exist, `peek` is empty and the
scene is unchanged — so this is safe for all existing canvases. Reuse the peek
rendering added in Phase P2 (no new rendering work).

When the `match-gating` layer state is `on` (hard hide) rather than `peek`,
translate the same set into hidden treatment — simplest approach: still pass as
`peek` but have PgCanvasView honor layer state `on` by not rendering peek nodes.
Keep the `peek`/`on` distinction in the domain/view layer, not in core.

### 3. Pack vocabulary

In the built-in/primitives pack (locate via the pack JSON that
`luminous-pipeline/SKILL.md` documents; follow the existing nodeKinds/edgeKinds/
layers shape):
- `rust.match` node kind — props schema includes optional `selectedArm: string`
  and `arms: string[]`.
- `rust.dataflow` edge kind (or extend the existing data-flow edge kind) —
  props schema includes `arm: string` (which match arm this flow belongs to),
  `directed: true`.
- A `match-gating` layer with `defaultState: 'off'`.
- Default a representative view's `layers['match-gating']` so the feature is
  discoverable, but keep `off` as the pack default.

Match the exact field/shape conventions already used in the pack; do not invent a
new pack schema.

### 4. Config constant

Define `MATCH_GATING_CFG = { matchKind: 'rust.match', dataflowKind:
'rust.dataflow', armProp: 'arm' }` in client-next (co-located with
`matchGating.ts`) so the kind names live in one place.

### 5. SKILL.md update

Update `.claude/skills/luminous-pipeline/SKILL.md` to document: the `rust.match`
node kind (`selectedArm`, `arms`), the `arm` prop on data-flow edges, the
`match-gating` layer and its `off`/`peek`/`on` semantics, and a short note that
selection is graph-side node data driving a view-layer-gated transitive peek.

### 6. Tests

- `packages/client-next/tests/matchGating.test.ts` — a small graph: one
  `rust.match` with two arms, downstream chains, a node fed by both arms.
  Assert: layer off → empty peek; selectedArm set + layer peek → non-selected
  arm's exclusive-downstream is peeked, the shared/both-fed node is NOT peeked
  (transitive correctness); no `selectedArm` → empty peek.
- Extend a `PgCanvasView` test to confirm the scene receives the peek set.

## Files to Modify

- `packages/client-next/src/matchGating.ts` — new: `computeMatchGating` + `MATCH_GATING_CFG`.
- `packages/client-next/src/PgCanvasView.tsx` — compute peek set, pass to `evaluateView`; honor layer `on` vs `peek`.
- pack JSON (per SKILL.md) — `rust.match` kind, dataflow `arm` prop, `match-gating` layer.
- `.claude/skills/luminous-pipeline/SKILL.md` — document the new vocabulary.
- `packages/client-next/tests/matchGating.test.ts` — new transitive-gating tests.
- `packages/client-next/tests/PgCanvasView.test.ts` — peek-set wiring.

## Verification

```bash
just typecheck
just test
```

## Out of Scope

- Generating `rust.match` nodes / arm-tagged edges from real Rust source (that's
  a pipeline-authoring task; this phase only defines the vocabulary + gating).
- A selection UI for picking arms — `selectedArm` is set in graph data for now.
- Edge-level peek styling beyond what node downstream pruning already yields.

## Notes

- Triage against the predecessors' Surfaces: `reachable(graph, seeds, { direction,
  edgeAllowed, maxHops })` from `core-reachable-primitive`, and
  `evaluateView(graph, view, { peek })` + `ResolvedNodeState`/`peekNodes` from
  `view-gating-resolution`. Do not re-derive those; rely on the declared Surface.
- Reviewer watch: confirm no match vocabulary leaked into `packages/core`, that
  the both-arms-fed node stays full-opacity (transitive correctness), and that an
  empty/absent selection leaves every existing canvas visually unchanged.

## Surface after this phase

- `computeMatchGating(graph, view, cfg): ReadonlySet<NodeId>` and
  `MATCH_GATING_CFG` exported from `packages/client-next/src/matchGating.ts`.
- `PgCanvasView` gates its scene via `evaluateView(graph, view, { peek })`.
- Pack defines `rust.match` (props `selectedArm?`, `arms`), data-flow edge `arm`
  prop, and a `match-gating` layer (`defaultState: 'off'`).
- `.claude/skills/luminous-pipeline/SKILL.md` documents all of the above.
- Negative space: `packages/core` is unchanged from Phase P2 (still domain-blind).
