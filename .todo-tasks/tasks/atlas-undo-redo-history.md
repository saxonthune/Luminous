# Undo/redo history for Atlas, action-based with inversion

## Motivation

Every Atlas edit replaces the Document via `dispatchDoc(next)` with no way to
undo. As positioning (`atlas-loose-canvas`) and multi-Node arrange
(`atlas-arrange-as-column`) land, a single gesture can rearrange many Nodes with no
recovery. This task adds **Atlas-only** undo/redo built on the existing typed action
union.

The design (settled): the codebase already has `AtlasAction`
(`AddNodeAction | SetNodeAction | RemoveNodeAction | ReparentAction`, `types.ts`)
and a reducer `applyAtlasBatch(doc, actions)` (`operations.ts:142`). History stores
**command entries** `{ label, do: AtlasAction[], undo: AtlasAction[] }`; undo and
redo are the *same* operation fed a different list — `applyAtlasBatch(doc, entry.undo)`
vs `entry.do`. The inverse is computed at dispatch time from the pre-edit Document.

This runs as chain phase after `atlas-arrange-as-column`; it routes that task's
arrange dispatch and `atlas-loose-canvas`'s position dispatch through the new seam.

## Do NOT

- **Do NOT** build a snapshot/whole-Document-copy history. Use action + inverse.
- **Do NOT** make this a platform/`AppShell` feature. Atlas-only for now.
- **Do NOT** attempt to invert a user-initiated `removeNode`. `AtlasAction` has no
  edge operation and `removeNode` cascades to edges (`operations.ts:101`), so its
  inverse cannot be expressed as actions. There is no delete-Node UI today, so this
  never arises — assert/guard it, and leave a clear TODO for when a delete feature
  needs an `addEdge` action or a snapshot-based inverse.
- **Do NOT** treat an external/remote Document reload (a non-echo `props.doc`
  change) as an undoable edit — it must instead clear history. Preserve the existing
  reload-guard effects in `AtlasCanvas` and distinguish echo from external.
- **Do NOT** move the camera on undo/redo (R23).

## Plan

### 1. Inversion in core (`packages/core/src/atlas/history.ts` — new)

```ts
export function invertAtlasAction(before: AtlasDocument, action: AtlasAction): AtlasAction[];
export function invertAtlasBatch(before: AtlasDocument, actions: AtlasAction[]): AtlasAction[];
```

`invertAtlasBatch` inverts each action against the document state *before that
action* (fold forward to get each intermediate `before`, collect inverses, return
them **in reverse order**). Per-action inverse:

