# Dataflow group projection: clusters on the canvas, grouped fifa examples

## Motivation

With `group?: string` in the document format (previous phase) and clusters
in cactus (first phase), the Dataflow Designer projects Groups onto the
canvas: each distinct group name becomes a cluster — a tinted underlay rect
with the name as its label — and group members lay out contiguously. The
fifa example documents gain groups so the feature is visible immediately.
Design: doc02.05.06; app: doc02.23.

## Do NOT

- Do NOT add any interaction: no label drag, no rename, no group editing
  from the UI (doc01.05.04 R11–R12 are future work). Rendering is passive.
- Do NOT write layout results or any state back to the documents.
- Do NOT invent content in the example documents — only add `group` fields
  to existing boxes as specified below; touch nothing else in those files.
- Do NOT break `e2e/smoke.spec.ts` or the existing `e2e/dataflow.spec.ts`
  assertions.

## Plan

### 1. Projection

In `packages/client/src/apps/dataflow/projection.ts`:

- `toTidyNodes`: set `clusterId` on each node from its box's `group` (group
  names are laminar by construction — a scalar field on top-level boxes).
- New `toClusterDeclarations(doc)`: one `ClusterDeclaration` per distinct
  group name — `id` and `label` are the name, `memberIds` are the boxes
  carrying it. Deterministic order (first-appearance or sorted).

### 2. Canvas wiring

In `packages/client/src/apps/dataflow/DataflowCanvas.tsx`: compute the
cluster declarations in a memo alongside the existing node/edge memos and
pass `clusters={...}` to `<Canvas>`. No other changes — positions still come
from `dagLayout` (which now receives `clusterId` via `toTidyNodes`), fitView
behavior unchanged.

### 3. Example documents

Add `group` fields (nothing else) to the fifa examples in `.canvases/`:

- `fifa-part-4.dataflow.json`: `"group": "Static Files"` on boxes
  `standings`, `team-list`, `user-brackets`; `"group": "Views"` on
  `standings-view`, `bracket-view`, `leaderboard`. `enriched-data` and
  `scorer` stay ungrouped.
- `fifa-part-3.dataflow.json`: `"group": "Static Files"` on
  `json-w-standings`, `team-list`, `user-brackets`; `"group": "Views"` on
  `bracket-w-teams`. `enriched-data` and `scorer` stay ungrouped.
- Parts 1 and 2 and `sample.dataflow.json` unchanged.

### 4. Tests

- Unit (client test suite, existing projection test pattern):
  `toClusterDeclarations` derives the two clusters from a doc with grouped
  boxes; ungrouped boxes appear in none; `toTidyNodes` carries `clusterId`.
- E2E (`e2e/dataflow.spec.ts`): open `fifa-part-4`, assert two
  `[data-cluster-id]` rects render and one has the label text
  "Static Files".

## Files to Modify

- `packages/client/src/apps/dataflow/projection.ts` — clusterId + `toClusterDeclarations`
- `packages/client/src/apps/dataflow/DataflowCanvas.tsx` — clusters prop
- client projection test file — cluster derivation cases
- `.canvases/fifa-part-3.dataflow.json` — group fields
- `.canvases/fifa-part-4.dataflow.json` — group fields
- `e2e/dataflow.spec.ts` — cluster rendering assertion

## Verification

```bash
just test-client
just typecheck
just build
just test-e2e
just lint
```

## Out of Scope

- Group interactions and persistence of UI edits.
- Luminous Canvas cluster projection — next phase.

## Notes

- Cactus surface available (phase 1): `ClusterDeclaration {id, memberIds,
  label?, tint?}`; `Canvas clusters?: ClusterDeclaration[]` rendering
  `data-cluster-id` rects; `TidyNode.clusterId?: string` giving contiguous
  unit layout in `dagLayout`.
- Core surface available (phase 2): `DataflowBox.group?: string`,
  round-tripped by parse/serialize.

## Surface after this phase

- `projection.ts` exports `toClusterDeclarations(doc): ClusterDeclaration[]`
  and `toTidyNodes` emits `clusterId` from `box.group`.
- The Dataflow canvas renders one underlay rect per distinct group name,
  labeled with the name.
- `fifa-part-3` and `fifa-part-4` carry "Static Files" and "Views" groups.
- Negative space: the app remains read-only; documents are never written by
  the UI; parts 1–2 and `sample` are unchanged.
