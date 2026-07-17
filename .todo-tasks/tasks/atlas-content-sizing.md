# Content sizing: clamp-and-scroll by default, optional resizable header band

## Motivation

A Node can carry large content (a C# interface with many methods, a long prose
note) and *also* be a container. With the header/child-area split
(`atlas-header-body-split`) the two are independent bands, so big content is just
a taller header — no conflict with children. This task gives the user control over
the header band's size: a sensible default, then an opt-in resize.

Two levels, shipped in order:
1. **Default: clamp + scroll.** The header band has a bounded height; overflow
   scrolls. Code content already does this (`AtlasNodeContent.tsx:125`,
   `max-h-16 overflow-auto`); generalize it to the markdown read view too.
2. **Optional: a resizable content band.** A drag handle on the header's bottom
   edge writes a stored per-Node content height. Growing it grows the header,
   which grows the Node; because sizing is a pure bottom-up recursion and
   positioning a top-down fold, re-projection propagates the growth to ancestors
   and repositions the child area automatically — no impact-analysis code.

## Do NOT

- **Do NOT** build an "impacted nodes" analyzer or a `createSelector` to drive the
  resize. The projection memo (`projectAtlasNodes` over `props.doc`) *is* the
  propagation: write the stored height, re-project, done. The affected ancestor
  chain is exactly what the sizing recursion already visits.
- **Do NOT** reflow **manual/loose** siblings when a Node grows. Manual positions
  do not auto-reflow (the loose-canvas contract); a grown Node may overlap a
  manual sibling, which is the existing overlap case handled by the future
  space-finder — not this task's concern.
- **Do NOT** make `CONTAINER_HEADER` dynamic globally. Introduce a *per-Node*
  stored content height that overrides the fixed band for that Node only; absent
  the field, the fixed `CONTAINER_HEADER` (from the split phase) still applies.
- **Do NOT** add a resize handle that collides with the existing resize gesture
  for whole-Node sizing (if present) or the layout picker — place the content
  handle on the header/body divider and stop its pointerdown from reaching drag.

## Plan

### 1. Default clamp + scroll (`AtlasNodeContent.tsx`)

Bound the markdown read view the way code already is: give the content region a
max-height and `overflow: auto` so long content scrolls inside the header band
rather than bleeding. Confirm it composes with the split phase's header-band
clamp (containers) and looks right for leaves (whose whole box is content).

### 2. A stored per-Node content height (`packages/core/src/atlas/types.ts` + operations)

Add an optional `contentHeight?: number` to the Atlas node type. Extend `setNode`
(`operations.ts`) to patch it (same delete-on-`undefined` semantics as the other
fields), and the document parse/serialize path so it round-trips. This is a
schema change — **update the schema mirror and doc per CLAUDE.md** (the atlas
node shape; check whether `.claude/skills/` references the atlas node fields and
update in the same change).

### 3. Header height reads the stored override (`projection.ts`)

Where `atlas-header-body-split` uses the fixed `CONTAINER_HEADER`, prefer the
Node's `contentHeight` when set: `headerHeight(node) = node.contentHeight ??
CONTAINER_HEADER` for containers, and for a **leaf** the stored height overrides
the constant `NODE_HEIGHT`. Sizing and the fold already flow from these numbers,
so no other projection change is needed.

### 4. A resize handle on the header/body divider (`AtlasNodeContent.tsx` or a small handle component)

Add a drag handle at the bottom edge of the header band. On drag it sets a live
preview height (local signal, like the color preview) and on release dispatches a
`setNode` with the new `contentHeight`. Stop its pointerdown from reaching the
Node drag. Persist through the existing dispatch seam (as of the undo/redo phase,
route via `dispatchAction` with label "Resize Content" so it is one undo step).

### 5. Tests

- `operations.test.ts` — `setNode` patches and clears `contentHeight`.
- `projection.test.ts` — a Node with `contentHeight` sizes its header to that
  value; its container ancestor's size grows to include it; the child area shifts
  down by the new header.

## Files to Modify

- `packages/core/src/atlas/types.ts` — `contentHeight?: number` on the node.
- `packages/core/src/atlas/operations.ts` — patch/clear `contentHeight` in `setNode`.
- `packages/core/src/atlas/document.ts` — parse/serialize the field.
- `packages/client/src/apps/atlas/projection.ts` — `headerHeight(node)` reads the override.
- `packages/client/src/apps/atlas/AtlasNodeContent.tsx` — clamp+scroll default; resize handle + live preview.
- `packages/client/src/apps/atlas/AtlasCanvas.tsx` — dispatch the `contentHeight` `setNode` (via `dispatchAction`).
- Schema mirror / relevant `.claude/skills/` doc — reflect the new field.
- `packages/core/src/atlas/operations.test.ts`, `packages/client/src/apps/atlas/projection.test.ts` — coverage.

## Verification

```bash
pnpm -C packages/core exec tsgo --noEmit
pnpm -C packages/client exec tsgo --noEmit
pnpm -C packages/core exec vitest run
pnpm -C packages/client exec vitest run
```

## Out of Scope

- Reflowing manual siblings around a grown Node (future space-finder).
- Auto-growing the header to fit content without a stored height (measure-based
  autosize) — explicit stored height only, for now.
- Horizontal content resizing / Node width control.

## Notes

- The propagation is free because `atlas-header-body-split` made header size and
  child-area size independent and both pure. This task only feeds a per-Node
  number into the header side.
- `contentHeight` is a new stored field: the undo/redo phase's `setNode`
  inversion covers it automatically (it inverts by re-supplying the before-value),
  so resize is undoable with no history change.

## Surface after this phase

- Atlas nodes carry an optional `contentHeight`; `setNode` patches/clears it and
  it round-trips through the document.
- `projection.ts` sizes a Node's header band from `contentHeight ?? CONTAINER_HEADER`
  (leaf: `?? NODE_HEIGHT`); re-projection propagates growth to ancestors and shifts
  child areas, with no impact-analysis code.
- The read view clamps and scrolls by default; a header/body divider handle lets
  the user set `contentHeight`, dispatched as one undoable `setNode`.
- Not built: measure-based autosize, sibling reflow, width control.
