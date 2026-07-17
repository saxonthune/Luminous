# Invert the cactus pan contract from fail-open opt-out to fail-safe opt-in

## Motivation

Split off from `atlas-interaction-bugs` (bug 1a). Cactus decides "should this
gesture pan the camera?" in one d3-zoom `.filter()` predicate
(`useViewport.ts:50-59`). The rule is an **opt-out**: pan unless the event target
has a `[data-no-pan]` ancestor. This fails open — any element stacked above the
node layer that re-enables pointer events, and forgets `data-no-pan`, silently
becomes a pan surface.

Confirmed instance: edge labels render as `<text>` in an SVG layer above the
nodes (`Canvas.tsx:561-567`). The label `<text>` sets `pointer-events: auto` for
its click-to-reveal (`EdgeLayer.tsx:259-262`). So a mousedown over a label — which
in the Atlas fixture sits directly over a Node's body — resolves `event.target` to
the `<text>`, whose `closest('[data-no-pan]')` is null, so d3 pans instead of the
Node dragging. Every future overlay is a fresh chance to reintroduce this.

The durable fix is to **invert the default so the contract fails safe**: nothing
pans except an explicitly-designated background pan surface. New overlays are then
non-pannable by default; nobody has to remember to opt out. This also makes the
contract a named, unit-testable predicate instead of an inline closure.

## Do NOT

- **Do NOT** set `leftDragPan: false` in Atlas or any app to dodge this. That is
  the incidental immunity Dataflow has (via `boxSelect.trigger === 'drag'`,
  `Canvas.tsx:305-307`) and it masks the engine contract failing on its own terms.
  Fix the engine.
- **Do NOT** just add `data-no-pan` to the edge label. That is the same fail-open
  contract; the next overlay rediscovers the bug. Invert the default instead.
- **Do NOT** change `useBoxSelect.ts:63` or the background-pointerdown check at
  `Canvas.tsx:500`. Those are two *other* consumers of `data-no-pan`. They keep
  working under this change (see Notes) and are out of scope. Leave `data-no-pan`
  stamped on nodes and handles for them.
- **Do NOT** touch node drag (`useNodeDrag.ts`), the drag-override render path in
  `AtlasCanvas.tsx`, double-click edit, or Atlas position persistence. Those are
  bugs 1b / 2 / 3 of the parent task and are handled separately.
- **Do NOT** reintroduce any auto-`fitView` or camera-move-on-document-change
  behavior (R23 was already fixed in `a56f668`).
- **Do NOT** remove the `[data-no-pan]` attributes from any component.

## Plan

### 1. Extract and invert the pan predicate (`packages/cactus/src/interactions/useViewport.ts`)

Pull the inline `.filter(...)` body into a pure, exported function so it can be
unit-tested and so the contract is a named thing:

```ts
export interface PanFilterEvent {
  type: string;
  button?: number;
  target: EventTarget | null;
}

/** The viewport pan/zoom gate. Fail-safe by default: a pointer gesture pans
 *  only when it lands on an explicit `[data-pan-surface]` element. Wheel and
 *  middle-drag always pass regardless of target. */
export function shouldViewportPan(
  event: PanFilterEvent,
  opts: { leftDragPan: boolean }
): boolean {
  if (event.type === 'wheel') return true;
  if (event.type === 'mousedown' && event.button === 1) return true; // middle-drag always pans
  const target = event.target as HTMLElement | null;
  const onSurface = !!target?.closest?.('[data-pan-surface]');
  if (!onSurface) return false; // fail safe: not the background → never pan
  if (event.type === 'mousedown') return opts.leftDragPan || event.button !== 0;
  if (event.type === 'touchstart') return true;
  return false;
}
```

Replace the `.filter((event) => { ... })` at `:50` with
`.filter((event) => shouldViewportPan(event, { leftDragPan }))`.

Note this closes the `touchstart` gap incidentally: the old code returned `true`
for `touchstart` with no target check at all; now touch pans only over the pan
surface, same as mouse.

### 2. Add the pan surface and make the node layer pointer-transparent (`packages/cactus/src/Canvas.tsx`)

The node-layer wrapper div (`:535`) is `position:absolute; inset:0` with default
`pointer-events: auto`, so it covers the whole canvas and is what currently
receives background clicks. For the opt-in to work, background clicks must instead
land on a dedicated pan-surface element that is **not an ancestor of the nodes**.

Two edits:

a. **Add a pan-surface layer** as the first child inside the container div (before
   the background/DotGrid render at `:507`), so it is the bottom-most layer:
   ```jsx
   <div
     data-cactus-pan-surface
     data-pan-surface
     style={{ position: 'absolute', inset: '0' }}
   />
   ```
   Leave its `pointer-events` at the default (`auto`). It is transparent; it only
   catches pointer events that fall through the layers above it.

b. **Make the node-layer wrapper pointer-transparent** — add
   `'pointer-events': 'none'` to the style object of the node-layer wrapper at
   `:535-541` (the div whose child is `{props.children}`). Background clicks now
   fall through it to the pan surface; node subtrees re-enable pointer events at
   their roots (step 3).

### 3. Re-enable pointer events at the node roots

Because the node-layer wrapper is now `pointer-events: none`, each node root must
explicitly set `pointer-events: auto` (a descendant re-enables even under a `none`
ancestor). The two cactus node roots — both carry `data-container-id`:

- `packages/cactus/src/NodeContainer.tsx:54-61` — add `'pointer-events': 'auto'`
  to the root div's style object.
