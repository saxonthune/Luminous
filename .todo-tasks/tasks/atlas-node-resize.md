# Atlas: resize a Node from its frame, with a children-extent floor

## Motivation

Atlas can resize a leaf's content box today (three grips in `AtlasNodeContent.tsx`
writing `contentWidth`/`contentHeight`), but a **container** cannot be sized: its
size is pure shrink-wrap over its children, and there is no way to give it empty
room. This phase makes the frame grip size the **container box** and makes the
stored size a **floor** the user can drag past — never smaller than the children's
extent (doc01.07.04 R37–R39).

Runs after `atlas-container-component` (which drew the container box, made the
header a fixed constant, and reserved `contentWidth`/`contentHeight` as the
container-box floor's storage with `shrinkWrapSize` as the single seam) and
`atlas-marquee-select` (frame is the move+resize surface; interior marquees).

Settled decisions (do not reopen):
- Minimum container size = the extent of its children; a container may be **larger**
  than that extent (R38, R39).
- The header auto-sizes (fixed constant); the frame grip sizes the container box.

## Do NOT

- Do NOT let a resize shrink a container below its children's extent — the
  children-extent term must always win when it is larger (R38). Clipping children
  is a bug, not a feature.
- Do NOT add DOM measurement to `projection.ts`.
- Do NOT change marquee/pan/move behavior (previous phase) or the bezel/box
  drawing and header composition (the phase before it).
- Do NOT add new atlas schema fields — reuse `contentWidth`/`contentHeight` as the
  container-box floor. (Leaves already use them as whole-box size; keep that.)
- Do NOT reintroduce a draggable header band — the header is fixed now.

## Plan

### 1. Size floor in `projection.ts`

`shrinkWrapSize(node, maxX, maxY)` currently returns the child-extent-derived
size (with the bezel inset from the previous phase). Make the stored floor apply:

- Compute `size = { w: max(childExtentW, storedW), h: max(childExtentH, storedH) }`
  where `storedW = node.contentWidth`, `storedH = node.contentHeight` (when set),
  and `childExtentW/H` is the existing bezel-inclusive shrink-wrap result. A
  container with no stored size behaves exactly as the previous phase (pure
  shrink-wrap); a stored size only ever grows it.
- Keep `growAncestors`/`sizeOf` single-sourced through `shrinkWrapSize` so the
  live grow during a resize matches the committed re-projection.

### 2. Frame resize sizes the container box

The existing grips in `AtlasNodeContent.tsx` (`beginResize`, the right/bottom/
corner handles) currently drive `onResizePreview`/`onResizeCommit`, which
`AtlasCanvas.tsx` turns into a `setNode` with `contentWidth`/`contentHeight`.

- For a **leaf**, keep today's behavior (grips size the whole box). No change.
- For a **container**, the grips must size the **container box** (the floor from
  step 1), not the header band (which no longer exists as a resizable thing).
  The preview math in `AtlasCanvas.tsx`'s `layoutDeltas` currently, for a height
  delta, grows the header and `shiftSubtree`s children down. That is wrong under
  the new model: growing a container should add empty room to the container box
  (extend the frame), NOT push children. Rework the container branch of the
  content-resize preview so a width/height delta grows the container box past its
  children-extent floor without moving children, and `growAncestors` still
  contains it.
- Ensure the resize grip lives on the Node **frame** (R37) and that a resize
  press is distinguishable from a move press (frame move) and an interior marquee
  — the resize grip already sets `data-no-pan` and stops propagation; keep that
  so neither move nor marquee fires on a grip press.

### 3. Persist and round-trip

- On release, `onResizeCommit` persists `contentWidth`/`contentHeight` via the
  existing `resizeContent` `setNode` path in `AtlasCanvas.tsx` — unchanged wiring,
  but for a container these now mean the container-box floor. Confirm reload
  re-derives the same size (`projectAtlasNodes` → `shrinkWrapSize` with the floor).
- Confirm undo/redo still works (it routes through `dispatchAction`).

## Files to Modify

- `packages/client/src/apps/atlas/projection.ts` — `shrinkWrapSize` floor
  (`max(childExtent, stored)` on both axes).
- `packages/client/src/apps/atlas/AtlasCanvas.tsx` — container branch of the
  content-resize preview in `layoutDeltas` (grow the box, do not shift children);
  keep leaf behavior.
- `packages/client/src/apps/atlas/AtlasNodeContent.tsx` — grips positioned on the
  Node frame; container vs leaf resize target.
- `packages/client/src/apps/atlas/layoutOverride.ts` — only if the preview rework
  needs a new/adjusted primitive (prefer reusing `growAncestors`; `shiftSubtree`
  for children should NOT be used in the container-resize branch anymore).
- `packages/client/src/apps/atlas/__tests__/` — test the floor
  (`max(childExtent, stored)`) and that a container resize never clips children.

## Verification

```bash
just typecheck-client 2>/dev/null || pnpm -C packages/client exec tsgo --noEmit -p tsconfig.json
pnpm -C packages/client exec vitest run src/apps/atlas
```

## Out of Scope

- Origin-shifting (top/left) resize — grips stay right/bottom/corner.
- Marquee, pan, move, bezel/box drawing (earlier phases).

## Notes

- The subtle bug to avoid: under the old model a height resize grew the header and
  pushed children down (`shiftSubtree(..., includeRoot:false)` in `layoutDeltas`).
  Under the new model that is wrong — a container height resize adds empty room
  below the children, it does not move them. Make sure the container branch no
  longer shifts children.
- Leaves and containers now diverge in what the grips mean; keep the branch
  explicit and tested.

## Surface after this phase

- A container Node can be resized larger than its children's extent from its
  frame grip; it can never be sized smaller than that extent (children never
  clip). `shrinkWrapSize` returns `max(childExtent, stored)` on both axes.
- `contentWidth`/`contentHeight` now fully mean the container-box floor for
  containers and the whole-box size for leaves; both persist and round-trip via
  the existing `setNode` path, with undo/redo intact.
- Marquee/pan/move (previous phase) and the bezel/container box + header
  composition (the phase before) are unchanged.
