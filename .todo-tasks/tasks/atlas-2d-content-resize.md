# Diagonal and horizontal content resize (contentWidth)

## Motivation

Content resize is vertical only. A user should be able to widen a Node and resize
both dimensions at once with a corner grip. This adds a stored `contentWidth`
(mirror of `contentHeight`) and diagonal/horizontal handles that feed the unified
resize builder from `atlas-live-layout-override`.

## The design (settled)

Width composes cleanly through the live-override primitives: a width change is
`growSelf(Δw)` + `growAncestors` with **no child shift** (widening does not push
children down). Height already shifts children (the header band grows). The corner
grip feeds both `Δw` and `Δh`; edge grips feed one.

## Do NOT

- **Do NOT** reintroduce a self-only resize path. Route every resize delta through
  the `layoutDeltas` memo and its primitives (`shiftSubtree`/`growAncestors`) from
  the previous phase, so children and ancestors track width/height live.
- **Do NOT** let `contentWidth` shrink a container below its children's extent —
  a container's width stays `max(contentWidth ?? NODE_WIDTH, children extent)`.
- **Do NOT** invent a new resize gesture in cactus. Extend the Atlas content-resize
  handle; you may mirror cactus's `ResizeDirection` type (`useGesture.ts:6`) for the
  handle's direction, but the domain writes `contentWidth`/`contentHeight`.
- **Do NOT** skip the schema-doc update — a new stored field requires it (see below).

## Plan

### 1. `contentWidth` field (`packages/core/src/atlas/types.ts` + operations + document)

Add `contentWidth?: number` to the Atlas node type. Patch/clear it in `setNode`
(same delete-on-`undefined` semantics as `contentHeight`), and parse/serialize it
in `document.ts`. Update the schema mirror and the relevant `.claude/skills/` doc
in the same change (CLAUDE.md schema-change rule).

### 2. Width in the projection (`projection.ts`)

Add `leafWidth(node) = node.contentWidth ?? NODE_WIDTH`. Leaf size width uses it;
container width becomes `max(node.contentWidth ?? NODE_WIDTH, children extent + 2*PAD)`
(`sizeOf`, `:149`). Mirror `leafHeight`/`containerHeaderHeight` structure.

### 3. Handles: diagonal corner + horizontal edge (`AtlasNodeContent.tsx`)

Replace/augment the bottom-edge handle with:
- a **corner grip** (bottom-right) driving both `Δw` and `Δh`,
- a **horizontal edge grip** (right edge) driving `Δw`,
- the existing **vertical edge grip** (bottom) driving `Δh`.

Each uses native `on:pointerdown` (so it does not start a Node drag — the fix from
`atlas-interaction-and-content-fixes`), tracks a live preview, and commits on
release. Extend the preview signal to carry `{ width?, height? }` (or a 2-tuple).

### 4. Wire preview + commit through the override (`AtlasCanvas.tsx`)

Extend `previewContentHeight` → a `previewContentSize` carrying width and/or height,
and feed it into the `layoutDeltas` builder: `Δw → growSelf + growAncestors`,
`Δh → growSelf + shiftSubtree(children) + growAncestors` (as established). Commit
dispatches `setNode` with `contentWidth`/`contentHeight` as one `dispatchAction`
("Resize Content").

### 5. Tests

- `operations.test.ts` — `setNode` patches/clears `contentWidth`.
- `projection.test.ts` — width override sizes a leaf and floors a container width;
  children extent still wins when larger.
- resize builder — a width drag grows the Node and its ancestor with no child shift;
  a diagonal drag does both.

## Files to Modify

- `packages/core/src/atlas/types.ts`, `operations.ts`, `document.ts` — `contentWidth`.
- Schema mirror / `.claude/skills/` doc — new field.
- `packages/client/src/apps/atlas/projection.ts` — `leafWidth`, container width floor.
- `packages/client/src/apps/atlas/AtlasNodeContent.tsx` — corner + edge grips (native pointerdown), 2D preview.
- `packages/client/src/apps/atlas/AtlasCanvas.tsx` — `previewContentSize`; width into the `layoutDeltas` builder; 2D commit.
- `packages/core/src/atlas/operations.test.ts`, `packages/client/src/apps/atlas/projection.test.ts` — coverage.

## Verification

```bash
pnpm -C packages/core exec tsgo --noEmit
pnpm -C packages/client exec tsgo --noEmit
pnpm -C packages/core exec vitest run
pnpm -C packages/client exec vitest run
```

## Out of Scope

- Left/top-edge resize (origin-shifting) — same deferred class as negative expansion.
- Conditional content scroll — next phase.
- Auto-fit-to-content sizing.

## Notes

- `contentWidth`/`contentHeight` are covered by undo/redo's `setNode` inversion
  automatically (before-value re-supplied) — resize stays one undoable step.

## Surface after this phase

- Atlas nodes carry `contentWidth`; `setNode` patches/clears it; it round-trips.
- `projection.ts` sizes width from `contentWidth ?? NODE_WIDTH` (container floored to
  children extent).
- A corner grip resizes both dimensions and edge grips one; all route through the
  unified `layoutDeltas` builder, so children/ancestors track live.
- Not built: left/top-edge (origin-shifting) resize, conditional scroll.
