# Atlas Edge Tab — hover affordance for creating Edges (R44–R52)

## Motivation

Atlas has no UI to create Edges. doc01.07.04 (`.rhidoc/01-product/07-atlas/04-ui-requirements.md`) now defines the Edge Tab affordance in requirements R44–R52 and the matching input-command binding rows — read that section first; it is the contract this task implements. In short: each Node grows a tab protruding from the top of its right side, shown on hover, carrying a green circular badge with a white plus. Pressing the tab and dragging to another Node creates an Edge; clicking the tab arms edge creation and a click on another Node completes it. While edge creation is in progress, a preview Edge follows the pointer, the tab lights up, and a toast says what is happening. Ctrl + release (or Ctrl + click) while in progress creates a new Node under the pointer and completes the Edge into it, parented by the Container under the pointer.

cactus already has most of the drag machinery: `useGesture`'s `connecting` gesture (`beginConnect`), the Canvas `connectionDrag` + `renderConnectionPreview` props, `ConnectionPreview`, and `data-connection-target="true"` on every `NodeContainer`. No client app consumes it yet — Atlas is the first. The work is (a) extending the gesture for click-to-arm and ctrl-release, (b) rendering the tab, (c) wiring Atlas mutations, preview, and toast.

## Do NOT

- Do NOT put Atlas meaning into cactus. cactus reports gesture completion (target node id or none, pointer position, ctrl state); deciding what that means — add an Edge, create a Node — belongs to the client (PDR D8 engine/domain boundary).
- Do NOT render the tab inside `NodeContainer`'s root div — that div has `overflow: hidden`, which clips a protruding tab. Render the tab as a *sibling* of `<NodeContainer>` inside the per-row wrapper div in `AtlasNodeLayer`.
- Do NOT dispatch an `addEdge` for a duplicate or self edge. Core's `addEdge` treats a duplicate as ok-with-no-change (`operations.ts:172`), so recording it in history would push an inverse that *removes the pre-existing edge* on undo. Reject in `isValidConnection` before anything is dispatched.
- Do NOT break the existing `connection.onConnect` contract in cactus (`NodeShell.tsx` uses it). Extend the options additively.
- Do NOT move the camera (R23) and do NOT change the atlas document schema — `AtlasEdge {from, to}` and the `addEdge`/`addNode` actions already exist.
- Do NOT let a tab press start a node drag or a marquee — stop propagation on the tab's pointerdown, and swallow the completing click while armed so it doesn't clear the selection or press a node.

## Plan

### 1. cactus: click-to-arm and drop reporting in the connecting gesture

`packages/cactus/src/interactions/useGesture.ts` (`beginConnect`, lines ~163–241):

- Extend `UseGestureOptions['connection']` with an optional callback:
  `onConnectDrop?: (info: { source: string; sourceHandle: string | null; clientX: number; clientY: number; ctrlKey: boolean }) => void`.
- Factor the completion logic in `handlePointerUp` into one `complete(e)` used by both paths, resolving in this order:
  1. `e.ctrlKey || e.metaKey` and `onConnectDrop` provided → call `onConnectDrop` only.
  2. else an element under the pointer has `data-connection-target` with a `data-node-id` → `isValidConnection` → `onConnect` (unchanged behavior).
  3. else → nothing (cancel).
  Then always: end the perf mark, `setGesture(IDLE)`, remove all listeners, cancel any pending raf.
- Click-to-arm: in `handlePointerUp`, if the pointer has moved less than `DRAG_THRESHOLD` from the initial `clientX/clientY` since `beginConnect`, do NOT complete — stay in the `connecting` gesture ("armed"). Keep the `pointermove` listener (preview keeps following the pointer), remove the `pointerup` listener, and add a **capture-phase** `pointerdown` listener on `window` that calls `e.stopPropagation()` + `e.preventDefault()` and then `complete(e)`. Left button only (ignore other buttons so right-click pan/menu still works).
- Track movement past the threshold across the whole gesture so a drag that returns near its origin still completes on release (threshold gates only the *first* release).

`packages/cactus/src/Canvas.tsx`: add `onConnectDrop` to the `connectionDrag` prop type (line ~38) — it already spreads into the gesture options at line ~407, so the type is the only change.

### 2. Atlas: the Edge Tab (AtlasNodeLayer in `AtlasCanvas.tsx`)

In the `<For>` row (line ~167):

- Add a per-row `hovered` signal set by `onPointerEnter`/`onPointerLeave` on the existing wrapper div — enter/leave use subtree semantics, so hover holds while the pointer moves from the node onto the tab.
- After `<NodeContainer>`, render the tab as an absolutely positioned sibling at the top of the node's right side, protruding past the right edge (R44): position it from `rn.x + delta().dx + rn.w + delta().dw` (minus a couple px overlap) and `rn.y + delta().dy` plus a small top offset, so it tracks drags live. Size ~22px. Content: a circular badge filled `var(--atlas-edge-tab-fill)` with a plus glyph in `var(--atlas-edge-tab-glyph)` (inline SVG or a text "+", centered).
- Tab attributes/behavior: `data-no-pan="true"`; `on:pointerdown` → if left button: `e.stopPropagation()`, then `ctx.startConnection(rn.node.id, null, e.clientX, e.clientY)`.
- Visibility (R45): visible when `hovered()` or when this node is the active source (`ctx.connectionDrag()?.sourceNodeId === rn.node.id`); otherwise `opacity: 0` + `pointer-events: none`, with a short opacity transition — mirror the layout-picker pattern in `NodeContainer.tsx:113–132`.
- Lit state (R50): when this node is the active source, add a visible highlight (e.g. a ring/box-shadow in the fill color and a slight scale).

