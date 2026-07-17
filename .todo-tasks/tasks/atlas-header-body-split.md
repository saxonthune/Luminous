# A container Node has two rects: a header band and a child area

## Motivation

Today a Node is a single rect. Its own content (title, switcher, body) fills the
whole rect (`AtlasNodeContent`, `h-full w-full`), and its children are drawn as
separate absolutely-positioned rects starting at parent-relative `(0,0)` — so
children sit directly over the parent's own title and description. That overlap is
the visible bug: a container's content and its children occupy the same rectangle.

The keystone fix: a container Node is **two stacked rects** — a **header band**
(its own content) and a **child area** below it, separated by a reserved inset.
This is the standard compound/group-node model (ELK `padding`, GoJS `Placeholder`,
the CSS content-box): the child-bearing rect is the node rect shrunk by a known
inset. It also *simplifies* geometry — header size is the Node's intrinsic size,
child-area size is a pure function of children, and the two compose by stacking.

## Do NOT

- **Do NOT** modify `resolveAbsolutePositionByParentOf` or anything in
  `packages/cactus/src/geometry`. The header band is Atlas domain meaning, not
  engine geometry — apply the inset inside the Atlas projection, keeping the
  generic resolver untouched (Dataflow shares it). Engine/domain boundary.
- **Do NOT** introduce a live constraint/solver. Sizing stays the existing pure
  bottom-up recursion; positioning stays the top-down fold. You are only inserting
  one reserved offset.
- **Do NOT** let the header offset drift between the projection fold and
  `endDrag`'s inverse. Both must reference a single `childAreaOrigin` helper, or a
  dropped child's stored position will not round-trip.
- **Do NOT** refine drop hit-testing to the child area in this task — dropping
  anywhere on a container still adds to it (v1). Only the *visual* reservation,
  *sizing*, and the `childArea` helper (for arrange's overlap check) change here.
- **Do NOT** reserve a header band for **leaf** Nodes — a leaf has no child area;
  its whole rect is its content. Only Nodes with children get the split.

## Plan

### 1. One source for the reserved inset (`projection.ts`)

Add constants and a helper:

```ts
export const CONTAINER_HEADER = 72; // reserved band for a container's own content
// childAreaOrigin is parent-relative: where a container's children begin.
export function childAreaOrigin(): { x: number; y: number } {
  return { x: CONTAINER_PADDING, y: CONTAINER_HEADER };
}
```

### 2. Reserve the header in sizing and thread the offset in the fold (`projection.ts`)

In `sizeOf` (`projection.ts:80-100`), a container's height becomes
`CONTAINER_HEADER + wrap_h + CONTAINER_PADDING` and its width `max(NODE_WIDTH,
wrap_w + 2*CONTAINER_PADDING)`, where `wrap_*` is the current children extent.

When seeding `relativePositions` for a **child** (a node with a parent), add
`childAreaOrigin()` to its stored/tidy relative position so the existing fold
places it inside the child area. Keep leaves and top-level nodes unchanged.
Verify grandchildren still resolve correctly (the offset is applied per parent
level, so it composes down the tree).

Export a `childArea(rn: AtlasRenderNode)` returning the absolute child-area rect
(`x+PAD, y+CONTAINER_HEADER, w-2*PAD, h-CONTAINER_HEADER-PAD`) for arrange/overlap.

### 3. Keep the persist inverse consistent (`AtlasCanvas.tsx` `endDrag` / `mutations.ts`)

`endDrag` (`AtlasCanvas.tsx:162-187`) computes the dropped Node's new
parent-relative position via `applyDrop`/`resolveDrop` (`mutations.ts`), which
subtracts `parentAbs` from `droppedAbs`. It must **also subtract
`childAreaOrigin()`** when the new parent is a container, so a child stored at
relative `(0,0)` lands at the child-area origin, not the parent's top-left.
Route through the same helper from step 1.

### 4. Constrain the parent's own content to the header band (`AtlasNodeContent.tsx` / render row)

When a Node has children (`rn.hasChildren`), its own `AtlasNodeContent` must
render only within the header band, not the full box — otherwise long content
bleeds behind the children. Clamp the content region to `CONTAINER_HEADER` with
`overflow: hidden`/scroll. A leaf still fills its whole box. The row already knows
`rn.hasChildren` (`AtlasCanvas.tsx:99`); thread it into `AtlasNodeContent` (or set
a max-height on the content wrapper) so the read view is bounded for containers.

### 5. Point arrange's overlap check at the child area (`arrange.ts`)

`arrange.ts` (from `atlas-arrange-as-column`) places a column and shifts it to
avoid non-selected siblings (R30). Update its overlap/anchor math to operate
within `childArea(parent)` rather than the parent's full rect, so arranged
columns sit below the header, not over it.

## Files to Modify

- `packages/client/src/apps/atlas/projection.ts` — `CONTAINER_HEADER`, `childAreaOrigin`, `childArea`; reserve header in `sizeOf`; offset children in the fold.
- `packages/client/src/apps/atlas/AtlasCanvas.tsx` — thread `hasChildren` into the content render; ensure `endDrag` uses the header inset.
- `packages/client/src/apps/atlas/mutations.ts` — subtract `childAreaOrigin` in the drop→relative computation for container parents.
- `packages/client/src/apps/atlas/AtlasNodeContent.tsx` — bound the read view to the header band when the Node has children.
- `packages/client/src/apps/atlas/arrange.ts` — anchor/overlap math within `childArea`.
- `packages/client/src/apps/atlas/projection.test.ts` (+ `arrange.test.ts`) — assert children resolve below the header; container size includes the band; a dropped child round-trips its stored position through the inset.

## Verification

```bash
pnpm -C packages/client exec tsgo --noEmit
pnpm -C packages/client exec vitest run
```

## Out of Scope

- Refining drop hit-testing to the child area (still whole-rect in v1).
- Content resizing / a stored content height — next phase (`atlas-content-sizing`).
- A per-node variable header height — fixed `CONTAINER_HEADER` for now.
- Any cactus geometry change.

## Notes

- **Round-trip is the risk.** The fold adds `childAreaOrigin` and `endDrag` must
  subtract it; a test that drops a child and re-projects it to the same screen
  position guards this coupling. Watch it in review.
- The previous phase (`atlas-drag-moves-subtree`) makes descendants follow a drag
  by an additive delta; this phase's header offset is a separate additive term on
  the same absolute positions — they compose without interaction.

## Surface after this phase

- `projection.ts` exports `CONTAINER_HEADER`, `childAreaOrigin(): {x,y}`, and
  `childArea(rn): {x,y,w,h}` (absolute child-area rect). A container's size
  reserves the header band; children fold into the child area; leaves and
  top-level nodes are unchanged.
- A container renders its own content only within the header band; children draw
  below it without overlapping the content.
- Dropped children round-trip: stored parent-relative position is measured from
  the child-area origin, consistent between the fold and `endDrag`.
- Arrange (`arrange.ts`) places columns within `childArea(parent)`.
- Still v1: drop hit-testing is whole-rect (not child-area); header height is a
  fixed constant; no content resizing.
