# Atlas: Container as a nested box-component with a bezel

## Motivation

Today an Atlas container Node reserves a fixed top band (`CONTAINER_HEADER`) for
its own title/content and draws its children in the empty space below, framed
only by the `data-soft-container` div at `inset:0`. There is no visible boundary
around the child area, so "where the container holds its children" is invisible,
and the whole node body acts as a move handle — which the next phase (marquee
select) needs to stop doing.

This phase makes the **Container its own bordered box-component** inside the Node,
sibling to the title and the Content — inset from the Node's outer edge so a
**bezel** separates the two borders (doc01.07.04 R40). It also establishes the
two grab surfaces the later phases depend on: **header + frame = move**,
**container interior = a target the marquee phase can claim**.

Two design decisions are already settled (do not reopen them):
- The header (title + Content band) **auto-sizes**; it is no longer a
  user-draggable band. `contentWidth`/`contentHeight` are **repurposed to size
  the container box's floor** (wired for real in the resize phase; this phase
  only changes the geometry meaning and drawing).
- **Every Node always draws a Content space** (doc01.07.04 R42), including a Node
  with no Content — an empty, addable band.

## Do NOT

- Do NOT touch selection, marquee, panning, or `useGesture`'s box-select — that
  is the `atlas-marquee-select` phase. This phase only restructures node drawing
  and geometry.
- Do NOT wire the frame resize handle's behavior or change how a drag persists
  `contentWidth`/`contentHeight` — that is the `atlas-node-resize` phase. Leave
  the existing content-resize grips in `AtlasNodeContent.tsx` working as they are
  for leaves; you may relocate/rename them but do not change what they persist.
- Do NOT introduce DOM measurement into `projection.ts` — it is deliberately
  measurement-free (see its `sizeOf` comment). The header height stays a
  constant this phase; "auto-size" here means "not user-dragged," a fixed
  sensible height, not runtime measurement.
- Do NOT change `NodeContainer.tsx` in a way that alters Canvas or Dataflow
  rendering. If you add a prop, default it off so those apps are unaffected.
- Do NOT add or rename fields on the atlas schema (`packages/core/src/atlas/types.ts`).
  Reuse `contentWidth`/`contentHeight`.

## Plan

### 1. Geometry: bezel-inset container box in `projection.ts`

Introduce a `CONTAINER_BEZEL` constant (e.g. 8px) — the gap between the Node's
outer edge and the container box's edge.

- `childAreaOrigin(node)` currently returns `{ x: CONTAINER_PADDING, y: containerHeaderHeight(node) }`.
  Children now sit inside the bezel-inset container box, which begins below the
  header. Make the origin `{ x: CONTAINER_PADDING + CONTAINER_BEZEL, y: headerHeight + CONTAINER_BEZEL }`
  (choose exact composition so children render inside the visible container box).
- `containerHeaderHeight(node)` no longer reads `node.contentHeight` — the header
  is a fixed constant now (title row + the always-present Content band). Return a
  fixed `CONTAINER_HEADER`. `contentHeight` no longer means "header band height."
- `childArea(rn)` must return the inset container-box rect (node rect minus the
  header on top, minus the bezel on every side the box is inset from).
- `shrinkWrapSize(node, maxX, maxY)`: keep computing the child-extent size, but
  account for the bezel inset on both axes so the container box wraps its
  children with the bezel visible. Height is `headerHeight + bezel + maxY + bezel`
  (or equivalent); width is `max(leafWidth(node), maxX + 2*(padding+bezel))`.
  Keep this single-sourced with `sizeOf` and `growAncestors` (they call
  `shrinkWrapSize`) — the resize phase will add the stored-floor `max`, so leave
  a clear seam but do not add the floor here.

### 2. Draw the container box in `NodeContainer.tsx` (opt-in)

The `data-soft-container` div is the raw child-area frame today. Atlas needs it
drawn as an **inset, bordered box** below the header, not a full-inset backdrop.

- Add an optional prop to `NodeContainer` that supplies the container box's inset
  rect (top = header, sides/bottom = bezel), or an optional
  `containerInset?: () => { top: number; left: number; right: number; bottom: number }`.
  When absent (Canvas, Dataflow), render exactly as today.
- When present (Atlas), render the soft-container box at that inset with its
  border + tint, so the bezel shows between the Node's outer edge and the box.
- Keep the container box marked so a later phase can hit-test it as "container
  interior" (e.g. keep `data-soft-container="true"`; the marquee phase will key
  off it). Do not add pointer handlers here.

