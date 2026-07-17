# Introduce the Gesture state machine and route node dragging through it

## Motivation

Split off from `atlas-interaction-bugs` (bugs 1b and 2, the durable-architecture
half). Cactus has seven independent interaction hooks (`useViewport`,
`useNodeDrag`, `useBoxSelect`, `useConnectionDrag`, `useNodeResize`,
`useSelection`, plus inline label-drag), each binding its own `pointerdown` and
`window` move/up listeners and coordinating only through `data-*` attributes and
`stopPropagation`. Two failures fall out of that fragmentation:

- **1b — the dragged node's DOM element is torn down mid-gesture.** During an
  Atlas drag, `AtlasCanvas`'s `renderNodes` memo maps the dragged node to a **new
  object** (`{ ...rn, x, y }`) on every move. Solid's `<For>` keys rows by array-
  element reference, so a changed reference disposes that row's DOM subtree and
  builds a fresh one — the element under the pointer changes identity during the
  drag. (The prior fail-safe pan filter, now merged, already stopped the *camera*
  from panning on a node grab; this is the remaining drag-instability half.)
- **2 — double-click never enters edit mode.** `useNodeDrag` claims the gesture on
  the first pixel of `pointerdown` with no movement threshold, so a quick
  press-release-press is not cleanly seen as a click/double-click.

The durable fix is a single **Gesture** state machine: one discriminated-union
signal that owns "what pointer gesture is in progress," with a press→drag movement
threshold and pointer capture, and a `createSelector` so exactly one node reacts
to being dragged (no `<For>` rebuild). This phase builds the machine and routes
**node dragging** through it, integrated with the **Atlas** app. Box-select,
connection-drag, and resize migrate in follow-up tasks.

## Do NOT

- **Do NOT** migrate `useBoxSelect`, `useConnectionDrag`, `useNodeResize`, or
  `useSelection` in this task. They stay as-is; the Gesture machine coexists with
  them. Follow-up drafts exist for each.
- **Do NOT** touch the Dataflow app (`packages/client/src/apps/dataflow/`) or
  remove `useNodeDrag`. Dataflow keeps using `useNodeDrag` until its own follow-up.
  `useNodeDrag` stays in the codebase.
- **Do NOT** change or re-invert the pan filter (`shouldViewportPan`) or remove the
  `data-pan-surface` layer. This task builds *on top* of that merged contract.
- **Do NOT** reintroduce auto-`fitView` or any camera move on document change (R23).
- **Do NOT** fix 1b by copying Dataflow's `leftDragPan: false` config.
- **Do NOT** allocate a new render-node object per move for the dragged node — that
  is the exact `<For>`-rebuild mechanism this task removes. The dragged node's live
  offset MUST be read *inside* the `<For>` row (per-node, via the selector), so the
  array passed to `<For>` is unchanged during a drag.

## Plan

### 1. The Gesture type and machine (`packages/cactus/src/interactions/useGesture.ts` — new)

Define the discriminated union and a primitive that owns one signal:

```ts
export type Gesture =
  | { kind: 'idle' }
  | { kind: 'pressing'; nodeId: string; startX: number; startY: number }   // down, below threshold
  | { kind: 'draggingNode'; nodeId: string; startX: number; startY: number; dx: number; dy: number };
```

`dx`/`dy` are **canvas-space** deltas (screen delta ÷ zoom `k`).

`useGesture(opts)` where `opts` carries `zoomScale: () => number` and callbacks
`onDragStart(nodeId)`, `onDrag(nodeId, dx, dy)`, `onDragEnd(nodeId, dx, dy)`
(same shape as `useNodeDrag`, so the Atlas domain callbacks port over). It returns:

- `gesture: () => Gesture` — the accessor.
- `beginPress(nodeId: string, event: PointerEvent): void` — call from a node's
  `on:pointerdown`. Guards `event.button !== 0`. Sets `pressing`, records start,
  calls `event.currentTarget`'s (or the container's) `setPointerCapture(event.pointerId)`,
  and registers `window` `pointermove`/`pointerup`.
- `isDraggingNode: (nodeId: string) => boolean` — a `createSelector` over the
  dragging node id (see step 4). True for exactly the node being dragged.
- `dragDelta: () => { dx: number; dy: number }` — the active drag delta, `{0,0}` when idle.

Lifecycle inside `beginPress`:
- On `pointermove`: compute canvas-space `dx/dy` from `startX/startY` and `zoomScale()`.
  While `pressing`, transition to `draggingNode` only once `Math.hypot(rawDxPx, rawDyPx)`
  crosses a threshold (reuse the existing `LABEL_DRAG_THRESHOLD` value of `3` px —
  export it from a shared spot or redefine a `DRAG_THRESHOLD = 3` constant here).
  On that transition, fire `onDragStart(nodeId)`. On each subsequent move update
  `dx/dy` and fire `onDrag(nodeId, dx, dy)`.
