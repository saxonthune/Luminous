# Unify the three live gesture overrides into one layout-delta layer

## Motivation

The Atlas render row applies three separate, ad-hoc live-override mechanisms —
one per gesture, none shared:

- **Move** → `dx()/dy()` (`AtlasCanvas.tsx:152-153`), the dragged Node + descendants
  via the `selfAndAncestors` test.
- **Ctrl-expand** → `liveSizes().get(id)` (`:167,174`), a memo over the ancestor path.
- **Content-resize** → `resizePreview()` (`:170-172`), the resizing Node only.

Because content-resize is self-only, growing a Node's header band does **not**
shift its children down or grow its ancestors until release — the live preview
disagrees with the committed result (commit does both, via `childAreaOrigin` +
shrink-wrap in `projection.ts`).

All three are the same shape: a gesture produces a live geometric change that a
set of related Nodes must reflect before commit. This task unifies them into one
`Map<nodeId, LayoutDelta>` the row reads uniformly, with two reusable primitives —
`shiftSubtree` (descendants move) and `growAncestors` (ancestor path resizes) —
that we have already derived twice. Content-resize then **composes** them and gains
live child-shift + ancestor-grow for free.

## Do NOT

- **Do NOT** change any gesture's *behavior* — this is a structure-preserving
  refactor. Move, Ctrl-expand, and content-resize must look identical to the user
  afterward, except that content-resize now moves children and grows ancestors
  live (the intended fix).
- **Do NOT** re-run `projectAtlasNodes` per frame. Build the delta map from the
  active gesture over the affected sets only (subtree / ancestor path), O(affected).
- **Do NOT** move the primitives or the memo into cactus — the affected sets come
  from the Atlas tree (`parentOf`/`childrenOf`), domain knowledge. cactus stays
  domain-agnostic; the memo lives in `AtlasNodeLayer`.
- **Do NOT** break simultaneity: a Ctrl-drag both moves the subtree and grows
  ancestors at once — the map must compose contributions additively.
- **Do NOT** change the committed geometry (`projection.ts` sizing/fold) — only the
  *live* override consolidates. Commit stays the source of truth the preview matches.

## Plan

### 1. The delta type and primitives (`packages/client/src/apps/atlas/layoutOverride.ts` — new)

```ts
export interface LayoutDelta { dx: number; dy: number; dw: number; dh: number }
// Mutably accumulate into a map (additive), so gestures compose.
export function addDelta(map: Map<string, LayoutDelta>, id: string, d: Partial<LayoutDelta>): void;
export function shiftSubtree(map, rootId, childrenOf, dx, dy, opts?: { includeRoot?: boolean }): void;
export function growAncestors(map, nodeId, parentOf, /* live extent inputs */ ...): void;
```

- `shiftSubtree` walks `childrenOf` from `rootId`, adding `(dx,dy)` to each node
  (self included when `includeRoot`). Move uses `includeRoot: true`; content-resize
  uses `includeRoot: false` (only the children shift; the Node itself grows, not moves).
- `growAncestors` mirrors the current `liveSizes` walk: bottom-up along
  `selfAndAncestors`, each ancestor's `dw/dh` computed to contain the live extent of
  the child below, reusing `sizeOf`'s `max` + header math (`projection.ts:149`). Keep
  that formula in one place — export a helper from `projection.ts` if needed.

Unit-test each primitive as a pure function.

### 2. One memo composing the active gesture (`AtlasCanvas.tsx` / `AtlasNodeLayer`)

Replace `liveSizes`, the per-row `movedByDrag/dx/dy`, and `resizePreview`'s geometry
with a single `layoutDeltas = createMemo(() => Map<string, LayoutDelta>)` built from:

- **Drag** (`gesture.isDraggingNode` + `gesture.dragDelta()`): `shiftSubtree(dragged,
  dx, dy, { includeRoot: true })`.
- **Ctrl-expand** (`props.ctrlHeld()` + dragged id): `growAncestors(dragged, …)`.
- **Content-resize** (`props.previewContentHeight()`): `addDelta(node, { dh: Δh })`
  (Δh = preview − committed header, container: header grows; leaf: whole box) +
  `shiftSubtree(node's children, 0, Δh, { includeRoot: false })` +
  `growAncestors(node, …)`.

Build `childrenOf` alongside the existing `parentOf` memo.

### 3. The row reads the map uniformly (`AtlasCanvas.tsx:161-181`)

```ts
const d = () => layoutDeltas().get(rn.node.id) ?? ZERO;
x={() => rn.x + d().dx}
y={() => rn.y + d().dy}
w={() => rn.w + d().dw}
h={() => editing() ? EDIT_HEIGHT : rn.h + d().dh}
```

Delete the now-dead `movedByDrag`, `dx`, `dy`, `resizePreview` geometry, and
`liveSizes`. Keep `previewContentHeight` flowing into the memo (step 2).

### 4. Tests

- `layoutOverride.test.ts` — `shiftSubtree` (with/without root), `growAncestors`,
  composition (drag + expand additive).
- `AtlasCanvas` / projection test — resizing a container's header live shifts its
  children down by the same delta and grows the container **and** its ancestor,
  matching the committed re-projection of the same `contentHeight`.

## Files to Modify

- `packages/client/src/apps/atlas/layoutOverride.ts` — new: `LayoutDelta`, `addDelta`, `shiftSubtree`, `growAncestors`.
- `packages/client/src/apps/atlas/AtlasCanvas.tsx` — `childrenOf` memo; one `layoutDeltas` memo; uniform row application; delete the three ad-hoc paths.
- `packages/client/src/apps/atlas/projection.ts` — export the shrink-wrap size helper if `growAncestors` reuses it (keep the formula single-sourced).
- `packages/client/src/apps/atlas/layoutOverride.test.ts` — new.
- `packages/client/src/apps/atlas/AtlasCanvas.test.tsx` — live resize moves children/grows ancestors.

## Verification

```bash
pnpm -C packages/client exec tsgo --noEmit
pnpm -C packages/client exec vitest run
```

## Out of Scope

- Horizontal/diagonal resize and `contentWidth` — next phase (`atlas-2d-content-resize`).
- Conditional content scroll — later phase.
- Negative-direction (origin-shifting) expansion — still deferred (Ctrl-expand's follow-up).

## Notes

- This is the third occurrence of the live-override pattern; unifying now is the
  rule-of-three payoff. The primitives are the vocabulary future gestures reuse.
- Simultaneous Ctrl-drag exercises composition (subtree `dx/dy` + ancestor `dw/dh`
  on disjoint-but-adjacent sets); keep it in the tests.

## Surface after this phase

- `layoutOverride.ts` exports `LayoutDelta`, `addDelta`, `shiftSubtree(map, root,
  childrenOf, dx, dy, {includeRoot})`, `growAncestors(map, node, parentOf, …)`.
- `AtlasNodeLayer` builds one `layoutDeltas: Map<nodeId, LayoutDelta>` memo from the
  active gesture; the row applies `dx/dy/dw/dh` uniformly. The old `movedByDrag`,
  `liveSizes`, and self-only `resizePreview` geometry are gone.
- Content-resize live-shifts children and grows ancestors, matching commit.
- Move and Ctrl-expand behavior is unchanged. Committed geometry unchanged.
- The resize builder (`addDelta` + `shiftSubtree` + `growAncestors` for a Node's own
  size change) is the seam the 2D-resize phase extends with a width delta.
