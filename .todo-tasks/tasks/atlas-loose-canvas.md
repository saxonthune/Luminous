# Loose canvas: read and persist Node positions (Phase A of the layout partition)

## Motivation

Atlas nodes cannot move freely — a Node's position is a pure function of its place
in the parent/child tree, because `layoutAtlas` (`layout.ts`) feeds every node into
`tidyLayout`, whose only inputs are `id`/`w`/`h`/`parentId`. The Document already
carries `node.x`/`node.y` (parsed, serialized, and patchable — see
`packages/core/src/atlas/{document.ts,operations.ts}`), but `projectAtlasNodes`
**never reads them** (this is bug 3 of `atlas-interaction-bugs`). So a moved Node
snaps back to its computed slot on drop, and the only way to reposition a Node is
to change its Container.

This is Phase A of the layout design (see doc01.07.04 R24–R26): establish the
**position-intent seam** so a Node can hold a custom position that overrides the
computed layout, and persist it on drop. This sets the partition that Phase B
(arrange commands) and the future relation-based resolver build on.

## Do NOT

- **Do NOT** change the serialized Document shape. `node.x`/`node.y` stay optional
  numbers in JSON (present = manual, absent = auto). The `NodePosition` tagged
  union is a **domain/runtime** type derived at read time — it does NOT get
  serialized as `{ mode: ... }`. Keep the JSON compact and backward-compatible.
- **Do NOT** build a constraint solver, collision avoidance, or "find space" logic
  here — a manual Node may overlap an auto Node; that is acceptable for the loose
  canvas. Space-finding is Phase B (arrange) / a later task.
- **Do NOT** add arrange commands, context-menu items, or multi-select behavior —
  that is Phase B (`atlas-arrange-as-column`).
- **Do NOT** touch cactus, the Gesture machine, or the pan filter. This is an
  Atlas-domain + core change. The drag path (`useGesture` → `onDragEnd(nodeId, dx,
  dy)`) already merged; consume it, don't modify it.
- **Do NOT** move the camera on a position change (R23).

## Plan

### 1. The `NodePosition` domain union (`packages/client/src/apps/atlas/projection.ts` or a small `layout` sibling)

Introduce the tagged union and a deriver from the stored fields:

```ts
export type NodePosition =
  | { mode: 'auto' }
  | { mode: 'manual'; x: number; y: number };   // parent-relative for a Child

export function nodePositionOf(node: AtlasNode): NodePosition {
  return node.x !== undefined && node.y !== undefined
    ? { mode: 'manual', x: node.x, y: node.y }
    : { mode: 'auto' };
}
```

The union is the seam future modes extend (`relative`, `pinned`, …); the resolver
`switch`es on it exhaustively.

### 2. Resolver precedence in `projectAtlasNodes` (`projection.ts:39`)

Keep computing `layoutAtlas(doc)` (tidy) for the auto fallback. For each node,
choose its **parent-relative** position by intent:

- `manual` → use `{ x, y }` from the union.
- `auto` → use the tidy position from `layoutAtlas`.

Then resolve to absolute exactly as today (`resolveAbsolutePositionByParentOf` over
the parent-relative map). Container sizes still shrink-wrap children (`sizeOf`);
a manual child's relative position feeds the same size math. Net effect: manual
nodes sit where stored (relative to their parent), auto nodes keep tidy positions.

### 3. Persist on drop (`packages/client/src/apps/atlas/AtlasCanvas.tsx`, `endDrag`)

`endDrag(nodeId, dx, dy)` currently resolves reparenting via `resolveDrop` and
otherwise discards the move (snap-back). Change it so a move writes the Node's new
**parent-relative** position:

- Compute the dropped parent-relative position = the node's pre-drag relative
  position + `(dx, dy)` (canvas-space delta from the gesture). If `resolveDrop`
  reparents, compute the position relative to the **new** parent.
- Persist via the existing patch: `setNode(doc, nodeId, { x, y })` (see
  `operations.ts:23`), then `dispatchDoc`.
- A drop that neither reparents nor moves past a small epsilon may still write the
  position (idempotent) — the point is the Node no longer snaps back.

Reconcile with `resolveDrop`: reparent and position-write compose into one patch/
dispatch (reparent sets `parent`, position sets `x`/`y`). Confirm `mutations.ts`'s
`resolveDrop` result can carry the position, or apply position as a second
`setNode` on the reparented doc.

### 4. Tests

- `projection.test.ts` (new or extend): a node with `x`/`y` set resolves to that
  parent-relative position (overriding tidy); a node without falls back to the tidy
  position; a manual **child** resolves relative to its parent's absolute position.
- `mutations`/`AtlasCanvas` drop test: a move dispatches a `setNode` carrying the
  new `x`/`y`; a reparenting drop carries both `parent` and the reparented-relative
  `x`/`y`.

## Files to Modify

- `packages/client/src/apps/atlas/projection.ts` — `NodePosition` union, `nodePositionOf`, resolver precedence.
- `packages/client/src/apps/atlas/AtlasCanvas.tsx` — `endDrag` persists parent-relative `x`/`y`.
- `packages/client/src/apps/atlas/mutations.ts` — if `resolveDrop` must carry the position alongside reparenting.
- `packages/client/src/apps/atlas/*.test.ts(x)` — reader + drop-persist coverage.

## Verification

```bash
pnpm -C packages/core exec tsgo --noEmit
pnpm -C packages/client exec tsgo --noEmit
pnpm -C packages/client exec vitest run
pnpm -C packages/core exec vitest run
```

## Out of Scope

- Arrange commands / "Arrange as" menu / multi-select (Phase B, `atlas-arrange-as-column`).
- Collision avoidance / space-finding / constraint solving.
- Relation-based layout (doc01.07 direction).
- Changing the serialized `x`/`y` representation.
- Undo/redo (separate task).

## Notes

- Serialization stays as optional `x`/`y`; the union lives only in the domain layer,
  so old fixtures load unchanged and no schema doc needs a shape change. If an Atlas
  schema reference doc enumerates node fields, no field is added — only a reader.
- Because manual nodes override tidy but tidy still runs for auto siblings, a manual
  node can overlap an auto node. Intended for the loose canvas; Phase B addresses
  overlap for arranged sets.
- Reviewer watch-item: parent-relative vs absolute. Stored `x`/`y` are
  parent-relative so that moving a Container carries its Children; the drop math
  must convert the absolute drop point back to parent-relative before writing.

## Surface after this phase

- `packages/client/src/apps/atlas/projection.ts` exports
  `type NodePosition = { mode: 'auto' } | { mode: 'manual'; x; y }` and
  `nodePositionOf(node): NodePosition`.
- `projectAtlasNodes` resolves position by intent: a Node with stored `x`/`y` sits
  at that parent-relative position (overriding tidy); a Node without falls back to
  `tidyLayout`.
- A drag-drop persists the Node's new parent-relative `x`/`y` to the Document via
  `setNode(doc, id, { x, y })`; Nodes no longer snap back. Reparenting drops write
  both `parent` and the reparented-relative position.
- Serialized shape unchanged: optional `x`/`y` on a node (absent = auto).
- Still relied on: `layoutAtlas`/`tidyLayout` as the auto fallback, `resolveDrop`
  reparenting, R23 camera behavior, the Gesture drag path.
- Not built here: arrange commands, overlap avoidance, undo/redo.
