# Dataflow Designer: mutation path — write-through, menus, drag, selection ops

## Motivation

The Dataflow Designer renders passively; doc01.05.04 R6–R15 and R17 make it an
editor. The server already has the whole-document write endpoint
(`POST /api/document/write`) and core has the operations (`addBox`, `setBox`,
`connect`, `disconnect`, `removeBox({cascade})`, `applyDataflowBatch`); this
phase adds the client write path and wires the canvas input-command bindings:
context menus on Box/Flow/background, Box drag, the Delete key, and
multi-selection operations. Decision already made: compose existing core
operations (compose-first) — no new core operations, no MCP changes.

## Do NOT

- Do NOT add new operations to `packages/core` — compose `applyDataflowBatch`
  / existing operations in the client. (Exception: none. If a mutation seems
  impossible to compose, build it from `setBox` over the raw doc shape in the
  client, still not in core.)
- Do NOT persist Box positions. Drag is ephemeral: overrides live in component
  state and the next document change or layout run wins.
- Do NOT touch `packages/mcp` or the luminous-pipeline skill — the document
  schema is unchanged (no new fields).
- Do NOT modify `packages/cactus` — phase 1 (`cactus-edge-interactivity`)
  provides everything needed; consume its Surface.
- Do NOT implement Box content editing (R16) — that is phase 3.
- Do NOT reload the document on the WebSocket echo of our own write (see the
  echo-suppression plan below).

## Plan

### 1. `writeDocument` in `packages/client/src/sources/documentOps.ts`

```ts
export function writeDocument(path: string, content: unknown): Promise<DocumentOpResult> {
  return postJson('/api/document/write', { path, content } as never);
}
```

Note the endpoint takes `content` as a JSON *object* (the server stringifies:
`store.ts` `writeRawDocument`); `postJson`'s body type needs widening from
`Record<string, string>` to accept it. Export from `sources/index.ts`.

### 2. Dispatch + own-echo suppression in `DataflowApp.tsx`

Add to `DataflowApp`:

- `let ownWritesInFlight = 0` (plain variable, not a signal).
- `async function dispatchDoc(next: DataflowDocument)`: set `doc` to `next`
  immediately (optimistic), increment `ownWritesInFlight`, `writeDocument
  (sourceId(), next)`. On failure: decrement, toast the error, and reload via
  `loadDoc(sourceId())` to resync.
- In the `watchDocuments` callback (currently `if (path === sourceId())
  loadDoc(path)`): when `path === sourceId()` and `ownWritesInFlight > 0`,
  decrement and skip the reload — that notification is the echo of our own
  write. Otherwise reload as today (remote edits still flow in).
- Pass a mutation callback to `DataflowCanvas`:
  `onDocChange={(next) => void dispatchDoc(next)}`.

### 3. Canvas wiring in `DataflowCanvas.tsx`

Accept `onDocChange?: (next: DataflowDocument) => void`. All bindings below
compute a new document via core operations and call it. Helper in the file:
`apply(result: DataflowResult)` — if `ok`, `onDocChange(result.doc)`;
otherwise ignore (operations can't fail from these gestures except by bug).

**Unique ids/names**: helper `uniqueId(base: string, taken: Set<string>)`
appending `-2`, `-3`, … Used by Add Box (`new-box`), Duplicate
(`<id>-copy`).

**Box context menu** (`nodeContextMenu` prop on `Canvas`): build a
`MenuSchema` for the right-clicked Box. If the Box is part of the current
multi-selection (`canvasRef.getSelectedIds()` contains it and the selection
has >1 member), items apply to every selected Box:

- `Duplicate` — for each target Box: `addBox` a copy (new unique id, same
  name/description/contract/group). No flows copied.
- `Duplicate with Flows` — same, then for each flow touching an original,
  `connect` the copy correspondingly (flows between two duplicated boxes
  connect the two copies; flows to non-duplicated boxes connect copy→original
  endpoint).
- `Add to Group ▸` — submenu: one item per existing group name (sorted,
  from the set of `box.group` values), plus `New Group…`. Choosing a group
  maps `setBox(id, { group })` over the targets (batch). `New Group…` opens a
  name-prompt dialog (see step 5), then applies the same.
- `Remove from Group` — only when at least one target has a group; clears
  `group` via `setBox`.
- divider, `Delete` (`tone: 'danger'`) — `removeBox(id, { cascade: true })`
  over the targets.

Menu action ids encode the operation and targets in `Action.payload`; the
`onAction` prop on `Canvas` dispatches them.

**Flow context menu** (`edgeContextMenu`): the edge id from projection is the
flow's identity (check `toEdgeDeclarations` for its id format — reuse its
parse). One item, `Insert Box`: batch of `disconnect(from, to)`, `addBox`
(new unique id, name `New Box`), `connect(from, newId)`, `connect(newId, to)`
via `applyDataflowBatch` if action types cover it, else sequential operation
composition in the client.

**Background context menu** (`backgroundContextMenu`): one item, `Add Box` —
`addBox` with a fresh unique id and name `New Box` (R17). Content editing
arrives in phase 3.