- `packages/cactus/src/NodeShell.tsx:30-41` — add `'pointer-events': 'auto'`
  to the root div's style object.

Handles, content, and chrome inside these roots inherit `auto` from the root, so
no other component needs a change.

### 4. Regression test (`packages/cactus/tests/useViewport.test.tsx` — new file)

Test the pure `shouldViewportPan` predicate directly against a constructed DOM
tree (jsdom + `closest` is enough — no d3, no render). Build:

- a pan-surface div (`data-pan-surface`),
- a node div (`data-container-id`, `data-no-pan`) that is a **sibling** of the pan
  surface (mirroring the real layer structure — the node is NOT inside the pan
  surface),
- a label element (`pointer-events: auto`, no `data-pan-surface` ancestor)
  standing in for the edge `<text>`.

Assert:
- `mousedown` (button 0) with `target` = pan-surface → `true` when `leftDragPan`,
  `false` when `!leftDragPan`.
- `mousedown` (button 0) with `target` = node div → `false` (this is the drag case).
- `mousedown` (button 0) with `target` = the label element → `false` (**this is
  bug 1a** — the label must not steal the grab).
- `mousedown` (button 1) with `target` = node div → `true` (middle-drag always pans).
- `wheel` with any target → `true`.
- `touchstart` with `target` = node div → `false`; with `target` = pan-surface → `true`.

Follow the harness style in `tests/useBoxSelect.test.tsx` (jsdom, plain
`document.createElement`; no need to `render` a Solid tree — call the function
with a `{ type, button, target }` literal).

## Files to Modify

- `packages/cactus/src/interactions/useViewport.ts` — extract + invert filter into exported `shouldViewportPan`.
- `packages/cactus/src/Canvas.tsx` — add `data-pan-surface` bottom layer; set node-layer wrapper `pointer-events: none`.
- `packages/cactus/src/NodeContainer.tsx` — root div `pointer-events: auto`.
- `packages/cactus/src/NodeShell.tsx` — root div `pointer-events: auto`.
- `packages/cactus/tests/useViewport.test.tsx` — new predicate test (bug 1a regression).

## Verification

```bash
pnpm -C packages/cactus exec tsgo --noEmit
pnpm -C packages/cactus exec vitest run
```

The existing suite (`useBoxSelect`, `clusterUnderlay`, `edge-rendering`,
`cactus-components`, `chrome`) must stay green — it is the regression guard that
box-select, clusters, edges, and node rendering still work after the layering
change. The new `useViewport.test.tsx` must pass.

## Out of Scope

- Bug 1b (mousedown target differs from `elementFromPoint` mid-gesture), bug 2
  (double-click edit), bug 3 (Atlas position reader) — parent task, handled apart.
- Inverting the two other `data-no-pan` consumers (`useBoxSelect.ts:63`,
  `Canvas.tsx:500`) to opt-in. Worth doing later for consistency; not needed to
  fix 1a and higher regression risk. Note it as follow-up.
- Redesigning `data-no-pan` / `data-pan-surface` into a typed (non-string) API.
- A Playwright drag-vs-pan e2e. The pure-predicate unit test covers 1a
  deterministically; an app-driven e2e is a follow-up once a verify recipe exists.

## Notes

- **Why the other consumers keep working:** `useBoxSelect` binds its
  `pointerdown` to the container element and bubbles up from the pan surface; the
  pan surface has neither `data-no-pan` nor `data-container-id`, so box-select
  proceeds on background exactly as before. `Canvas.tsx:500`'s
  `onBackgroundPointerDown` guard likewise sees no `data-no-pan` on the pan
  surface and fires as before. Nodes still carry `data-container-id` /
  `data-no-pan`, so both consumers still reject node targets.
- **Why `pointer-events: auto` on a descendant is safe under a `none` ancestor:**
  CSS `pointer-events` is inherited but a descendant may override it back to
  `auto`; the node root doing so re-enables the whole node subtree while the
  wrapper stays transparent to fall-through background clicks. The Atlas
  color-wrapper div (`AtlasCanvas.tsx:89`) sits between the wrapper and
  `NodeContainer` and needs no change — `NodeContainer`'s own `auto` re-enables it.
- **`findContainerAt` / drop hit-testing** uses `document.elementFromPoint`, which
  respects `pointer-events`. Nodes are `auto` so they are still hit; empty space
  now resolves to the pan surface. No behavior change for drop targeting.
- Reviewer watch-item: confirm no app renders bare interactive content **directly**
  in the node layer outside a `NodeContainer`/`NodeShell` root. Atlas and Dataflow
  both wrap content in those roots. If one does, it would need its own
  `pointer-events: auto`.

## Surface after this phase

- `shouldViewportPan(event: PanFilterEvent, opts: { leftDragPan: boolean }): boolean`
  is exported from `packages/cactus/src/interactions/useViewport.ts` and is the
  single pan/zoom gate. Contract: pans only when the target is inside
  `[data-pan-surface]`; wheel and middle-drag always pan.
- Cactus renders exactly one `[data-pan-surface]` element — the bottom-most
  full-canvas layer in `Canvas.tsx`. It is the only pannable surface.
- The node-layer wrapper is `pointer-events: none`; `NodeContainer` and
  `NodeShell` roots are `pointer-events: auto`.
- `[data-no-pan]` is still stamped on nodes and handles and is still read by
  `useBoxSelect` and the background-pointerdown guard. It is NO LONGER read by the
  viewport pan filter.
- Unchanged and still relied on: node drag (`useNodeDrag`), box-select,
  connection drag, drop hit-testing, R23 camera behavior.