- `addNode { id }` → `[{ type: 'removeNode', id }]`.
- `reparent { id, parent }` → `[{ type: 'reparent', id, parent: <before>.parent }]`
  (the node's parent in `before`, possibly `undefined`).
- `setNode` → `[{ type: 'setNode', id, ...preimage }]` where the inverse patch
  carries the **same keys** the forward action set, each valued from `before`'s node.
  Preserve delete semantics: `setNode` treats a present-but-`undefined` key as
  "delete this field" (`operations.ts:34-61`), so if `before` had no `color`, the
  inverse must include `color: undefined` to restore its absence.
- `removeNode` → throw / return a sentinel and document why (see Do NOT). Not reached
  by current UI.

Export both from the atlas barrel. Unit-test each inverse round-trips:
`applyAtlasBatch(applyAtlasBatch(doc, [a]).doc, invertAtlasBatch(doc, [a]))` equals
`doc` for add, reparent, and each `setNode` field (including field-deletion cases).

### 2. History hook (`packages/client/src/apps/atlas/history.ts` — new)

```ts
interface HistoryEntry { label: string; do: AtlasAction[]; undo: AtlasAction[]; }
function useAtlasHistory(): {
  record: (entry: HistoryEntry) => void;   // push to past, clear future
  undo: () => AtlasAction[] | null;         // pop past→future, return actions to apply
  redo: () => AtlasAction[] | null;         // pop future→past, return actions to apply
  canUndo: () => boolean;                   // signals for reactive button state
  canRedo: () => boolean;
  clear: () => void;                        // on external reload
}
```

`past`/`future` as signals so `canUndo`/`canRedo` drive the toolbar reactively.

### 3. The dispatch seam (`AtlasCanvas.tsx`)

Add `dispatchAction(actions: AtlasAction[], label: string)`:
- `const before = props.doc;`
- `const result = applyAtlasBatch(before, actions);` if `!result.ok` bail (surface via
  `onDropRefused`/toast as appropriate).
- `history.record({ label, do: actions, undo: invertAtlasBatch(before, actions) });`
- mark this dispatch as an **echo** (a flag/ref) so the reload-guard effect does not
  clear history, then `dispatchDoc(result.doc)`.

Route every user-edit site through it, emitting the equivalent `AtlasAction[]`
instead of calling operations then `dispatchDoc`:
- `commitEdit` → `setNode` (name/content). `changeMode` → `setNode` (content).
  `selectColor` → `setNode` (color). Labels: "Edit Node", "Change Mode", "Set Color".
- `endDrag` (from `atlas-loose-canvas`) → `reparent` (if reparented) + `setNode`
  (x/y), as one batch, label "Move Node".
- `node.add` → `addNode`, label "Add Node".
- `node.duplicate` → express as a batch of `addNode` actions (root + descendants,
  parent-before-child, new ids), label "Duplicate". Its inverse is the matching
  `removeNode` batch — valid because these are *added* nodes (undo removes them),
  which never hits the un-invertible removeNode case. **Reviewer watch-item:** if
  `duplicateNode` copies incident edges, those edges cannot be re-added by redo via
  actions — confirm it does not, or exclude edge-copying from history v1.
- Arrange (from `atlas-arrange-as-column`) → the batch of `setNode` x/y it already
  computes, label "Arrange as Column". Route its dispatch through `dispatchAction`.

### 4. Undo/redo actions, hotkeys, and buttons

- Add `history.undo` / `history.redo` to `onAction`: apply the returned actions via
  `applyAtlasBatch` and `dispatchDoc` (echo-marked; do NOT re-`record`).
- Add a toolbar to the chrome `top` slot, placed **first** so it sits top-left,
  with two buttons: Undo (`hotkey: 'Mod+z'`) and Redo (`hotkey: 'Mod+Shift+z'`) —
  match the exact hotkey string format `useHotkeys` expects (check
  `chrome/useHotkeys.ts`). Set each button's `enabled` from `canUndo()`/`canRedo()`.
  Make `chrome` a reactive builder (`chrome={buildChrome()}` reading the `canUndo`/
  `canRedo` signals) rather than a static const, so the buttons disable/enable live.
  **Reviewer watch-item:** confirm `ChromeSlots` re-renders when the `chrome` prop
  changes; if it reads the schema only once, thread the enabled state so the buttons
  still update.

### 5. External-reload integrity

The existing `createEffect(on(() => props.doc, ...))` guards fire on any `props.doc`
change. Use the echo flag so our own dispatches do not clear history, while a
genuine external reload calls `history.clear()`.

## Files to Modify

- `packages/core/src/atlas/history.ts` — new: `invertAtlasAction`, `invertAtlasBatch`.
- `packages/core/src/atlas/index.ts` — export them.
- `packages/client/src/apps/atlas/history.ts` — new: `useAtlasHistory`.
- `packages/client/src/apps/atlas/AtlasCanvas.tsx` — `dispatchAction` seam; route all edit sites; undo/redo actions; reactive chrome with top-left Undo/Redo buttons + hotkeys; echo-vs-external.
- `packages/core/src/atlas/history.test.ts` — inverse round-trip tests.
- `packages/client/src/apps/atlas/history.test.ts` — hook past/future/canUndo/canRedo, clear-on-external.

## Verification

```bash
pnpm -C packages/core exec tsgo --noEmit
pnpm -C packages/client exec tsgo --noEmit
pnpm -C packages/core exec vitest run
pnpm -C packages/client exec vitest run
```

## Out of Scope

- Platform-level (Dataflow/Canvas) history.
- Inverting user-initiated `removeNode` / any delete-Node feature (needs an edge
  action or snapshot inverse).
- Per-field granular undo within one dispatch (one entry per gesture is the unit).
- Grouping/coalescing rapid edits (e.g. debounced text edits) into one entry.
- An EARS requirement for undo/redo — add to doc01.07.04 in a follow-up once shipped.

## Notes

- One `dispatchAction` call = one history entry = one user intent; a batch (arrange,
  move+reparent) undoes as a single step.
- The action union is also the agent/MCP command channel — routing the UI through
  `dispatchAction` incidentally unifies interactive and agent edits on one typed,
  serializable seam. Do not expand scope to the agent path here; just do not fight it.

## Surface after this phase

- `packages/core/src/atlas/history.ts` exports `invertAtlasAction(before, action)`
  and `invertAtlasBatch(before, actions)` (inverses ordered reverse), covering
  add/reparent/setNode; `removeNode` inversion deliberately unsupported.
- `packages/client/src/apps/atlas/history.ts` exports `useAtlasHistory()` with
  `record/undo/redo/canUndo/canRedo/clear`.
- `AtlasCanvas` mutates only through `dispatchAction(actions, label)`; every user
  edit (add, duplicate, edit, mode, color, move/reparent, arrange) is one undoable
  entry. Undo/redo apply `AtlasAction[]` via `applyAtlasBatch`.
- Top-left toolbar has Undo/Redo buttons, reactively enabled from `canUndo`/`canRedo`,
  bound to Mod+Z / Mod+Shift+Z.
- External Document reloads clear history; echo dispatches do not.
- Atlas-only; not built: platform history, delete-Node inversion, coalescing.
