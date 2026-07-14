# cactus: edge hit-testing, interactive cluster label, selection read access

## Motivation

The Dataflow Designer's UI wireup (doc01.05.04) needs three engine capabilities
that don't exist yet: right-clicking a Flow (R9) requires edges to be
hit-testable; renaming a Group by double-clicking its label (R12) requires the
cluster label to be interactive; and building context menus that act on a
multi-selection (R14, R15) requires the host to read the current selection.
All three are additive, domain-agnostic cactus changes — no dataflow concepts
enter the engine.

## Do NOT

- Do NOT make the cluster underlay rect interactive. Only the label opts into
  pointer events, and only when a callback is provided. The rect stays
  `pointer-events: none` — it must never steal node, pan, or selection gestures.
- Do NOT change edge routing, rendering order, or the fixed layer stack
  (background → cluster underlay → edge lines SVG → nodes → edge labels SVG).
- Do NOT add any drag behavior to the cluster label (set-drag is deferred).
- Do NOT touch containment, `evaluateContainment`, or anything in
  `packages/core` or `packages/client` beyond what typechecking forces.
- Do NOT add domain words (group, flow, box) to cactus APIs. The vocabulary is
  edge, cluster, node, selection.

## Plan

### 1. Edge hit-testing (`data-edge-id` + hit stroke)

In `packages/cactus/src/EdgeLayer.tsx`, `lines` layer: alongside the visible
`<line>`, render a second invisible hit line for each edge — same endpoints,
`stroke="transparent"`, `stroke-width` of `Math.max(12, width)`,
`pointer-events: stroke`, `data-edge-id={edge.id}`, `cursor: context-menu` is
unnecessary (no visual affordance yet). The parent SVG has
`pointer-events: none`, so per-element opt-in is the existing pattern (edge
label `<text>` already does `pointer-events: auto`). Render the hit line after
the visible line and arrowhead so it sits on top within the group.

Note: SVG attribute `pointer-events` on the hit line must be set as a style or
attribute (`pointer-events="stroke"`), which makes the element hit-testable on
its stroke geometry even though the stroke paint is transparent.

### 2. `edgeContextMenu` prop on Canvas

In `packages/cactus/src/Canvas.tsx`:

- Add to `CanvasProps`:
  ```ts
  /** Returns a MenuSchema for an edge right-click, or undefined for no menu. */
  edgeContextMenu?: (edgeId: string) => MenuSchema | undefined;
  ```
- In `handleContextMenu` (line ~304): after the `data-container-id` branch
  misses, check `target.closest?.('[data-edge-id]')`. If an edge element is
  found and `props.edgeContextMenu` returns a non-empty schema, open the menu
  at the cursor (same `setCtxMenuState` path) and return. The background
  branches run only when neither node nor edge matched. Node priority over edge
  is automatic: the check order is node → edge → background.

The lines SVG sits *below* the nodes div in the layer stack, so a right-click
over a node never reaches an edge element — no ambiguity.

### 3. Interactive cluster label (`onLabelEdit`)

In `packages/cactus/src/types.ts`, extend `ClusterDeclaration`:

```ts
interface ClusterDeclaration {
  id: string;
  memberIds: string[];
  label?: string;
  tint?: string;
  /** When provided, the label becomes editable: double-click swaps it for a
      text input; commit (Enter or blur) calls back with the new value. */
  onLabelEdit?: (newLabel: string) => void;
}
```

In `ClusterUnderlay` (`Canvas.tsx:85-138`): when `cluster.onLabelEdit` is
present, the label div gets `pointer-events: auto`, `data-no-pan="true"`, and
a `cursor: text` hint. Double-click swaps the label text for an `<input>`
(prefilled with the current label, auto-focused, select-all). Enter or blur
commits via `onLabelEdit(value)`; Escape cancels (restore the label without
calling back). Guard the input's pointer/keyboard events with
`stopPropagation` so typing never pans or triggers canvas hotkeys (the global
`useHotkeys` already ignores focused inputs; the guard is for the underlay's
own ancestors). Committing an unchanged or empty value does not call back.
The edit state is a local signal per cluster (`editing: boolean`).

The underlay wrapper div (line ~356) keeps `pointer-events: none` — the label
div's `pointer-events: auto` opts back in per element (CSS allows descendants
to re-enable pointer events).

### 4. `getSelectedIds` on CanvasRef

In `Canvas.tsx`: add `getSelectedIds: () => ReadonlyArray<string>` to the
`CanvasRef` interface and wire it to `selectedIds()` in the `props.ref?.({...})`
call. Hosts building context menus for multi-selections read the selection
through the ref they already hold.

### 5. Unit tests

Add `packages/cactus/src/EdgeLayer.test.tsx` only if a cheap render test is
feasible with the existing vitest setup (check for an existing `*.test.tsx`
precedent; `composeLayout.test.ts` is pure-function only). If component
testing infrastructure does not already exist, do NOT introduce a test
renderer — cover the pure parts (none new) and leave DOM behavior to the
phase-3 e2e. Type-level correctness is enforced by typecheck.

## Files to Modify

- `packages/cactus/src/EdgeLayer.tsx` — invisible hit line with `data-edge-id`
- `packages/cactus/src/Canvas.tsx` — `edgeContextMenu` prop + handleContextMenu
  branch; `ClusterUnderlay` label edit; `CanvasRef.getSelectedIds`
- `packages/cactus/src/types.ts` — `ClusterDeclaration.onLabelEdit`
- `packages/cactus/src/index.ts` — only if new types need exporting (check;
  `ClusterDeclaration` is already exported)

## Verification

```bash
just typecheck-cactus
just test-cactus
just build-cactus
just typecheck
just lint
```

## Out of Scope

- Cluster label drag (set-drag of members) — deferred, no requirement id.
- Any client/app wiring — phase 2 consumes these APIs.
- Edge hover styling or visual affordance changes.
- Ports, connection handles, edge selection state.

## Notes

- The `pointer-events: none` SVG with per-element opt-in is precedented by the
  labels layer (`EdgeLayer.tsx:250`, label text is `pointer-events: auto`).
- `data-no-pan` is the established gesture escape hatch (LayoutPicker uses it).
- Risk: dblclick on the label vs. dblclick entering a box's edit mode (phase 3)
  do not collide — different DOM targets, and the box handler stops propagation.

## Surface after this phase

- `CanvasProps.edgeContextMenu?: (edgeId: string) => MenuSchema | undefined` —
  fires on right-click over an edge's hit line; node hits take priority;
  background menu unaffected.
- Every rendered edge has an invisible hit line carrying `data-edge-id="<id>"`
  in the lines SVG, hit-testable along a ≥12px-wide stroke.
- `ClusterDeclaration.onLabelEdit?: (newLabel: string) => void` — when set, the
  cluster label is double-click-editable in place; commit on Enter/blur, cancel
  on Escape; no callback on empty or unchanged values. When unset, behavior is
  exactly today's passive label.
- `CanvasRef.getSelectedIds(): ReadonlyArray<string>` — current selection.
- Negative space: the cluster underlay rect remains `pointer-events: none`;
  the layer stack order is unchanged; `EdgeDeclaration`, layout entry points,
  and all existing Canvas props are unchanged. Existing consumers
  (`PgCanvasView`, `DataflowCanvas`) compile without edits.
