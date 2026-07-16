# Make Atlas writable

## Motivation

The Atlas scaffold is read-only by construction: the server's write route rejects
`.atlas.json`, and the client has no dispatch path. Every requirement in
doc01.07.04 — drag, duplicate, add, container membership, editing — needs writing.
This phase opens that path and adds nothing visible.

The Dataflow Designer already solved this exact problem. Follow it closely rather
than inventing: `packages/core/src/dataflow/operations.ts` for the pure operations
and `packages/client/src/apps/dataflow/DataflowApp.tsx` for the client dispatch,
including the WebSocket-echo suppression.

## Do NOT

- **Do NOT add any UI.** No edit mode, no context menus, no drag, no buttons, no
  picker row actions. This phase ends with a viewer that can write but has no way
  for a user to ask it to. The next phase adds the UI.
- **Do NOT open the copy, move, or delete routes.** No requirement asks for file
  rename, duplicate, or delete on an atlas yet. Only `/api/document/write` opens.
  Leave `packages/server/src/index.ts` copy/move/delete guards rejecting
  `.atlas.json`.
- **Do NOT route Atlas writes through `applyAction`/`applyBatch` in
  `packages/server/src/store.ts`.** Those are v3 graph actions. Atlas is a raw JSON
  document like a dataflow: the client serializes the whole document and POSTs it.
  Those two sites must keep rejecting atlas paths.
- **Do NOT add edge operations.** No requirement needs adding or removing an Edge
  by hand yet. `removeNode` still has to cascade, but there is no `connect` or
  `disconnect`. See Notes.
- **Do NOT touch `packages/client/src/apps/atlas/layout.ts`.**
- **Do NOT skip the write-echo suppression.** Without it, the app's own write comes
  back over the WebSocket and reloads the document under the user. See
  `DataflowApp.tsx:37` and `:200-207`.

## Plan

### 1. Operations — `packages/core/src/atlas/operations.ts`

New file, modeled on `packages/core/src/dataflow/operations.ts`. Pure functions;
every one returns a new document and never mutates its input.

```ts
export type AtlasResult = { ok: true; doc: AtlasDocument } | { ok: false; error: string };
```

Operations:
- `addNode(doc, { id, name, parent? })` — error if `id` already exists, or if
  `parent` names an unknown node.
- `setNode(doc, id, patch)` — patch may carry `name` and `content`. Error on
  unknown `id`. Setting `content` to `undefined` clears it.
- `removeNode(doc, id)` — error on unknown `id`. **Cascades**: removes every Edge
  touching the node, and every descendant Node (and their Edges) via the parent
  chain. Read `parentCycleIssues` in `document.ts:106-131` for how the parent chain
  is walked.
- `reparent(doc, id, parent | undefined)` — error on unknown `id`, unknown
  `parent`, or if the move would create a parent cycle (including `parent === id`).
  `undefined` makes the node a root.

Also an action union and a batch, following
`dataflow/operations.ts`'s `applyDataflowBatch`:

```ts
export type AtlasAction = AddNodeAction | SetNodeAction | RemoveNodeAction | ReparentAction;
export function applyAtlasBatch(doc: AtlasDocument, actions: AtlasAction[]): AtlasResult;
```

A batch is all-or-nothing: on the first failing action, return that error and
discard the whole batch.

### 2. Checks — `packages/core/src/atlas/check.ts`

New file, modeled on `packages/core/src/dataflow/check.ts`. Semantic checks,
separate from parsing:

```ts
export interface AtlasCheckIssue { severity: 'error' | 'warning'; message: string; }
export function checkAtlasDocument(doc: AtlasDocument): AtlasCheckIssue[];
```

Read `dataflow/check.ts` first and mirror its severity conventions. Include at
least: duplicate Node name within one Container (warning — names are how a human
and an agent refer to a Node); Edge endpoints that no longer exist (error).

### 3. Barrel — `packages/core/src/atlas/index.ts`

Export the operations, the action types, `applyAtlasBatch`, `checkAtlasDocument`,
and `AtlasCheckIssue`.

### 4. Server — open the write route only

- `packages/server/src/index.ts` — the POST `/api/document/write` guard currently
  rejects anything that is not a dataflow path. Change it to accept atlas paths
  too, using the `isRawDocPath` helper the scaffold added to
  `packages/server/src/store.ts`. Read the guard and the helper before editing;
  do not assume the exact predicate name or line.