- On `pointerup`: if we reached `draggingNode`, fire `onDragEnd(nodeId, dx, dy)`.
  If still `pressing` (never crossed threshold), fire nothing — it was a click, and
  selection / double-click handling (unchanged) does its job. Always return to
  `idle`, release pointer capture, remove the window listeners.

### 2. Wire the machine into Canvas / NodeContainer

- `packages/cactus/src/NodeContainer.tsx:62` — change the root div's drag entry from
  the delegated `onPointerDown` to a **native** `on:pointerdown` handler. Solid's
  delegated events sit on `document`, so `stopPropagation` and pointer capture do
  not behave as written on them (see the Solid skill, §Event Handling — "stopPropagation
  — use native events"). Keep calling `props.onPointerDown?.(e)`; the app decides what
  to do. `NodeShell.tsx` uses the same pattern — leave it for the Dataflow-adjacent
  path unless it shares the Atlas layer (it does not).
- Expose the gesture machine to the node layer. Follow the existing pattern:
  `AtlasNodeLayer` already constructs an interaction hook (`useNodeDrag`) inside
  `Canvas`'s provider and threads callbacks. Replace that `useNodeDrag(...)` call
  with `useGesture(...)`.

### 3. Rewire Atlas drag to read the offset per-node (`packages/client/src/apps/atlas/AtlasCanvas.tsx`)

This is the correctness-critical change for 1b.

- **Delete** the `nodeOverride` signal and the `renderNodes` memo that maps a new
  object over `nodes()` (`:140`, `:145-149`). Pass `nodes` (the stable projection
  memo) straight to `AtlasNodeLayer`.
- In `AtlasNodeLayer`'s `<For>` row (`AtlasCanvas.tsx:76-116`), compute the effective
  position **inside the row** from the gesture:
  ```ts
  const dx = () => gesture.isDraggingNode(rn.node.id) ? gesture.dragDelta().dx : 0;
  const dy = () => gesture.isDraggingNode(rn.node.id) ? gesture.dragDelta().dy : 0;
  // pass x={() => rn.x + dx()} y={() => rn.y + dy()} to NodeContainer
  ```
  Because `nodes()` does not change during a drag, `<For>`'s array is stable, so no
  row is disposed — only the dragged row's `x`/`y` accessors re-run, updating its
  `left`/`top` and re-registering its rect (edges follow). This is the whole point.
- `beginDrag` keeps its membership hit-testing (the `dragPointerMove` window listener
  and `onPendingMembershipChange`), but no longer calls `setNodeOverride`.
- `moveDrag` no longer sets an override; the gesture owns the visual. It may be
  removed if the membership hit-test moves into the `onDrag` callback — either is
  fine; keep membership preview working.
- `endDrag` reads the final delta from the `onDragEnd(nodeId, dx, dy)` callback,
  computes the dropped position as `dragStart + delta`, runs `resolveDrop`
  (unchanged), and dispatches. Since Atlas positions are not yet persisted (bug 3,
  a separate task), a drop still resolves to reparent-or-snap-back via `resolveDrop`
  as it does today — do not add position persistence here.
- Remove the `createEffect(on(() => props.doc, () => setNodeOverride(null)))` at
  `:151` (no override to clear).

### 4. The selector (`createSelector`)

In `useGesture`, derive the active dragging id and build the selector once:

```ts
const draggingId = () => { const g = gesture(); return g.kind === 'draggingNode' ? g.nodeId : null; };
const isDraggingNode = createSelector(draggingId);
```

`createSelector` gives O(2) updates when the dragged node changes (only the old and
new node re-run), instead of O(n) across every node. Each `<For>` row calls
`isDraggingNode(rn.node.id)` — this is what keeps a 200-node canvas from re-running
every row on a drag.

### 5. Tests (`packages/cactus/tests/useGesture.test.tsx` — new)

Behavioral tests in jsdom, following the harness style of `tests/useBoxSelect.test.tsx`
(plain `MouseEvent` dispatched as `pointerdown`/`pointermove`/`pointerup`; jsdom has
no `PointerEvent` but the machine only reads `button`/`clientX`/`clientY`/`pointerId`).
`setPointerCapture` does not exist in jsdom — guard the call
(`el.setPointerCapture?.(id)`) so tests run, and assert behavior around it, not the call.

Assert:
- pointerdown on a node → `gesture().kind === 'pressing'`; `onDragStart` NOT yet called.
- move below threshold (2px) → still `pressing`; no `onDrag`.
- move past threshold (5px) → `draggingNode`; `onDragStart` fired once; `dragDelta()`
  reflects canvas-space delta (verify division by `zoomScale`, e.g. k=2 halves it).
- further move → `onDrag` fired with cumulative canvas-space delta.
- pointerup after dragging → `onDragEnd(nodeId, dx, dy)` fired; `gesture()` back to `idle`.
- **press-release below threshold → `onDragStart`/`onDragEnd` NEVER fire** (this is the
  bug-2 guard: a click is not a drag).
- `isDraggingNode(id)` is true only for the active node, false for others and when idle.
- right-button (button 2) and middle-button (button 1) pointerdown → no gesture.

## Files to Modify

- `packages/cactus/src/interactions/useGesture.ts` — new: `Gesture` type + machine.
- `packages/cactus/src/interactions/index.ts` (or the package barrel `src/index.ts`) — export `useGesture`, `Gesture`.
- `packages/cactus/src/NodeContainer.tsx` — native `on:pointerdown` for the drag entry.
- `packages/client/src/apps/atlas/AtlasCanvas.tsx` — swap `useNodeDrag` → `useGesture`; delete `nodeOverride`/`renderNodes` merge; read offset per-`<For>`-row.
- `packages/cactus/tests/useGesture.test.tsx` — new behavioral tests.

## Verification

```bash
pnpm -C packages/cactus exec tsgo --noEmit
pnpm -C packages/client exec tsgo --noEmit
pnpm -C packages/cactus exec vitest run
```

The existing cactus suite must stay green (regression guard for box-select,
clusters, edges, selection — all untouched by this task). The new
`useGesture.test.tsx` must pass. Both cactus and client must typecheck.

## Out of Scope

- Migrating box-select / connection-drag / resize / selection to the machine
  (`gesture-migrate-boxselect`, `gesture-migrate-connection`, `gesture-migrate-resize`).
- Migrating the Dataflow app off `useNodeDrag`.
- A single root-level `on:pointerdown` arbiter that classifies the target for all
  gestures. This task initiates the gesture from `NodeContainer`'s own handler
  (it already knows its `nodeId`); the root arbiter is the endpoint the follow-up
  migrations converge on, not a prerequisite here.
- Atlas position persistence (bug 3) — a drop still resolves via `resolveDrop`.
- Bug 2's non-drag causes: this task removes the *drag-claims-first-pixel* obstacle
  via the threshold, but if double-click still fails after that, diagnosing the
  `AtlasNodeContent.tsx:34` `dblclick`-stop is a separate follow-up.
- Renaming the union to anything other than `Gesture`, or a typed replacement for
  the `data-*` string attributes.

## Notes

- **Naming:** the union is `Gesture` and the signal is `gesture` — the established
  term for a transient press→move→release pointer interaction (vs "tool", a
  persistent selected mode; vs "interaction", the broader HCI umbrella).
- **Why the machine can ignore pan arbitration:** the merged `shouldViewportPan`
  only pans over `[data-pan-surface]`, and nodes are not a pan surface, so d3 and
  the gesture machine are already partitioned by target. The machine does not need
  to suppress d3.
- **Pointer capture:** capture on a stable element (the canvas container, never
  rebuilt), not on the node div (which could still be re-rendered by unrelated
  reactivity). Belt-and-suspenders with the identity-stable render: capture routes
  events even if something shifts; stable identity means nothing shifts.
- Reviewer watch-item: confirm edges still follow a dragged node (the per-row
  effective `x`/`y` must re-register the node rect via `NodeContainer`'s
  `createRenderEffect`).

## Surface after this phase

- `packages/cactus/src/interactions/useGesture.ts` exports:
  - `type Gesture = { kind: 'idle' } | { kind: 'pressing'; ... } | { kind: 'draggingNode'; ...; dx; dy }`.
  - `useGesture(opts): { gesture, beginPress, isDraggingNode, dragDelta }` with
    callbacks `onDragStart(id)`, `onDrag(id, dx, dy)`, `onDragEnd(id, dx, dy)`.
  - A `DRAG_THRESHOLD` (3px) movement threshold gates `pressing → draggingNode`.
- Both are re-exported from the cactus package barrel.
- Node dragging in **Atlas** runs entirely through `useGesture`; the dragged node's
  live offset is read per-`<For>`-row via `isDraggingNode`/`dragDelta`, so the
  render array is stable during a drag (no `<For>` rebuild). `nodeOverride` and the
  `renderNodes` drag-merge are gone from `AtlasCanvas`.
- `NodeContainer`'s drag entry is a native `on:pointerdown`.
- Unchanged and still relied on: `useNodeDrag` (still present, used by Dataflow),
  `useBoxSelect`, `useConnectionDrag`, `useNodeResize`, `useSelection`,
  `shouldViewportPan` / `data-pan-surface`, R23 camera behavior, `resolveDrop`.
- Not built here: box-select/connection/resize migration, Dataflow migration,
  Atlas position persistence, the single root arbiter.
