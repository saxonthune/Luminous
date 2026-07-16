# Atlas content model: replace description + contract with Content

## Motivation

The Atlas scaffold inherited `description?: string` and `contract?: {format, text}`
from the Dataflow Designer's Box. The Atlas UI requirements (doc01.07.04, R9–R11)
replace both with one Content carrying a Mode:

- **R9.** The system shall draw a Node's contents either as markdown or as code,
  drawing code monospaced.
- **R10.** The system shall offer a switcher on each Node that sets whether the
  Node's contents are drawn as markdown or as code.
- **R11.** The system shall save each Node's switcher setting to the Document, so
  that an agent can read the intention of the contents.

One field says what two did. Prose with fenced code blocks is markdown Mode; a
pure trait, JSON Schema, or interface definition is code Mode. The Mode is saved
because it records the author's intention, not a view preference — R11 makes it
part of the document contract.

Read `.rhidoc/01-product/07-atlas/03-glossary.md` for Content and Mode.

Do this now, while `.canvases/braincrawl.atlas.json` is ~30 hand-authored nodes
and the rewrite is cheap.

## Do NOT

- **Do NOT keep `description` or `contract`, and do NOT write a migration.**
  Delete them outright. Atlas has no users and no documents beyond the two
  fixtures in this repo. A compatibility shim, a deprecation, or a parser that
  accepts both shapes is the wrong answer.
- **Do NOT make `mode` optional inside a Content.** If a Content exists, its Mode
  is explicit. R11 says the Mode records intention; an inferred default records
  nothing. `content` itself stays optional.
- **Do NOT touch `packages/client/src/apps/atlas/layout.ts`.** It is the seam for
  the relation-based layout language. Nothing in this task needs it.
- **Do NOT add editing, a switcher control, or any write path.** Atlas stays a
  read-only viewer. This task changes the format and how Content is drawn, nothing
  more.
- **Do NOT touch the Dataflow Designer.** `AtlasContract` and `ContractBlock` are
  unrelated types that happen to agree. Deleting one must not touch the other.

## Plan

### 1. Types — `packages/core/src/atlas/types.ts`

Delete `AtlasContract` and both node fields it served. Replace with:

```ts
export type AtlasContentMode = 'markdown' | 'code';

export interface AtlasContent {
  text: string;
  mode: AtlasContentMode;
}

export interface AtlasNode {
  id: string;
  name: string;
  parent?: string;
  content?: AtlasContent;
}
```

`AtlasDocument` and `AtlasEdge` are unchanged.

### 2. Parser — `packages/core/src/atlas/document.ts`

- `NODE_FIELDS` (line 12): `['id', 'name', 'parent', 'content']`.
- Replace `CONTRACT_FIELDS` (line 13) with `CONTENT_FIELDS = new Set(['text', 'mode'])`.
- Replace `parseContract` (lines 22-40) with `parseContent`, following the same
  shape. Both `text` and `mode` are required. Validate `mode` against the two
  literals and make the error actionable — name the field and both valid values,
  e.g. `nodes[3].content.mode: must be "markdown" or "code"`.
- `parseNode` (lines 42-77): drop the `description` and `contract` branches; add a
  `content` branch calling `parseContent`.
- `serializeNode` (lines 205-211) and `serializeContract` (lines 201-203): replace
  with a `serializeContent` emitting `{ text, mode }` in that order.

Everything else in the parser — unknown-field rejection, duplicate ids, unknown
parent, `parentCycleIssues`, edge endpoint checks, all-issues accumulation — is
unchanged.

### 3. Barrel — `packages/core/src/atlas/index.ts`

Export `AtlasContent` and `AtlasContentMode`; drop `AtlasContract`.

### 4. Client rendering — `packages/client/src/apps/atlas/`

Find where `description` and `contract` are read (`projection.ts` and/or
`AtlasCanvas.tsx`) and replace both with one Content render that switches on Mode:

