# A parent drag moves its whole subtree every frame

## Motivation

Dragging a container Node slides only that Node while its children sit frozen
until the pointer is released, when re-projection snaps them under the parent.
A subtree moves rigidly, so every descendant should track the same drag delta
live.

Mechanism (confirmed): in `AtlasNodeLayer` (`AtlasCanvas.tsx:73-119`) each `<For>`
row applies the drag offset only when the row *is* the dragged Node —
`gesture.isDraggingNode(rn.node.id)` gates `dx()/dy()` (`:89-90`). A child is a
separate row with precomputed absolute `rn.x/rn.y` from the committed Document and
never reads the parent's `gesture.dragDelta()`, so it does not move.

Because positions are parent-relative folded to absolute, adding the *same*
`(dx,dy)` to every descendant's absolute position slides the subtree as one unit.

## Do NOT

- **Do NOT** change the Gesture machine or anything in `packages/cactus`. This is
  a domain-layer fix in `AtlasNodeLayer` only — `isDraggingNode` and `dragDelta`
  already expose everything needed.
- **Do NOT** introduce a new signal, a `createSelector` of your own, or a
  `draggingSubtree` set threaded through props. Reuse the existing
  `gesture.isDraggingNode` selector by testing it against a row's ancestor chain.
- **Do NOT** rebuild the `<For>` array or mutate `props.nodes()` during a drag —
  the array must stay reference-stable so rows never dispose/rebuild (the 1b
  invariant). Read the offset per-row from the gesture only.
- **Do NOT** touch `endDrag`'s persist path — only the *dragged* Node's position
  is written on drop; descendants keep their stored parent-relative positions and
  ride along because their parent moved. Live subtree motion is a render-only
  concern.

## Plan

### 1. An ancestor lookup over the render nodes (`AtlasCanvas.tsx`)

Inside `AtlasNodeLayer`, build a `parentOf` map from `props.nodes()` (each
`AtlasRenderNode` carries `node.parent`), memoized so it rebuilds only when the
node set changes:

```ts
const parentOf = createMemo(() => {
  const m = new Map<string, string>();
  for (const rn of props.nodes()) if (rn.node.parent) m.set(rn.node.id, rn.node.parent);
  return m;
});
```

Add a helper that yields a node id and all its ancestors (walk `parentOf` up).

### 2. Apply the delta when the dragged Node is self-or-ancestor

Change the per-row `dx()/dy()` (`AtlasCanvas.tsx:89-90`) so a row takes the drag
delta when the currently-dragged Node is the row itself **or any of its
ancestors**:

```ts
const movedByDrag = () => {
  for (const id of selfAndAncestors(rn.node.id, parentOf())) {
    if (gesture.isDraggingNode(id)) return true;
  }
  return false;
};
const dx = () => (movedByDrag() ? gesture.dragDelta().dx : 0);
const dy = () => (movedByDrag() ? gesture.dragDelta().dy : 0);
```

Calling `isDraggingNode` with each ancestor key subscribes the row to exactly
those keys; when the drag starts/ends on an ancestor, only the affected rows
recompute. A leaf at depth d does d O(1) selector checks — cheap.

## Files to Modify

- `packages/client/src/apps/atlas/AtlasCanvas.tsx` — `parentOf` memo + `selfAndAncestors` helper in `AtlasNodeLayer`; rewrite `dx()/dy()` to test the ancestor chain.
- `packages/client/src/apps/atlas/AtlasCanvas.test.tsx` (or a new focused test) — assert that when a container is the dragged Node, a descendant row's rendered offset equals the drag delta; when an unrelated Node drags, the descendant's offset is zero. If a component test is impractical, extract `selfAndAncestors` as a pure helper and unit-test it.

## Verification

```bash
pnpm -C packages/client exec tsgo --noEmit
pnpm -C packages/client exec vitest run
```

## Out of Scope

- Reserving a header band / separating content from the child area — that is the
  next phase (`atlas-header-body-split`). This task assumes the current geometry.
- Persisting descendant positions on drop (they don't change relative to parent).
- Any cactus/gesture change.

## Notes

- The existing `selfAndDescendantIds` (`mutations.ts:101`) computes the *downward*
  set for drop-exclusion; this task needs the *upward* (ancestor) set instead,
  which is why a small new helper is warranted rather than reusing that one.

## Surface after this phase

- `AtlasNodeLayer` moves a dragged container's entire subtree live: every
  descendant row applies the parent's `gesture.dragDelta()` each frame, via an
  ancestor-chain test over a `parentOf` memo built from `props.nodes()`.
- A pure `selfAndAncestors(id, parentOf)` helper exists in the Atlas app (exported
  if extracted for testing).
- No cactus/gesture change; `endDrag` persist path unchanged; `<For>` array stays
  reference-stable during drags.
- Current single-rect geometry is unchanged — the header band does not yet exist.
