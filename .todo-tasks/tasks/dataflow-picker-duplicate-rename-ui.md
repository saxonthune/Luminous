# Dataflow picker: Rename / Duplicate / Delete menu

## Motivation

Once the server exposes copy, move, and delete endpoints (paired task:
`document-copy-move-endpoints`), the dataflow file picker needs UI to invoke
them. Today the picker only lists and reads — it has no mutate path. This task
adds a per-row overflow ("triple-dot") menu with Rename, Duplicate, and Delete
to the dataflow picker and wires each to its endpoint.

## Do NOT

- Do NOT change the picker's appearance or behavior for the **Canvas** app. The
  overflow menu is dataflow-only. `DocumentPicker` is shared, so the menu MUST be
  opt-in: it renders only when the new action-callback props are passed, and only
  `DataflowApp` passes them.
- Do NOT re-implement copy/move/delete logic on the client. Call the server
  endpoints from the paired task and surface their `{ ok, error }` result.
- Do NOT let the user edit the `.dataflow.json` suffix or the directory in the
  Rename dialog — only the slug (the part before `.dataflow.json`). The suffix is
  a static label beside the input.
- Do NOT silently swallow a `"target exists"` error from copy/move — surface it
  as a toast (Duplicate auto-suffixes first; see plan).
- Do NOT build a generic modal framework. Two focused dialogs is the whole need.

## Plan

Path/label facts this relies on (verified in `serverSources.ts` and
`workspace.ts`):
- `source.id` is the full workspace-relative path, e.g.
  `myrepo/sub/Foo.dataflow.json` (root name is the first segment).
