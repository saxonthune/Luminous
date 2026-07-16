# Atlas edit mode: edit a Node's Content in the Node (R7–R11)

## Motivation

Implements doc01.07.04 R7–R11:

- **R7.** The system shall allow the user to edit a Node's contents.
- **R8.** The system shall allow the user to edit a Node's contents in the Node
  itself, and not in an inspector panel or a similar separate surface.
- **R9.** The system shall draw a Node's contents either as markdown or as code,
  drawing code monospaced.
- **R10.** The system shall offer a switcher on each Node that sets whether the
  Node's contents are drawn as markdown or as code.
- **R11.** The system shall save each Node's switcher setting to the Document, so
  that an agent can read the intention of the contents.

R9 is already drawn by an earlier phase; this phase makes the Mode changeable and
the Content editable. The approved bindings (doc01.07.04, Atlas view):

| Target | Interaction | Action | Req |
|---|---|---|---|
| Node | double left click | Enter edit mode: name input, Content as a raw text area | R7, R8 |
| Node in edit mode | Ctrl+Enter, or blur | Commit the edits to the Document | R7 |
| Node in edit mode | Esc | Cancel the edits | R7 |
| Node switcher | left click | Switch the Node's Content Mode between markdown and code | R10 |

`packages/client/src/apps/dataflow/BoxContent.tsx` is the direct model — it already
solves in-node editing, and its bindings are the ones approved here.

## Do NOT

- **Do NOT build an inspector panel, sidebar, modal, or any editing surface outside
  the Node.** R8 is explicit. The edit form lives in the Node.
- **Do NOT hide the switcher behind edit mode.** R10 plus R11 mean the Mode is
  visible on the Node at all times — a reader should see a Node's declared
  intention without entering edit mode.
- **Do NOT add drag, duplicate, add-Node, container membership, context menus, or
  the toast.** Those are R1–R6 and belong to the next phase.
- **Do NOT touch `packages/client/src/apps/atlas/layout.ts`.**
- **Do NOT let the editing surface pan or zoom the canvas.** `BoxContent.tsx:92`
  stops pointer propagation and the form carries `data-no-pan="true"`. Both are
  load-bearing; copy them.
- **Do NOT persist edit state in the document.** Which Node is being edited, and
  any in-progress text, are client state. Only a committed edit is written.

## Plan

### 1. Node content component — `packages/client/src/apps/atlas/AtlasNodeContent.tsx`

New file, modeled closely on `apps/dataflow/BoxContent.tsx` (136 lines — read it in
full first). Two states behind `<Show when={props.editing()}>`:

**Read view (fallback)** — the Node's name, the switcher, and the Content drawn per
its Mode: `marked.parse` for `markdown` (keep the scoped-CSS and the security
comment pattern at `BoxContent.tsx:66-68`), a monospaced `<pre>` for `code`.

**Edit view** — a `<form data-no-pan="true">` with a name input and a raw text area
holding `content.text`. Port from `BoxContent.tsx`:
- `onPointerDown` stopPropagation (`:92`)
- Escape cancels, Ctrl/Cmd+Enter commits (`:94-102`)
- `onFocusOut` commits when focus leaves the whole form (`:103-107`) — note it
  checks that focus left the *form*, not the field; a name-to-textarea tab must not
  commit
- the form resets from the Node on each entry into edit mode (`:29-37`)

The switcher renders in **both** states. A Node with no Content still shows a
switcher; setting a Mode on an empty Node creates a Content with empty text.

### 2. Switcher

A two-value control on the Node reading `content.mode`. Clicking it writes
immediately through `dispatchDoc` — it is not part of the edit form's commit, and
it works without entering edit mode.

Keep it visually quiet; it appears on every Node on the canvas. A small two-segment
toggle labeled for the two Modes is enough. Reuse whatever chrome the client already
has for a small toggle if one exists — search before adding a new control.

### 3. Canvas wiring — `packages/client/src/apps/atlas/AtlasCanvas.tsx`

- An `editingId` signal, as `DataflowCanvas.tsx` has.
- Double click on a Node enters edit mode.
- On entering edit mode, fit the view to the Node — `DataflowCanvas.tsx:201`
  (`canvasRef.fitView([rect], 64)`) is the pattern. An `EDIT_HEIGHT` constant like
  `DataflowCanvas.tsx:31` is reasonable.
- Drop out of edit mode if the Node vanishes from a remote reload —
  `DataflowCanvas.tsx:217-220`.
- Commit calls the `dispatchDoc` prop the previous phase threaded through, with a
  `setNode` action carrying `name` and `content`.
- Respect the `useCanvasContext()` constraint: context only resolves inside
  `<Canvas>`'s children, which is why the scaffold has a separate node-layer
  component. Keep that structure.

### 4. Tests

- `packages/client/src/apps/atlas/__tests__/` — unit-test the pure parts: the patch
  an edit commit produces, and the Mode a switcher click produces (including on a
  Node with no Content). Follow `apps/dataflow/__tests__/mutations.test.ts` and
  extract the patch-building into a testable function rather than testing through
  the component.
- **Do not add an e2e test.** The e2e policy at `packages/client/e2e/atlas.spec.ts`
  (and `dataflow.spec.ts:2-7`) is boot smokes plus pins earned by incident. This
  phase earns neither.

## Files to Modify

- `packages/client/src/apps/atlas/AtlasNodeContent.tsx` — new: read view, edit form, switcher
- `packages/client/src/apps/atlas/AtlasCanvas.tsx` — `editingId`, double-click, fit, commit
- `packages/client/src/apps/atlas/mutations.ts` — new or extended: patch builders
- `packages/client/src/apps/atlas/__tests__/mutations.test.ts` — patch + switcher cases

## Verification

```bash
just typecheck
pnpm -C packages/client exec vitest run src/apps/atlas
pnpm -C packages/core exec vitest run tests/atlas
just lint
just build
```

## Out of Scope

- R1–R6: drag, duplicate, add Node, container membership, the toast
- Editing a Node's parent
- Editing Edges
- Layout, relations, MCP tools

## Notes

- The switcher writing immediately while the form commits on blur means two write
  paths into one Node. Make the switcher's write a `setNode` carrying only the
  Mode, so it cannot clobber uncommitted text in an open form.
- A Node with no Content is the interesting case for the switcher: decide and test
  whether clicking it creates `{ text: '', mode }`. The spec's assumption is yes —
  a Mode is always representable on a Node.
- `BoxContent.tsx`'s `onFocusOut` commit is subtle. Two focusable fields in one form
  means naive per-field blur commits on every tab. Copy the form-level check.

## Surface after this phase

- The Atlas app renders each Node with its name, a Mode switcher, and its Content
  drawn per Mode — markdown through `marked`, code in a monospaced `<pre>`.
- Double click on a Node enters edit mode in the Node itself: a name input and a raw
  text area for the Content text. Ctrl+Enter or blur commits; Escape cancels. The
  view fits to the Node on entry.
- The switcher is on every Node in both read and edit views, and writes the Mode
  immediately via `dispatchDoc` without entering edit mode. Clicking it on a Node
  with no Content creates a Content with empty text.
- `packages/client/src/apps/atlas/mutations.ts` exports the patch builders for a
  Content edit and a Mode switch.
- The document format and `@luminous/core/atlas`'s exports are unchanged.
- `layout.ts` is untouched and still the only place cactus layout is named.
- Negative space: no drag, no duplicate, no add-Node, no container membership, no
  context menus, no toast — R1–R6 are unimplemented. No Edge editing. No MCP tools.
  Dataflow and Canvas unchanged.
