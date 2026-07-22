# Atlas Data File — tell filled from authored, and protect both

## Motivation

After the transport phase a Node draws its Data File text, but nothing tells the
user that the text is generated, nothing says when a named key is missing, and
nothing stops the user from typing over text a script owns. This phase closes
those gaps and makes filled Content safe to render.

It implements R76 (draw filled Content differently), R77 (indicate a missing
key), R78 (filled Content is read-only, and shows the key and its source), and
R82 (fit to the text the Node draws). It also escapes filled text before markdown
rendering: authored text is written by the person looking at it, but filled text
is extracted from source files by a script, so markup embedded in a string
literal or a comment would otherwise reach `innerHTML`.

## Do NOT

- Do NOT put the key or the source in an inspector panel or any separate
  surface — R8 requires Content to be read and edited on the Node itself.
- Do NOT make the Node's Name or Mode read-only. Both are authored and stay
  editable even when the Content is filled (R78).
- Do NOT initialize the edit form from resolved text. The form must show the
  authored fallback, or a commit would copy generated text into the Document.
- Do NOT escape or sanitize authored Content. Its unescaped rendering is
  deliberate and documented at `AtlasNodeContent.tsx:248-250`; only filled text
  changes behavior.
- Do NOT add a sanitizer dependency. Escaping before `marked.parse` is enough for
  the threat here and keeps the dependency list unchanged.
- Do NOT reimplement the resolution rules. Call `resolveContent` from
  `@luminous/core/atlas` everywhere, including the fit measurement.

## Plan

### 1. Preserve `from` through a content patch (`packages/core/src/atlas/operations.ts`)

`setNode` (line 25) replaces `content` wholesale, so any patch built without
`from` silently unlinks a Node from its key. Both client patch builders do
exactly that: `buildContentEditPatch` (`mutations.ts:17`) and `buildModePatch`
(`mutations.ts:32`) construct a fresh `content` object, so flipping the Mode
switcher on a filled Node would today drop its key.

Change `setNode` so a `content` patch that does not mention `from` keeps the
Node's existing `from`, while a patch that includes the key explicitly (including
setting it to `undefined`) sets or clears it. This is a core rule so the MCP path
obeys it too, and it means neither patch builder needs changing.

Add a test in `packages/core/tests/atlas/operations.test.ts` for both directions:
a Mode-only patch preserves `from`, and an explicit `from: undefined` clears it.

### 2. Draw filled Content differently (`AtlasNodeContent.tsx`)

Using the `ResolvedContent` the previous phase already computes:

- When `filled` is true, mark the Content so the user sees it is generated
  without selecting the Node (R76). Keep it quiet — this appears on every filled
  Node in a dense canvas, so a small persistent marker on the Content band reads
  better than a border or a tint that competes with the Node's Color.
- When `missingKey` is true, indicate that the Node is drawing its authored
  fallback (R77), distinctly from the filled marker — this is a broken link, not
  a normal state, and it is the signal that a script's key was renamed or
  dropped.

### 3. Escape filled text before markdown (`AtlasNodeContent.tsx:246-257`)

The markdown branch passes text to `marked.parse` and assigns the result to
`innerHTML`. When `filled` is true, escape `&`, `<`, and `>` in the resolved text
before parsing, so markup carried out of a source file renders as literal text.
Markdown structure a script emits deliberately — headings, lists, fenced code —
still works, because none of it depends on those three characters.

The code branch (lines 258-264) renders into a `<pre>` and needs no change.

### 4. Refuse edits to filled Content (`AtlasNodeContent.tsx`)

Double-clicking a Node enters edit mode with a name input and a content textarea
(lines 348-383), with the form reset from the node at lines 116-122.

When the resolved Content is filled: keep the name input editable, replace the
content textarea with a read-only rendering, and show the key that fills it along
with the source path and line range from `ResolvedContent.source` (R78). Commit
and cancel behavior for the name is unchanged.

When the Content is not filled — including the missing-key case, where the
authored fallback is what the Node draws — editing works exactly as it does
today.

Also show the key and source on hover of a filled Node, per the bindings table
row added for R78.

