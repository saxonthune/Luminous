# Atlas drag and Container membership (R1–R4, R6)

## Motivation

Implements doc01.07.04 R1–R4 and R6:

- **R1.** The system shall allow the user to drag Nodes.
- **R2.** The system shall allow the user to duplicate Nodes.
- **R3.** The system shall allow the user to add new Nodes.
- **R4.** The system shall allow the user to add a Node to a Container and to
  remove a Node from a Container.
- **R6.** While a drag will add a Node to or remove a Node from a Container, the
  system shall display a toast notification at the bottom of the screen saying so.

Approved bindings (doc01.07.04, Atlas view):

| Target | Interaction | Action | Req |
|---|---|---|---|
| Node | left click + drag | Move the Node | R1 |
| Node | drag into a Container | Add the Node to the Container | R4 |
| Node | drag out of a Container | Remove the Node from the Container | R4 |

This is the phase where a drag stops being decoration and becomes an edit: dropping
a Node inside a Container reparents it. Membership is document state; the position
is not.

## Do NOT

- **Do NOT implement R5** (Ctrl + drag out expands the Container's boundary). It is
  deferred deliberately. R5 needs a Container boundary the user authors and the
  layout honors — the first authored geometry in any Luminous format — and that is
  the job of the relation-based layout language, not a persisted size bolted on
  here. Leave the R5 row in the bindings table unimplemented. **Ctrl + drag must
  behave exactly as a plain drag for now.** Do not invent a partial R5.
- **Do NOT persist x, y, w, or h.** Positions stay ephemeral: computed by
  `layoutAtlas`, overridden for the duration of a drag, discarded on document
  change. `DataflowCanvas.tsx:135,138-144,147` is the pattern — `nodeOverrides`
  merged over base positions and cleared by a `createEffect(on(() => props.doc, …))`.
  A drag writes **only** a reparent, never a coordinate.
- **Do NOT touch `packages/client/src/apps/atlas/layout.ts`.** Reading positions
  from `layoutAtlas` is fine; changing it is not.
- **Do NOT add an inspector, a properties panel, or a sidebar.**
- **Do NOT invent bindings for R2 and R3.** The approved table has no rows for
  duplicate or add-Node. See Considerations in Notes — the spec's assumption is a
  context menu mirroring Dataflow's, and that assumption is the thing to check
  first if this task feels wrong.
- **Do NOT reuse Dataflow's `clusterId`.** Atlas nesting is real containment via
  `TidyNode.parentId`. Dataflow's flat grouping is a different mechanism.

## Plan

### 1. Drag with containment hit-testing — `packages/client/src/apps/atlas/AtlasCanvas.tsx`

- Wire `useNodeDrag({ zoomScale: () => ctx.transform().k })` as
  `DataflowCanvas.tsx:62-119` does inside the node-layer component.
- Maintain a `nodeOverrides` signal for the live drag, merged over `layoutAtlas`'s
  positions, cleared on document change.
- **On drop**, hit-test the pointer against rendered Containers to find the deepest
  Container under it. cactus hit-tests on the rendered projection via
  `data-container-id` — search `packages/cactus/src/` for the existing helper before
  writing one; `interactions/` is the likely home. Do not re-derive geometry from
  the document.
- Compute the target parent: the deepest Container under the pointer, or `undefined`
  if the pointer is over the background. Skip the write when the target equals the
  Node's current parent — a plain move is not an edit.
- Otherwise `dispatchDoc` a `reparent`. Dropping a Node onto itself or a descendant
  must be refused; `reparent` already rejects cycles, so surface the error rather
  than crashing.

### 2. Pending-membership toast (R6)

R6 is about what a drag **will** do — it fires during the drag, not after the drop.

- While dragging, resolve the prospective target parent on each move and show a
  toast at the bottom of the screen naming the pending change (adding to a
  Container, or removing from one). Show nothing while the prospective target equals
  the current parent.
- Use the client's existing toast mechanism — `DataflowApp.tsx` already toasts on
  write failures. Find it and reuse it; do not add a second notification system. If
  it cannot express a persistent message that lives for the duration of a drag,
  prefer extending it over building a parallel one.
- Dismiss the toast when the drag ends, whatever the outcome.

### 3. Duplicate a Node (R2)

- Add to `packages/client/src/apps/atlas/mutations.ts`, following
  `apps/dataflow/mutations.ts`'s `duplicateBoxes` and `uniqueId`.
- Duplication copies the Node's name and Content, and keeps the same parent.
- The new Node needs a fresh id derived from the original's, and it must not
  collide. Reuse the `uniqueId` approach.
- **Descendants are not copied** and Edges are not copied. Dataflow asks about
  copying flows (its R8); Atlas has no such requirement, so do the simple thing.

### 4. Add a new Node (R3)

- A new Node with a placeholder name, no Content, and a parent determined by where
  it is added: inside a Container if invoked there, otherwise a root Node.
- `addNode` from `@luminous/core/atlas` does the work; this is wiring.

### 5. Context menus

Mirror `DataflowCanvas.tsx:233,263,270,277`: a `nodeContextMenu` offering Duplicate
and a `backgroundContextMenu` offering Add Node, dispatched through a single
`onAction` switch.

### 6. Tests

- `packages/client/src/apps/atlas/__tests__/mutations.test.ts` — duplicate produces a
  fresh non-colliding id, copies name and Content, keeps the parent, and copies
  neither descendants nor Edges.
- `packages/client/src/apps/atlas/__tests__/` — the pure drop-target decision:
  given a current parent and a prospective target, does this produce a reparent, and
  which one? Extract that decision into a pure function and test it directly rather
  than through the component. Cover: same target as current parent produces no
  write; background produces a root; self and descendant are refused.
- **Do not add an e2e test** — boot smokes plus pins earned by incident only.

## Files to Modify

- `packages/client/src/apps/atlas/AtlasCanvas.tsx` — drag, drop hit-test, toast, context menus
- `packages/client/src/apps/atlas/mutations.ts` — duplicate, add-Node, drop-target decision
- `packages/client/src/apps/atlas/__tests__/mutations.test.ts` — the above

## Verification

```bash
just typecheck
pnpm -C packages/client exec vitest run src/apps/atlas
pnpm -C packages/core exec vitest run tests/atlas
just lint
just build
```

## Out of Scope

- R5 — Ctrl + drag out expanding a Container's boundary
- Multi-select and bulk operations — no requirement asks yet
- Deleting a Node — no requirement asks yet
- Editing or drawing Edges
- Layout, relations, MCP tools

## Notes

- **The bindings for R2 and R3 are an assumption, not an approval.** The requirements
  say the user can duplicate a Node and add a new one; the approved bindings table
  says nothing about how. This spec assumes a context menu mirroring Dataflow's
  because that is the sibling app's answer and the least surprising. If a reviewer
  disagrees, this is the decision to revisit — the capability is settled, the gesture
  is not.
- **The drag/reparent split is the thing to get right.** A drag produces two
  independent outcomes: a position, which is ephemeral and discarded, and possibly a
  parent change, which is document state and written. Conflating them — persisting a
  position, or reparenting on every move rather than on drop — is the failure mode.
- R6 fires on the prospective change during a drag, not on the committed change after
  it. Read it as a preview.
- `reparent`'s cycle rejection already covers dropping a Node into its own descendant.
  Let it refuse and report; do not pre-filter in the UI and silently do nothing.

## Surface after this phase

- Dragging a Node moves it; the position is ephemeral and is discarded on the next
  document change. Dropping a Node inside a Container reparents it into that
  Container; dropping it on the background makes it a root Node. A drop whose target
  equals the current parent writes nothing.
- While a drag would change a Node's Container membership, a toast at the bottom of
  the screen says so; it clears when the drag ends.
- A Node can be duplicated — copying name, Content, and parent, with a fresh id, and
  copying neither descendants nor Edges — and a new Node can be added, both from
  context menus.
- `packages/client/src/apps/atlas/mutations.ts` additionally exports the duplicate
  and add-Node builders and the pure drop-target decision.
- The document format, `@luminous/core/atlas`'s exports, and `layout.ts` are all
  unchanged. No coordinates are persisted anywhere.
- Negative space: R5 is unimplemented and Ctrl+drag behaves as a plain drag. No
  multi-select, no bulk operations, no Node deletion from the UI, no Edge editing,
  no MCP tools. Dataflow and Canvas unchanged.