**Group rename (R12)**: in `toClusterDeclarations` (`projection.ts`) accept an
optional `onRenameGroup?: (oldName: string, newName: string) => void` — or
simpler, wire `onLabelEdit` on each `ClusterDeclaration` in `DataflowCanvas`
where the doc is at hand: map over `doc.boxes`, `setBox(id, { group: newName })`
for every member of the old group. Renaming to an existing group name merges
the groups (acceptable; document it in a test).

**Drag (R6)**: follow `PgCanvasView.tsx:307-340` — a
`nodeOverrides: Map<string, {x, y}>` signal; `useNodeDrag` from cactus with
callbacks writing to it; `NodeContainer.onPointerDown` calls the drag handler
and the selection handler (`useCanvasContext().onNodePointerDown`) — check how
PgCanvasView sequences drag-vs-select on pointerdown and mirror it. Because
`useCanvasContext` only works under the `Canvas` provider, extract the node
rendering into a small child component (as PgCanvasView does). Positions
memo: layout position unless an override exists. Clear all overrides when
`props.doc` changes (the next layout run wins).

**Delete key (R10 via Selection binding)**: window `keydown` listener in
`DataflowCanvas` (added `onMount`, removed `onCleanup`): on `Delete` or
`Backspace`, if the target is not an input/textarea/contenteditable (copy the
guard from `useHotkeys.ts:10-13`), `removeBox(id, { cascade: true })` for every
id in `canvasRef.getSelectedIds()`.

### 4. Marquee select enablement

`Canvas` needs `boxSelect.getNodeRects` for Shift+drag marquee (R13):
pass `boxSelect={{ getNodeRects: () => ... }}` built from the current
positions/sizes memos (id, x, y, width, height).

### 5. Name-prompt dialog

Small `NamePromptDialog.tsx` in `apps/dataflow/` (title, single text input,
Ok/Cancel — same modal styling as `RenameDialog.tsx`, which stays untouched).
Used by `New Group…`.

### 6. Tests

- `packages/client/src/apps/dataflow/__tests__/`: unit tests for the pure
  helpers — duplicate-with-flows flow rewiring, insert-onto-flow batch,
  group rename mapping (including the merge-on-collision case), uniqueId.
  Follow the existing test style in that directory.
- e2e (`packages/client/e2e/dataflow.spec.ts`): extend — right-click a box
  asserts the menu appears with `Duplicate`; background right-click asserts
  `Add Box`. Keep e2e additions minimal; deeper coverage lands with phase 3.

## Files to Modify

- `packages/client/src/sources/documentOps.ts` — `writeDocument`
- `packages/client/src/sources/index.ts` — export
- `packages/client/src/apps/dataflow/DataflowApp.tsx` — dispatch, echo
  suppression, `onDocChange` prop
- `packages/client/src/apps/dataflow/DataflowCanvas.tsx` — menus, drag,
  Delete key, marquee, cluster `onLabelEdit`
- `packages/client/src/apps/dataflow/projection.ts` — only if the edge-id
  format needs an exported parser; otherwise untouched
- `packages/client/src/apps/dataflow/NamePromptDialog.tsx` — new
- `packages/client/src/apps/dataflow/__tests__/mutations.test.ts` — new
- `packages/client/e2e/dataflow.spec.ts` — menu assertions

## Verification

```bash
just typecheck-client
just test-client
just build
just test-e2e
just lint
```

## Out of Scope

- Box content editing / edit mode (R16) — phase 3.
- Markdown rendering in boxes — phase 3.
- CodeMirror dependency removal — phase 3.
- Cluster label drag (set-drag).
- Undo/redo.
- Persisting positions.

## Notes

- The server broadcasts on write (`index.ts:204`), so echo suppression is not
  optional — without it every edit triggers a reload that would fight the
  optimistic update.
- `removeBox` already cascades flows with `{ cascade: true }` — R10's "deleting
  a Box also deletes its connected Flows" is core behavior, don't reimplement.
- Duplicate-name collision on file level is handled (DataflowApp
  `handleDuplicate`); box-level id collisions are the client's to avoid via
  `uniqueId`.

## Surface after this phase

- `writeDocument(path, content)` exported from `packages/client/src/sources`.
- `DataflowApp` owns `dispatchDoc` (optimistic set + write + echo suppression
  via an in-flight counter); remote edits still reload; failed writes resync.
- `DataflowCanvas` accepts `onDocChange` and provides: Box context menu
  (Duplicate / Duplicate with Flows / Add to Group ▸ incl. New Group… /
  Remove from Group / Delete), Flow context menu (Insert Box), background
  context menu (Add Box), Box drag with ephemeral overrides cleared on doc
  change, Shift+drag marquee, Delete-key deletion of the selection, and
  Group rename via the cluster label (double-click, from phase 1's
  `onLabelEdit`).
- `NamePromptDialog` exists in `apps/dataflow/` (title + text input + Ok/Cancel).
- Negative space: `packages/core` and `packages/mcp` are unchanged; the
  document schema is unchanged; `RenameDialog` is unchanged; boxes still
  render read-only interiors (no edit mode until phase 3); positions are
  never written to the document.