Make sure the edit form is seeded from the authored `node.content.text`, not from
the resolved text, so a Node that later loses its key still holds the fallback
its author wrote.

### 5. Fit to the text the Node draws (`fitContent.ts`, `AtlasCanvas.tsx`)

`measureContentFit` (`fitContent.ts:50`) renders content off-canvas with mirrored
classes and measures it. It is called from `fitNodeToContent`
(`AtlasCanvas.tsx:298-310`) for the double-click-a-grip command (R72) and from
the commit path for R74. Both currently measure the Node's authored text, so a
filled Node would fit to its fallback stub.

Pass the resolved text into the measurement so both paths fit what the Node
actually draws (R82). Keep the jsdom guard at `fitContent.ts:83` intact.

### 6. MCP surface (`packages/mcp/src/atlas-tools.ts`)

- `nodeSet` (line 87) passes a `content` patch straight to `setNode`; make sure
  its type accepts `from` so an agent can bind a Node to a key.
- `readAtlas` (line 69) returns the raw document. Have it surface which Nodes name
  a key, so an agent reading the Atlas does not paste contract text into a slot a
  script owns — the exact drift this whole chain exists to prevent.

While in this file, fix the batch path dropping `content` and `color`: an
`addNode` action carries neither, so an agent must follow every create with a
`setNode`. Make `applyBatch`'s create path carry them if the underlying action
shape allows, or document the two-step requirement in the tool description.

### 7. Tests

Extend `packages/client/src/apps/atlas/__tests__/AtlasNodeContent.test.tsx` with:
filled Content renders the sidecar text and is marked as filled; a missing key
renders the authored fallback and is marked as such; a filled Node's content
textarea is absent in edit mode while the name input remains; and markup in
filled text does not produce an element in the rendered output.

## Files to Modify

- `packages/core/src/atlas/operations.ts` — `setNode` preserves `from`
- `packages/core/tests/atlas/operations.test.ts` — preserve and clear cases
- `packages/client/src/apps/atlas/AtlasNodeContent.tsx` — filled marker, missing-key
  indicator, escaping, read-only filled edit mode, key and source display
- `packages/client/src/apps/atlas/fitContent.ts` — measure resolved text
- `packages/client/src/apps/atlas/AtlasCanvas.tsx` — pass resolved text to the fit paths
- `packages/mcp/src/atlas-tools.ts` — `from` in `nodeSet`, filled slots in `readAtlas`,
  batch create carrying `content`/`color`
- `packages/client/src/apps/atlas/__tests__/AtlasNodeContent.test.tsx` — cases above

## Verification

```bash
just test-core
just test-client
just test-mcp
just typecheck
```

## Out of Scope

- The extraction script, a `just` recipe to run it, and any CI freshness check.
  Luminous provides the mechanism; a repository that keeps an Atlas writes its own
  script, in the shape of `gen-skill-reference` / `check-skill-reference`
  (`justfile:129-134`).
- A `just` runner for `checkAtlasDocument`. It still has no caller outside its
  own tests, which is worth fixing, but it is a separate task.
- Editing a Data File from the canvas. It stays script-owned and read-only.

## Notes

- The escaping in step 3 is a deliberate narrowing, not a general sanitizer:
  it neutralizes markup from extracted source while leaving authored Content's
  existing behavior alone. If filled Content ever needs to emit real HTML, that
  is a decision to revisit with a proper sanitizer, not by widening this.
- R78 splits one existing bindings row in doc01.07.04 into an authored case and a
  filled case. The doc is already updated; the implementation must match both rows.

## Surface after this phase

- `setNode` preserves a Node's `from` across a `content` patch that does not
  mention it, and clears it when the patch sets it to `undefined`.
- `AtlasNodeContent` distinguishes filled from authored Content, indicates a
  missing key, renders filled markdown with `&`, `<`, and `>` escaped, refuses
  edits to filled Content while keeping the Name and Mode editable, and shows the
  filling key with its source path and line range.
- `measureContentFit` and both fit paths in `AtlasCanvas` measure the text the
  Node draws.
- The MCP `atlas` tool accepts `from` on `nodeSet` and reports filled slots from
  `readAtlas`.
- R75–R82 of doc01.07.04 are all implemented; the chain is complete.