- `source.label` is the bare slug, e.g. `Foo` (suffix already stripped).
- Derive the directory prefix from `source.id` by slicing to the last `/`
  (may be empty if the doc is at a root's top level).
- A new full path is `${dir}${newSlug}.dataflow.json` where `dir` includes the
  trailing `/` (or is empty).

### 1. New client API module — `packages/client/src/sources/documentOps.ts`

Three functions, each POSTing JSON and returning the server's parsed result
`{ ok: true; path: string } | { ok: false; error: string }`:
- `copyDocument(from: string, to: string)` → `POST /api/document/copy` `{ from, to }`
- `moveDocument(from: string, to: string)` → `POST /api/document/move` `{ from, to }`
- `deleteDocument(path: string)` → `POST /api/document/delete` `{ path }`

Mirror the `fetch` style already in `serverSources.ts`. Export them from the
`sources` barrel (`packages/client/src/sources/index.ts`) if one re-exports
`serverSources`; otherwise import directly.

### 2. Add opt-in overflow menu to `packages/client/src/DocumentPicker.tsx`

Extend `DocumentPickerProps` with three optional callbacks:
```
onRename?: (source: CanvasSource) => void;
onDuplicate?: (source: CanvasSource) => void;
onDelete?: (source: CanvasSource) => void;
```
Define `hasRowActions = () => !!(props.onRename || props.onDuplicate || props.onDelete)`.

Restructure the row (currently a single full-width `<button>`, DocumentPicker.tsx:71-82):
- Wrap the row in a `<div class="flex items-center">`. The existing select
  `<button>` keeps firing `onSelect` and takes `flex-1`.
- When `hasRowActions()`, render a triple-dot `⋯` button on the right of the row.
  Clicking it (stop propagation so it doesn't trigger `onSelect`) toggles a menu
  for that row.
- Track which row's menu is open with a local signal `openMenuId` (the
  `source.id`, or `null`). Only one menu open at a time.
- The menu is a small absolutely-positioned panel anchored to the row, listing
  the actions whose callback prop is present: **Rename**, **Duplicate**,
  **Delete** (Delete styled as destructive, e.g. red text). Each item calls its
  callback with the `source` and closes the menu.
- Close the menu on outside click and on Escape. Register the outside-click /
  keydown listeners in `onMount` and remove them in `onCleanup` (Solid), or use a
  full-screen transparent backdrop element behind the menu that closes it on
  click — whichever is simpler in this component.

Keep the Canvas app untouched: it passes none of the three callbacks, so
`hasRowActions()` is false and no `⋯` button renders.

### 3. New `packages/client/src/apps/dataflow/RenameDialog.tsx`

A focused modal for renaming:
- Props: `source: CanvasSource`, `onSubmit: (newSlug: string) => void`, `onCancel: () => void`.
- A text input prefilled with `source.label`, auto-focused and text-selected on
  mount. To the immediate right of the input, a static, non-editable
  `.dataflow.json` label (muted).
- OK and Cancel buttons. Enter submits (calls `onSubmit` with the trimmed input);
  Escape and Cancel call `onCancel`.
- Disable OK when the input is empty or unchanged from `source.label`. Trim
  whitespace; reject a slug containing `/` (guard against path injection).
- Follow the surface/overlay styling already used in the app (see the picker
  card classes in `DocumentPicker.tsx:36-42` for tokens: `bg-surface`,
  `border-border-subtle`, `rounded-lg`, `--shadow-sm`). Render over a dimmed
  full-screen backdrop.

### 4. Wire the actions in `packages/client/src/apps/dataflow/DataflowApp.tsx`

Add dialog state and handlers, pass the three callbacks to `<DocumentPicker>`.

- Signals: `const [renaming, setRenaming] = createSignal<CanvasSource | null>(null)`
  and `const [deleting, setDeleting] = createSignal<CanvasSource | null>(null)`.
- Pass to `<DocumentPicker>` (DataflowApp.tsx:159):
  `onRename={(s) => setRenaming(s)}`, `onDelete={(s) => setDeleting(s)}`,
  `onDuplicate={handleDuplicate}`.
- `handleDuplicate(source)`: compute `to = ${dir}${source.label}-copy.dataflow.json`
  from `source.id`. Call `copyDocument(source.id, to)`. On `ok`, refresh the
  source list and toast success. On `"target exists"`, retry with
  `-copy-2`, `-copy-3`, … up to a small bound (e.g. 20); if all taken, toast the
  error. On any other error, toast it.
- Rename submit (from `RenameDialog.onSubmit(newSlug)`): compute
  `to = ${dir}${newSlug}.dataflow.json` from `renaming()!.id`. Call
  `moveDocument(renaming()!.id, to)`. On `ok`, clear `renaming`, refresh the
  list, toast. On error (incl. `"target exists"`), keep the dialog open or toast
  and close — toast + close is fine for the happy path.
- Delete confirm: a small confirmation modal (inline `Show` overlay in
  DataflowApp, styled like RenameDialog's backdrop/card — no separate component
  needed) reading `Delete "${deleting()!.label}.dataflow.json"? This cannot be
  undone.` with Delete (destructive) and Cancel buttons. On confirm, call
  `deleteDocument(deleting()!.id)`, clear `deleting`, refresh the list, toast.
- Refresh helper: re-run `fetchServerSources('.dataflow.json')` and
  `setSources(...)` after each successful mutation so the list reflects the
  change. (The WS watcher also broadcasts, but an explicit refresh avoids relying
  on watch timing for the picker view.)
- Reuse the existing `enqueueToast` (DataflowApp.tsx:28) for all success/error
  messages.

The menu only appears in the picker view (`shell().kind === 'picker'`), where no
document is open — so mutating the currently-open doc is not reachable from this
menu and needs no special handling.

## Files to Modify

- `packages/client/src/sources/documentOps.ts` — NEW: `copyDocument`,
  `moveDocument`, `deleteDocument` API callers.
- `packages/client/src/sources/index.ts` — export the new module (if the barrel
  re-exports sources).
- `packages/client/src/DocumentPicker.tsx` — optional action-callback props +
  opt-in per-row `⋯` overflow menu.
- `packages/client/src/apps/dataflow/RenameDialog.tsx` — NEW: rename modal with
  slug input + static suffix label + OK/Cancel/Enter/Escape.
- `packages/client/src/apps/dataflow/DataflowApp.tsx` — dialog state, the three
  callbacks, duplicate/rename/delete handlers, list refresh.

## Verification

```bash
just typecheck
just lint
just test
```

Then drive it manually (dataflow app must have the paired server endpoints
running):

```bash
just dev
# open the Dataflow Designer, hover a picker row, click ⋯:
#  - Duplicate -> "Foo" becomes "Foo-copy" in the list
#  - Rename    -> dialog prefilled "Foo" + ".dataflow.json" label; Enter renames
#  - Delete    -> confirm modal; confirming removes the row
# confirm the Canvas app picker shows NO ⋯ button
```

## Out of Scope

- The server endpoints — paired task `document-copy-move-endpoints` (must land
  first; this task calls its endpoint contract).
- Adding the menu to the Canvas app or any non-dataflow picker.
- Move-to-a-different-folder UI (the server supports it; the Rename dialog keeps
  the directory fixed).
- Undo for delete.

## Notes

- This is Solid.js — use `createSignal`/`Show`/`For`, and `onMount`/`onCleanup`
  for any document-level listeners. Consult the `solidjs` skill for idioms.
- `DocumentPicker` is shared; the opt-in-props approach is what keeps the Canvas
  app unchanged. Reviewer should confirm the Canvas picker renders identically
  (no `⋯`).
- Styling tokens to match: `bg-surface`, `bg-canvas`, `border-border-subtle`,
  `text-fg` / `text-fg-muted` / `text-fg-subtle`, `bg-accent` / `text-on-accent`,
  `--shadow-sm` — all already used in `DocumentPicker.tsx` and `DataflowApp.tsx`.
- Depends on the paired server task's exact error strings (`"target exists"`,
  `"not found"`) for the duplicate auto-suffix retry and toasts.

## Surface after this phase

- Dataflow picker rows show a `⋯` overflow menu (Rename / Duplicate / Delete);
  the Canvas picker is unchanged.
- `copyDocument` / `moveDocument` / `deleteDocument` client callers exist in
  `packages/client/src/sources/documentOps.ts`.
- `DocumentPicker` accepts optional `onRename` / `onDuplicate` / `onDelete`
  props; absent props = no menu (Canvas behavior preserved).