### 3. Node composition in `AtlasNodeContent.tsx`

A Node draws, top to bottom: **title row (+ mode switcher)**, **Content band
(always present)**, and — for a container — the space the container box occupies
(reserved by the geometry above; the box itself is drawn by `NodeContainer`).

- The Content band must render even when the Node has no Content: an empty,
  bordered band with an affordance to add Content (R42). Wire "add Content" to
  the existing edit path (`onEnterEdit`) — entering edit on an empty Node lets
  the user type text, which already commits via `buildContentEditPatch`. A
  visible "Add content" affordance in the empty band that calls `onEnterEdit` is
  sufficient; do not build a separate content-creation flow.
- For a container, the Content band is compact (header region) and does not bleed
  into the container box below. For a leaf, the band fills the box as today.
- Keep the mode switcher (R10) and the read/edit views intact.

### 4. Keep `AtlasCanvas.tsx` wiring coherent

- Pass whatever new prop `NodeContainer` needs (the container inset) from the
  render node in `AtlasNodeLayer`.
- The live-override math in `layoutDeltas` (`shiftSubtree`, `growAncestors`) and
  `childAreaOrigin` usage in `endDrag` must stay consistent with the new origin —
  a dropped child's persisted relative position must still round-trip. Verify the
  drag/drop still lands children in the container box, not behind the header.

## Files to Modify

- `packages/client/src/apps/atlas/projection.ts` — `CONTAINER_BEZEL`,
  `childAreaOrigin`, `containerHeaderHeight`, `childArea`, `shrinkWrapSize`.
- `packages/cactus/src/NodeContainer.tsx` — optional inset container-box drawing,
  off by default for Canvas/Dataflow.
- `packages/client/src/apps/atlas/AtlasNodeContent.tsx` — always-present Content
  band with add-content affordance; container vs leaf composition.
- `packages/client/src/apps/atlas/AtlasCanvas.tsx` — pass the inset prop; keep
  drop-position round-trip correct.
- `packages/client/src/apps/atlas/__tests__/` — update/extend geometry tests for
  the new origin and shrink-wrap (find existing projection tests).

## Verification

```bash
just typecheck-client 2>/dev/null || pnpm -C packages/client exec tsgo --noEmit -p tsconfig.json
pnpm -C packages/client exec vitest run src/apps/atlas
pnpm -C packages/cactus exec vitest run
```

## Out of Scope

- Marquee/box selection, middle-drag pan, restricting the move to header/frame
  (`atlas-marquee-select`).
- Frame resize behavior and the `max(childrenExtent, storedFloor)` size floor
  (`atlas-node-resize`).
- Runtime measurement of the header height (kept a constant here).

## Notes

- The bezel is a shared-engine visual concern but must be neutral for Canvas and
  Dataflow — verify both still render (a quick `just dev` smoke or their vitest
  suites).
- Watch the drop round-trip: `endDrag` in `AtlasCanvas.tsx` computes a child's
  persisted `x/y` via `childAreaOrigin`; the new origin must match or dropped
  children will jump on reload.

## Surface after this phase

- `projection.ts` exports `CONTAINER_BEZEL` (new constant) and keeps exporting
  `childAreaOrigin`, `childArea`, `containerHeaderHeight`, `shrinkWrapSize`,
  `projectAtlasNodes`, `AtlasRenderNode` with the same signatures. `childAreaOrigin`
  now includes the bezel; `containerHeaderHeight` is a fixed constant and no
  longer reads `contentHeight`.
- The container's child area is drawn as an **inset, bordered box** (the
  container box), separated from the Node's outer edge by a bezel. The box
  element keeps `data-soft-container="true"` for later hit-testing.
- Every Atlas Node renders a Content band, including empty Nodes, with an
  affordance that calls `onEnterEdit` to add Content.
- `contentWidth`/`contentHeight` are reserved as the container-box floor's
  storage but are NOT yet wired to the frame resize — a container's size is still
  pure shrink-wrap over children this phase. The resize phase adds
  `size = max(childrenExtent, storedFloor)`; `shrinkWrapSize` is the single seam
  it will change.
- Leaf nodes are unchanged in size behavior (`contentWidth`/`contentHeight` =
  whole box). The existing content-resize grips in `AtlasNodeContent.tsx` still
  function for leaves.
- `NodeContainer` has a new optional inset prop, off by default; Canvas and
  Dataflow rendering are unchanged.
- No atlas schema fields were added or renamed.
