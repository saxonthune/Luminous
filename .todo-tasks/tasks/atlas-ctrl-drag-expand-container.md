# Ctrl-drag expands the container to contain the Node, with a live preview (R5)

## Motivation

R5 (doc01.07.04) is a written requirement with no implementation: no Atlas code
reads `ctrlKey`. When the user drags a Node out past its Container's bounds while
holding Ctrl, the Container should **keep the Node as a member** and **expand to
contain it**, propagating the growth up every ancestor — instead of removing the
Node from the Container (the default drag-out behavior).

The full behavior:
- While Ctrl is held mid-drag, each ancestor Container grows every frame so its
  child area contains the dragged subtree's live position.
- Releasing Ctrl snaps sizes back to their committed values.
- Pressing Ctrl while the Node is already dragged out snaps the boundaries to fit.
- The membership toast (`onPendingMembershipChange`) shows nothing while Ctrl is
  held — no membership change is occurring.
- On drop with Ctrl held, the Node stays in its current Container and its position
  persists; shrink-wrap then includes it permanently.

## The design (settled)

**Who's involved: the dragged Node's ancestor chain only** — the mirror of the
subtree-drag work (which moved *descendants*). The set is `selfAndAncestors(id,
parentOf)` (exported, `AtlasCanvas.tsx:45`), O(depth).

**Union = re-running shrink-wrap with the live position.** A Container's size is
already the bounding box of its children (`projection.ts` `sizeOf`, `:141-149`).
The Ctrl-expand size is the same `max`, but with the child on the path using its
**live** extent (committed relative position + drag delta, in the parent's
child-area frame) instead of its committed one.

**Efficient shape: one memo down the path, not per-row.** Computing each
ancestor's expanded size independently is O(depth²). Instead, a single memo walks
`selfAndAncestors(draggingId)` **bottom-up**, computing each ancestor's live size
from the child-below's live size, and returns `Map<ancestorId, {w,h}>`. Rows read
`liveSizes().get(rn.node.id) ?? rn` — O(1) each, O(depth) total per frame. This is
the same live-override pattern as the color and content-height previews. Snap-back
is free: no Ctrl → the memo returns empty → rows render committed sizes.

## Do NOT

- **Do NOT** re-run the whole `projectAtlasNodes` every frame to get expanded
  sizes. Compute only along the ancestor path (the memo above).
- **Do NOT** introduce slack/margins — "expand to contain" is the tight bounding
  box (union), matching the existing shrink-wrap. A Container never exceeds what it
  must contain.
- **Do NOT** change membership on a Ctrl-drop. Ctrl held → keep the current parent
  (skip `resolveDrop`'s reparent), persist the position. Ctrl absent → the existing
  drop/reparent behavior is unchanged.
- **Do NOT** try to expand up/left (negative-direction growth past the child-area
  origin) in this task — that shifts the Container's own origin and cascades. Handle
  the down/right case (the common one) and clamp/ignore negative for now; file the
  origin-shift case as a follow-up.
- **Do NOT** move the camera (R23).

## Plan

### 1. A Ctrl-held signal that tracks the modifier during a drag (`AtlasCanvas.tsx`)

Ctrl can be pressed or released mid-drag with no pointer event, so listen for
`keydown`/`keyup` of `Control`/`Meta` while a drag is active and mirror into a
`ctrlHeld` signal (seed it from the pointerdown event's `ctrlKey/metaKey`). Clear
on drag end.

### 2. The live-size override memo (`AtlasCanvas.tsx` / `AtlasNodeLayer`)

Add a memo that returns `Map<nodeId, {w,h}>` of expanded sizes when `ctrlHeld()`
and a Node is being dragged, else empty. Walk `selfAndAncestors(draggingId)`
bottom-up: for each ancestor `A`, the path-child's live extent (in `A`'s child-area
frame) is its committed extent plus the drag delta (and, above the first level,
the child's own already-expanded live size). `A`'s live size mirrors `sizeOf`'s
formula (`projection.ts:149`) with that substituted extent. Reuse `childAreaOrigin`
/ `containerHeaderHeight` so the header band is respected.

Rows apply it: the `NodeContainer` `w`/`h` (`AtlasCanvas.tsx:142-148`) read
`liveSizes().get(rn.node.id) ?? committed`, composing with the existing
content-height resize preview.

### 3. Suppress the membership toast while Ctrl is held (`AtlasCanvas.tsx`)

In `dragPointerMove` (`:272-275`), when `ctrlHeld()`, pass `null` to
`onPendingMembershipChange` instead of `describePendingDrop(...)` — no membership
change is happening.

### 4. Ctrl-drop keeps membership and persists position (`AtlasCanvas.tsx` `endDrag`)

In `endDrag` (`:283-316`), when `ctrlHeld()`: skip the reparent (keep the Node's
current parent), and write the position relative to that current parent's child
area (same `childAreaOrigin` inverse as today). The permanent expansion then comes
from the normal projection: shrink-wrap now includes the Node at its new position.
When Ctrl is absent, the current reparent/remove path is unchanged.

### 5. Tests (`AtlasCanvas.test.tsx` / a focused unit)

- The live-size memo: dragging a nested Node by a delta with Ctrl held expands each
  ancestor on the path by the expected amount; a sibling branch is unchanged; Ctrl
  absent yields an empty override (extract the path-size computation as a pure
  function and unit-test it).
- `endDrag` with Ctrl held keeps the parent and persists position; without Ctrl,
  a drag fully outside removes the Node from the Container as before.
- The toast is suppressed while Ctrl is held.

## Files to Modify

- `packages/client/src/apps/atlas/AtlasCanvas.tsx` — `ctrlHeld` signal; live-size override memo; toast suppression; `endDrag` keep-membership branch.
- `packages/client/src/apps/atlas/projection.ts` — export a pure helper for the path-size computation if it shares `sizeOf`'s formula (keep the `max`/header math in one place).
- `packages/client/src/apps/atlas/AtlasCanvas.test.tsx` (+ `projection.test.ts`) — coverage above.

## Verification

```bash
pnpm -C packages/client exec tsgo --noEmit
pnpm -C packages/client exec vitest run
```

## Out of Scope

- Negative-direction expansion (dragging up/left past the child-area origin), which
  shifts the Container origin — file as a follow-up.
- Expansion during Ctrl-drag of a **top-level** Node (no ancestor to expand) — a
  no-op here.
- Any change to the non-Ctrl drop/reparent behavior.

## Notes

- This composes with the merged subtree-drag work: descendants move via the drag
  delta; ancestors resize via this memo — disjoint sets, `draggingId` the shared
  input.
- Snap-back needs no revert code: it is the absence of the override. Ensure the
  memo depends on `ctrlHeld()` and `draggingId()` so a keyup recomputes it empty.

## Surface after this phase

- Holding Ctrl while dragging a Node keeps it in its Container and expands each
  ancestor Container live to contain it (down/right), via an O(depth) ancestor-path
  size-override memo; releasing Ctrl snaps sizes back.
- The membership toast is silent while Ctrl is held; a Ctrl-drop persists the
  position and keeps membership, and shrink-wrap makes the expansion permanent.
- Non-Ctrl drag/drop/reparent behavior is unchanged.
- Not built: negative-direction (origin-shifting) expansion.
