# Atlas: marquee select + middle-drag pan

## Motivation

Atlas has no selection box and pans on left-drag, unlike Dataflow which already
uses cactus's `boxSelect={{ trigger:'drag' }}` (left-drag marquees, middle-drag
pans). This phase gives Atlas the same select tool (doc01.07.04 R33–R35, R41) and
restricts the Node move to the header/frame so a press on a container's interior
starts a marquee instead of moving the container (R36).

This phase runs after `atlas-container-component`, which drew the container as an
inset bordered box (marked `data-soft-container="true"`) and established the
header/frame as the move surface.

## Do NOT

- Do NOT change node drawing, the bezel, the container box, or `projection.ts`
  geometry — that was the previous phase.
- Do NOT change resize behavior or size fields — that is `atlas-node-resize`.
- Do NOT break Dataflow's box-select. If you change `useGesture`'s marquee
  handler, keep the existing `trigger: 'shift-drag'` and `trigger: 'drag'`
  behavior intact for Dataflow (which does not want container interiors to
  marquee — it has none). Gate the new "marquee starts on a container interior"
  behavior so it does not regress Dataflow.
- Do NOT remove middle-drag pan — it must keep working (`shouldViewportPan` in
  `useViewport.ts` already passes middle-drag; `boxSelect.trigger:'drag'` sets
  `leftDragPan:false`).

## Plan

### 1. Turn on box-select in `AtlasCanvas.tsx`

Mirror `DataflowCanvas.tsx`'s `<Canvas boxSelect={{ trigger:'drag', getNodeRects }}>`:
- Add `boxSelect={{ trigger:'drag', getNodeRects: () => nodes().map(rn => ({ id: rn.node.id, x: rn.x, y: rn.y, width: rn.w, height: rn.h })) }}`.
- Add `onSelectionChange` if a selected-count indicator is wanted (optional; copy
  Dataflow's small toast if cheap).
- Passing `trigger:'drag'` makes cactus set `leftDragPan:false`, so left-drag
  marquees and middle-drag pans. This satisfies R33, R35 (background click clears
  in drag mode — already implemented in `useGesture.ts`), and R41.

### 2. Let a press on a container interior start a marquee

`useGesture.ts`'s marquee `handleContainerPointerDown` currently bails when the
target is inside `[data-container-id]` (so it never marquees over a node). Atlas
wants a press on a **container interior** (the `data-soft-container` box, empty
area between children) to start a marquee (R34), while a press on a child node,
the header, or the frame does not.

- Relax the guard so that a press whose nearest node ancestor is a container's
  interior surface (`[data-soft-container]`) — and not a child node, header, or
  interactive control — starts the marquee. A press on a leaf node, a node
  header, a resize/frame grip, or any `[data-no-pan]` interactive control must
  still NOT marquee.
- Keep this behavior opt-in/backward-safe: Dataflow's nodes are not soft
  containers, so its behavior is unchanged. Prefer keying the new path off the
  presence of `[data-soft-container]` under the pointer with no closer
  `[data-node-id]` child, rather than loosening the `[data-container-id]` guard
  wholesale.

### 3. Restrict the Node move to header/frame (R36)

Today `AtlasNodeLayer`'s `NodeContainer` `onPointerDown` calls
`gesture.beginPress(rn.node.id, e)` for a press anywhere on the node, so a
container body-drag moves the container. R36: a container moves only from its
header or frame; its interior marquees.

- In `AtlasNodeLayer`, gate `beginPress` so it starts a move only when the press
  originates on the node's header or frame (the bezel/frame region or title row),
  not on the container interior (`data-soft-container`) or the Content band.
- A leaf Node has no container interior, so a press anywhere on a leaf still moves
  it (R36's last sentence) — do not restrict leaves.
- Ensure the interior-press falls through to the canvas so step 2's marquee
  handler receives it (the container `onPointerDown` must not `stopPropagation`
  the interior press, and must not `beginPress`).

## Files to Modify

- `packages/client/src/apps/atlas/AtlasCanvas.tsx` — `boxSelect` prop; gate
  `beginPress` to header/frame; optional selection indicator.
- `packages/cactus/src/interactions/useGesture.ts` — allow a container-interior
  press to start a marquee without regressing Dataflow.
- `packages/cactus/src/NodeContainer.tsx` — only if a hook/attribute is needed to
  distinguish "interior" from "header/frame" for the press gate (keep neutral for
  other apps).
- `packages/client/src/apps/atlas/__tests__/` — add a test for the marquee-on-
  container-interior and header-only-move behavior if the existing harness
  supports pointer simulation; otherwise add a unit test around the gate helper.

## Verification

```bash
just typecheck-client 2>/dev/null || pnpm -C packages/client exec tsgo --noEmit -p tsconfig.json
pnpm -C packages/client exec vitest run src/apps/atlas
pnpm -C packages/cactus exec vitest run
pnpm -C packages/client exec vitest run src/apps/dataflow
```

## Out of Scope

- Node resize and the size floor (`atlas-node-resize`).
- Any new selection-driven commands beyond what already exists (arrange, etc.).

## Notes

- The sharp edge is step 2 vs step 3: the interior press must NOT be consumed by
  `NodeContainer` (else the canvas-level marquee listener never sees it). Trace
  the native `on:pointerdown` on `NodeContainer` (fires during bubbling before
  the canvas listener) — the interior case must neither `beginPress` nor
  `stopPropagation`.
- Verify Dataflow still selects with left-drag and still moves boxes with
  body-drag (its boxes are not soft containers, so the new interior path must not
  fire for them).

## Surface after this phase

- Atlas's `<Canvas>` is configured with `boxSelect={{ trigger:'drag', getNodeRects }}`;
  left-drag on the canvas background or a container interior draws a marquee,
  middle-drag pans, a plain background click clears the selection.
- A container Node moves only from its header/frame; its interior marquees. A
  leaf Node still moves from anywhere on it.
- `useGesture.ts`'s marquee handler recognizes a container-interior press
  (`data-soft-container`) as a marquee start, gated so Dataflow (no soft
  containers) is unchanged; its `trigger` union and shift-drag/drag behavior are
  otherwise intact.
- Node drawing, geometry, the bezel/container box, and `contentWidth`/`contentHeight`
  are unchanged from the previous phase — untouched here.