### 3. Theme tokens (`packages/client/src/index.css`)

Next to `--atlas-container-fill` (line ~215), define:

- `--atlas-edge-tab-fill`: the theme's green — reference the existing color-token vars (`--color-token-moss` / `--color-token-deep-moss`) rather than a hard-coded hex, so it swaps with the theme like the other atlas tokens.
- `--atlas-edge-tab-glyph`: the theme's white glyph color — reuse the theme's on-accent/white token if one exists in this file, else `white`.

Verify both read correctly in dark theme (the token vars are theme-swapped; if `--color-token-moss` is not, add a dark-theme override in the same pattern the surrounding tokens use).

### 4. Atlas wiring (`AtlasCanvas.tsx` main component)

- Add a pure helper in `mutations.ts`: `canConnect(doc, source, target): boolean` — false for `source === target` and for an existing `{from: source, to: target}` edge.
- Add a pure helper in `mutations.ts` for the ctrl-drop: `buildConnectDropActions(doc, sourceId, parentId, droppedAbs, parentAbs): AtlasAction[]` returning `[{type:'addNode', id, name:'New Node', parent?, x, y}, {type:'addEdge', from: sourceId, to: id}]`. Id via `uniqueId('new-node', existingIds)`; position parent-relative via `childAreaOrigin`, mirroring the math in `endDrag` (AtlasCanvas.tsx:424–428).
- Pass to `<Canvas>`:
  - `connectionDrag={{ onConnect, onConnectDrop, isValidConnection: (c) => canConnect(props.doc, c.source, c.target) }}`
  - `onConnect`: `dispatchAction([{type:'addEdge', from: c.source, to: c.target}], 'Add Edge')` (R47, R48).
  - `onConnectDrop`: if `!ctrlKey`, return (a background release just cancels). Else (R52): `parentId = findContainerAt(clientX, clientY)`; compute `droppedAbs` via `canvasRef.screenToCanvas(clientX, clientY)` and `parentAbs` from the parent's render node; dispatch `buildConnectDropActions(...)` with label `'Add Node'`.
  - `renderConnectionPreview={(coords) => <ConnectionPreview d={...} stroke="var(--atlas-edge-tab-fill)" />}` — a straight line (or gentle curve) from `coords.startX/startY` to `coords.currentX/currentY` (R49). Coords are already screen-space; no transform math needed (Canvas.tsx:631–650).

### 5. Toast (R51)

- New `AtlasCanvasProps` callback: `onEdgePreviewChange?: (message: string | null) => void`.
- In `AtlasNodeLayer` (it has `useCanvasContext`), a `createEffect` on `ctx.connectionDrag()`: when non-null, emit `Creating an edge from "{source name}" — release or click a node to connect, Ctrl+click to create a new node`; when null, emit `null`.
- In `AtlasApp.tsx`, mirror the `DRAG_TOAST_ID` fixed-slot pattern (lines 39–48) with a new `EDGE_TOAST_ID = 'atlas-edge-preview'` and pass the setter as `onEdgePreviewChange`.

### 6. Tests

- `mutations.test.ts`: cover `canConnect` (self edge, duplicate edge, valid pair) and `buildConnectDropActions` (root drop → absolute position and no parent; container drop → parent set and position relative to the container's child-area origin; id collision → `new-node-2`; second action is the edge from source to the new id).
- `AtlasCanvas.test.ts`: follow its existing render/interaction patterns to assert (a) each node row renders an edge tab and (b) the tab's pointerdown does not start a node drag (the existing tests show what level of interaction is feasible; at minimum assert the tab renders with the expected data attribute/testid).

## Files to Modify

- `packages/cactus/src/interactions/useGesture.ts` — click-to-arm, `onConnectDrop`, completion resolution
- `packages/cactus/src/Canvas.tsx` — `connectionDrag` prop type gains `onConnectDrop`
- `packages/client/src/apps/atlas/AtlasCanvas.tsx` — tab UI in `AtlasNodeLayer`, connection wiring, preview render, toast effect
- `packages/client/src/apps/atlas/mutations.ts` — `canConnect`, `buildConnectDropActions`
- `packages/client/src/apps/atlas/AtlasApp.tsx` — edge-preview toast slot
- `packages/client/src/index.css` — `--atlas-edge-tab-fill`, `--atlas-edge-tab-glyph`
- `packages/client/src/apps/atlas/__tests__/mutations.test.ts` — helper tests
- `packages/client/src/apps/atlas/__tests__/AtlasCanvas.test.ts` — tab render test

## Verification

```bash
just typecheck
just test-cactus
just test-client
```

## Out of Scope

- Edge deletion UI (bisect/context-menu already covers edges) and edge labels
- Ports / typed handles (`sourceHandle` stays `null` for Atlas)
- Esc-to-cancel while armed (a background click already cancels; not in R44–R52)
- Adopting the extended gesture in the Canvas or Dataflow apps

## Notes

- `NodeContainer` already carries `data-connection-target="true"` — containers are valid destinations, matching "any Node" in the requirements.
- The requirements doc edit (R44–R52) is already committed on the trunk branch; do not edit `.rhidoc/`.
- Watch stacking: the tab is a sibling drawn after its `NodeContainer`, so it paints above it; nodes drawn later (children) may overlap a tab — acceptable for v1.
- `beginConnect` currently has no button guard; the tab's own handler gates left-button, but the armed-completion listener must also ignore non-left buttons.