- `mode: 'markdown'` — render `content.text` through `marked`, as the scaffold
  already renders `description`. Keep the existing scoped-CSS and security
  comment pattern (see `apps/dataflow/BoxContent.tsx:66-68`).
- `mode: 'code'` — render `content.text` in a `<pre>`, monospaced.

If node height is estimated anywhere, base the estimate on `content.text`.

### 5. Fixtures

- `.canvases/braincrawl.atlas.json` — rewrite every node. A node whose old
  `description` was prose becomes `mode: "markdown"`. A node whose old `contract`
  held a JSON Schema, trait, or interface becomes `mode: "code"` with the
  contract's `text` as the Content text; the old `contract.format` is dropped.
  Where a node had both, merge into one markdown Content with the contract text in
  a fenced block. Keep node count, ids, names, parents, and edges as they are.
- `packages/client/e2e/fixtures/*.atlas.json` — same treatment.

### 6. Tests

- `packages/core/tests/atlas/document.test.ts` — replace the description/contract
  cases. Cover: round-trip with each Mode; `mode` missing when `content` present
  is an issue; an invalid `mode` value is an issue naming both valid values;
  unknown field inside `content` is an issue; `content` absent is valid.
- `packages/core/tests/atlas/examples.test.ts` — should need no change; it parses
  the real fixtures and must still pass.
- `packages/client/src/apps/atlas/__tests__/projection.test.ts` — update any
  description/contract fixtures to Content.

## Files to Modify

- `packages/core/src/atlas/types.ts` — delete `AtlasContract`, add `AtlasContent`/`AtlasContentMode`
- `packages/core/src/atlas/document.ts` — `parseContent`, `serializeContent`, field sets
- `packages/core/src/atlas/index.ts` — exports
- `packages/client/src/apps/atlas/projection.ts`, `AtlasCanvas.tsx` — render Content by Mode
- `.canvases/braincrawl.atlas.json` — rewrite nodes
- `packages/client/e2e/fixtures/*.atlas.json` — rewrite nodes
- `packages/core/tests/atlas/document.test.ts` — Content cases
- `packages/client/src/apps/atlas/__tests__/projection.test.ts` — Content fixtures

## Verification

```bash
just typecheck
pnpm -C packages/core exec vitest run tests/atlas
pnpm -C packages/client exec vitest run src/apps/atlas
just lint
just build
```

## Out of Scope

- Editing, the switcher control, and any write path — a later phase
- Layout, relations, and `layout.ts`
- MCP tools

## Notes

- `AtlasContentMode` is a union of two string literals, not an enum — it matches
  how `EdgeRole` and `NodeRole` are declared in `packages/core/src/types.ts`.
- The old `contract.format` field is dropped, not preserved. Mode replaces it, and
  it carries two values rather than a free string. If a fixture's format string
  held information worth keeping, put it in the Content text.

## Surface after this phase

- `@luminous/core/atlas` exports `AtlasDocument`, `AtlasNode`, `AtlasContent`,
  `AtlasContentMode`, `AtlasEdge`, `emptyAtlasDocument()`, `parseAtlasDocument()`,
  `serializeAtlasDocument()`. `AtlasContract` no longer exists.
- `AtlasNode` is `{ id, name, parent?, content? }`. `AtlasContent` is
  `{ text: string; mode: AtlasContentMode }` with both fields required.
  `AtlasContentMode` is `'markdown' | 'code'`. `description` and `contract` are gone.
- `AtlasDocument` is still `{ v: 1, nodes, edges }`; `AtlasEdge` is still
  `{ from, to, label? }`. No coordinates in the format.
- The Atlas app draws a Node's Content as markdown or monospaced code per its Mode.
- `packages/client/src/apps/atlas/layout.ts` still exports
  `layoutAtlas(doc: AtlasDocument): Map<string, {x, y}>` and is still the only
  place cactus layout is referenced.
- Negative space: Atlas is still read-only — no operations module, no write route,
  no edit UI, no switcher control. Still no pack, no kinds, no tags. Dataflow and
  Canvas are unchanged.