- Leave the copy, move, and delete guards alone.
- `packages/server/tests/atlas-documents.test.ts` — extend (or add) coverage that a
  write to a `.atlas.json` path succeeds and round-trips, and that copy, move, and
  delete on a `.atlas.json` path are still rejected. Model on
  `packages/server/tests/dataflow-documents.test.ts`.

### 5. Client dispatch — `packages/client/src/apps/atlas/AtlasApp.tsx`

Port the write path from `DataflowApp.tsx`:
- `dispatchDoc` (`DataflowApp.tsx:89-100`) — apply the action optimistically with
  `applyAtlasBatch`, `setDoc`, then `writeDocument(id, serialized)`. On failure,
  toast and reload from the server.
- `ownWritesInFlight` (`:37`, `:200-207`) — suppress the WebSocket echo of the
  app's own write.
- Use `serializeAtlasDocument` for the payload and
  `packages/client/src/sources/documentOps.ts`'s `writeDocument`, which is already
  path-agnostic.

Pass `dispatchDoc` down to `AtlasCanvas` as a prop but leave it unused there —
the next phase wires it to the UI.

### 6. Tests

- `packages/core/tests/atlas/operations.test.ts` — each operation's success and
  each error. Cover `removeNode` cascading to descendants and edges; `reparent`
  rejecting a cycle and rejecting self-parenting; batch atomicity (a failing
  action discards earlier ones in the same batch).
- `packages/core/tests/atlas/check.test.ts` — each check, both severities.

## Files to Modify

- `packages/core/src/atlas/operations.ts` — new
- `packages/core/src/atlas/check.ts` — new
- `packages/core/src/atlas/index.ts` — exports
- `packages/server/src/index.ts` — write route guard only
- `packages/client/src/apps/atlas/AtlasApp.tsx` — `dispatchDoc`, echo suppression
- `packages/core/tests/atlas/operations.test.ts` — new
- `packages/core/tests/atlas/check.test.ts` — new
- `packages/server/tests/atlas-documents.test.ts` — write round-trip + rejections

## Verification

```bash
just typecheck
pnpm -C packages/core exec vitest run tests/atlas
pnpm -C packages/server exec vitest run tests/atlas-documents.test.ts
pnpm -C packages/client exec vitest run src/apps/atlas
just lint
just build
```

## Out of Scope

- All UI — the next phase
- Copy, move, delete of atlas files
- Edge operations
- MCP tools for Atlas
- Layout and relations

## Notes

- Edge operations are deliberately absent. The format has Edges and the fixture
  uses them, but no requirement asks the user to draw one yet, so there is nothing
  to build against. `removeNode` cascading is the only Edge mutation this phase
  needs.
- `reparent` is the operation R4 (add a Node to a Container, remove it from one)
  will call. Its cycle check is the same walk the parser already does — reuse the
  approach, and extract a shared helper if that reads better than duplicating it.
- Watch the difference between a *parse* issue and a *check* issue: parsing rejects
  a malformed document; checks describe a well-formed document that is
  questionable. Duplicate names are a check, not a parse error.

## Surface after this phase

- `@luminous/core/atlas` additionally exports `addNode`, `setNode`, `removeNode`,
  `reparent`, `applyAtlasBatch`, `checkAtlasDocument`, and the types `AtlasResult`,
  `AtlasAction`, `AtlasCheckIssue`.
- `AtlasResult` is `{ ok: true; doc } | { ok: false; error: string }`. `AtlasAction`
  is the union of add-node, set-node, remove-node, and reparent actions. There are
  no edge actions.
- `removeNode` cascades to descendants and to every Edge touching a removed Node.
  `reparent` rejects cycles and self-parenting. `applyAtlasBatch` is all-or-nothing.
- The server accepts POST `/api/document/write` for `*.atlas.json`. It still
  rejects copy, move, and delete for those paths, and still rejects graph actions
  on them.
- `AtlasApp.tsx` exposes `dispatchDoc` — optimistic apply, serialize, write, reload
  on failure — and suppresses the WebSocket echo of its own writes. It passes
  `dispatchDoc` to `AtlasCanvas`, which does not yet call it.
- The document format is unchanged from the previous phase.
- Negative space: no Atlas UI can write yet — no edit mode, no switcher, no drag,
  no context menu, no picker row actions. `layout.ts` is untouched and still the
  only place cactus layout is named. No MCP tools. Dataflow and Canvas unchanged.
