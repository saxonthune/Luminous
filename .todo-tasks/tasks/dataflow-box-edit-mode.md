# Dataflow Designer: Box edit mode — markdown read view, textarea editing

## Motivation

R16 (doc01.05.04): the user edits a Box's contents in place. The decided
design: double-click a Box swaps its interior from a rendered read view to a
plain-textarea edit form (no editor library); the Description renders as
markdown via `marked` in read mode; the view fits to the Box on entry.
Decisions already made: `marked` for read-mode rendering (already a dependency,
precedent in `InfoModal.tsx`), plain `<textarea>` for editing (no CodeMirror —
its six declared-but-unimported packages leave `package.json` in this change).

## Do NOT

- Do NOT introduce an editor library (CodeMirror, ProseMirror, etc.) — plain
  `<input>`/`<textarea>` only. Remove the dead CodeMirror deps instead.
- Do NOT sanitize through a new dependency — follow `InfoModal.tsx:78-84`
  exactly: `marked` unsanitized with the same SECURITY comment rationale
  (dataflow documents are author-controlled workspace files, same trust class
  as graph data).
- Do NOT write positions or any new fields to the document — edit mode
  commits only `name`, `description`, `contract` via `setBox`.
- Do NOT let edit-mode keystrokes reach canvas gestures: the form must sit
  under `data-no-pan` and stop propagation on pointerdown (otherwise typing
  and text selection drag the node).
- Do NOT modify `packages/cactus` or `packages/core`.

## Plan

### 1. Read mode: markdown Description

In `DataflowCanvas.tsx` (or an extracted `BoxContent.tsx` child component if
DataflowCanvas is getting long after phase 2), replace the plain
`<p>{description}</p>` with a div rendered via
`marked.parse(description, { async: false })` into `innerHTML`, copying the
SECURITY comment style from `packages/client/src/InfoModal.tsx:78`. Constrain
with the existing text classes; add `prose`-like minimal styling only if the
default looks broken (keep it small: paragraphs, code, lists, bold).

### 2. Edit mode

State: `const [editingId, setEditingId] = createSignal<string | null>(null)` —
exactly one Box editable at a time.

Entry: `onDblClick` on the Box's inner content div — `stopPropagation()`,
`setEditingId(box.id)`, then `canvasRef.fitView([rect of this box], padding)`
(the decided zoom-legibility fix).

The editing Box renders a form instead of the read view, wrapped in a
`data-no-pan="true"` container that also stops `pointerdown` propagation
(mirrors `NodeContainer`'s layout-picker guard, `NodeContainer.tsx:88`):

- Name — single-line `<input>`, autofocused.
- Description — `<textarea>` with the raw markdown source.
- Contract — a format `<input>` (free text, e.g. `prose`, `json-schema`) and a
  monospace `<textarea>` for the text. Both empty ⇒ commit omits `contract`.

Sizing: give the editing Box a larger fixed edit size (e.g. width unchanged,
height ~280px) by overriding the `h` (and if needed `w`) passed to
`NodeContainer` while `editingId() === box.id`. The node-rect registry is
reactive, so edges and the group underlay follow. Do not attempt
content-driven auto-grow in v1.

Commit: `Ctrl+Enter` anywhere in the form, or blur of the whole form
(`focusout` where `relatedTarget` is outside the form container) — build the
updated box and dispatch via the phase-2 path:
`setBox(doc, id, { name, description, contract })` → `onDocChange`. Empty
name: keep the previous name (a Box always has a Name, glossary doc01.05.03).
Cancel: `Escape` — discard, `setEditingId(null)`.

Exit edit mode on commit and on cancel. If the document changes remotely while
editing (doc prop changes identity and the edited box id disappears), drop out
of edit mode.

### 3. Remove dead CodeMirror dependencies

Delete from `packages/client/package.json`: `@codemirror/commands`,
`@codemirror/lang-markdown`, `@codemirror/language`, `@codemirror/state`,
`@codemirror/view`, `@lezer/markdown`. Run `pnpm install` to update the
lockfile. Nothing imports them (verified: zero hits repo-wide).

### 4. Tests

- Unit: commit-payload builder (form values → `setBox` patch; empty contract
  omitted; empty name preserved) in
  `packages/client/src/apps/dataflow/__tests__/`.
- e2e (`packages/client/e2e/dataflow.spec.ts`): double-click a box → textarea
  visible; type a new description; Ctrl+Enter; assert the rendered read view
  shows the new text. Also assert markdown renders (a `**bold**` description
  produces a `<strong>`).

## Files to Modify

- `packages/client/src/apps/dataflow/DataflowCanvas.tsx` — read-mode markdown,
  edit mode (possibly extracting `BoxContent.tsx`)
- `packages/client/src/apps/dataflow/__tests__/` — commit-payload unit test
- `packages/client/e2e/dataflow.spec.ts` — edit-mode e2e
- `packages/client/package.json` + `pnpm-lock.yaml` — CodeMirror removal

## Verification

```bash
just typecheck-client
just test-client
just build
just test-e2e
just lint
```

## Out of Scope

- Live markdown preview or WYSIWYG.
- Contract-format syntax highlighting.
- Editing Flows or Groups from the form (Group membership is a phase-2 menu).
- Auto-growing edit form.

## Notes

- Phase-2 surface consumed: `onDocChange` on `DataflowCanvas`, the dispatch/
  echo-suppression path in `DataflowApp`. If a remote (non-echo) change
  arrives mid-edit, the doc reload replaces the canvas content — dropping out
  of edit mode losing unsaved keystrokes is accepted v1 behavior.
- Dblclick targets don't collide: box dblclick stops propagation; the cluster
  label (phase 1) is a different element.
- `useHotkeys` already ignores focused inputs (`useHotkeys.ts:11-13`), and the
  phase-2 Delete-key listener copies that guard — typing in the form is safe.

## Surface after this phase

- Box read view renders Description as markdown (`marked`, unsanitized,
  author-controlled rationale documented at the call site).
- Double-click on a Box enters a single-box edit mode: name input, raw-markdown
  description textarea, contract format + text fields; Ctrl+Enter/blur commits
  through `setBox` + `onDocChange`; Escape cancels; the view fits to the Box on
  entry.
- CodeMirror packages are gone from `packages/client/package.json`.
- Negative space: no editor library anywhere in the client; the document
  schema is unchanged; cactus is unchanged.
