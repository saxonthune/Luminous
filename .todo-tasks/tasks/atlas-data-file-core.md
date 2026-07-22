# Atlas Data File — core schema, parser, and resolver

## Motivation

An Atlas Node's Content often holds text copied out of source code — a trait
signature, a SQL schema, a route inventory. The copy drifts from the source and
nothing catches it, which undermines the point of an Atlas: reasoning about a
design without reading the code is only sound while the contract shown is the
contract that exists.

The Data File splits an Atlas into an authored part and a generated part, along
the same axis Canvas splits pack from graph. The Document keeps everything a
human authors — which Nodes exist, how they nest, what points at what, where they
sit, what the Colors mean. A sidecar `<name>.atlasdata.json`, written by a script
the repository maintains, holds text extracted from source. A Node's Content may
name a key; when the sidecar provides that key the Node draws the sidecar's text,
and otherwise it draws its own authored text as a fallback.

This phase adds the schema and the pure functions only. Nothing loads, watches, or
draws a Data File yet. Requirements R75–R82 in doc01.07.04 describe the behavior
this chain builds toward; this phase implements none of them directly, but every
later phase reads the resolver written here.

## Do NOT

- Do NOT merge resolved text into an `AtlasDocument`. The resolver returns a
  separate value. The client writes `doc()` back to disk on every edit, so any
  path that folds generated text into the document would permanently bake
  generated text into the authored file.
- Do NOT put `mode`, `color`, position, or any presentation field in a Data File
  entry. Presentation is authored and lives in the Document.
- Do NOT let a Data File carry `nodes` or `edges`. A script fills Content; it
  never adds, removes, or moves a Node.
- Do NOT modify anything under `packages/client`, `packages/server`, or
  `packages/mcp` in this phase.
- Do NOT bump `AtlasDocument.v`. The new field is optional and additive.
- Do NOT add a runtime dependency.

## Plan

### 1. Add `from` to `AtlasContent`

In `packages/core/src/atlas/types.ts:35`, add an optional `from?: string` to
`AtlasContent`, documented as the Data File key that fills this Content, with
`text` standing as the fallback when the key is absent.

### 2. Accept and round-trip `from` in the document parser

`packages/core/src/atlas/document.ts` rejects unknown fields, so a document using
`from` fails to load until all three of these change together:

- `CONTENT_FIELDS` at line 14 — add `'from'`.
- `parseContent` at line 23 — validate `from` as a string when present, pushing
  the same style of issue as the other field checks, and copy it into the
  returned `AtlasContent`.
- `serializeContent` at line 258 — emit `from` when present.

### 3. New module `packages/core/src/atlas/data.ts`

Define the sidecar and the resolver. Mirror the shape and validation style of
`document.ts` — a strict parser returning either the value or a list of issue
strings, rejecting unknown fields at every level.

Types:

- `AtlasDataSource` — `{ path: string; lines?: [number, number]; rev?: string }`.
  Where the text was extracted from, so the UI can show it and a reader can jump
  to it.
- `AtlasDataEntry` — `{ text: string; source?: AtlasDataSource }`.
- `AtlasData` — `{ v: number; of?: string; generatedAt?: string; entries: Record<string, AtlasDataEntry> }`.
  `of` names the Document this sidecar belongs to; `generatedAt` is an ISO 8601
  timestamp the generating script stamps.

Functions:

- `parseAtlasData(text: string): ParseAtlasDataResult` — the discriminated
  `{ ok: true; data } | { ok: false; issues: string[] }` union, matching
  `ParseAtlasDocumentResult`.
- `emptyAtlasData(): AtlasData`.
- `resolveContent(content: AtlasContent | undefined, data: AtlasData | undefined): ResolvedContent | undefined`
  where `ResolvedContent` is
  `{ text: string; mode: AtlasContentMode; filled: boolean; key?: string; source?: AtlasDataSource; missingKey: boolean }`.

  Resolution rules, and these are the whole contract every later phase depends on:
  - No `content` at all returns `undefined`.
  - No `from` returns the authored text with `filled: false`, `missingKey: false`.
  - `from` set and the key present in `entries` returns the entry's text with
    `filled: true`, plus `key` and the entry's `source`.
  - `from` set and the key absent returns the authored `text` with
    `filled: false`, `missingKey: true`, and `key` set to the name that missed.
  - `mode` always comes from the authored Content, never from the entry.

This single function is what makes rendering, fit-to-content measurement, and the
check agree; nothing downstream may re-derive these rules.

### 4. Extend `checkAtlasDocument`

In `packages/core/src/atlas/check.ts:9`, add an optional second parameter
`data?: AtlasData` and two issue kinds, keeping the existing checks untouched:

- A Node whose Content names a key the Data File does not provide — severity
  `warning`, since the Node still draws its authored fallback and the Document is
  valid on its own. Message names the node id and the key.
- An entry in the Data File that no Node's Content names — severity `warning`,
  naming the key. This catches a script that emits keys the map no longer uses.

When `data` is omitted, behave exactly as today: emit neither new issue.

### 5. Export from the module index

Add the new types and functions to `packages/core/src/atlas/index.ts` alongside
the existing document exports.

### 6. Tests

Add `packages/core/tests/atlas/data.test.ts` covering: a valid sidecar parses; an
unknown top-level field, a non-string `text`, and a non-object entry each produce
issues; and each of the four `resolveContent` branches above, including that
`mode` is taken from the authored Content and never from the entry.

Extend `packages/core/tests/atlas/document.test.ts` with a round-trip proving
`from` survives parse then serialize, and that a non-string `from` is an issue.

Extend `packages/core/tests/atlas/check.test.ts` with the dangling-key and
orphan-entry cases, and one asserting no new issues appear when `data` is omitted.

## Files to Modify

- `packages/core/src/atlas/types.ts` — add `from?: string` to `AtlasContent`
- `packages/core/src/atlas/document.ts` — accept, validate, and serialize `from`
- `packages/core/src/atlas/data.ts` — new: sidecar types, parser, resolver
- `packages/core/src/atlas/check.ts` — optional `data` argument, two new checks
- `packages/core/src/atlas/index.ts` — export the new surface
- `packages/core/tests/atlas/data.test.ts` — new test file
- `packages/core/tests/atlas/document.test.ts` — `from` round-trip cases
- `packages/core/tests/atlas/check.test.ts` — dangling-key and orphan cases

## Verification

```bash
just test-core
just typecheck-core
```

## Out of Scope

- Loading, serving, or watching the sidecar (next phase).
- Any rendering distinction between filled and authored Content (third phase).
- The `setNode` rule refusing edits to filled Content, and the MCP surface
  (third phase).
- The extraction script itself. Luminous provides the mechanism; a repository
  that uses an Atlas writes its own script and its own freshness check.

## Notes

- `parseAtlasDocument` is strict about unknown fields, so step 2 must land before
  any hand-authored document can use `from`. That strictness is also why an older
  client refuses a document using the field — acceptable, and worth remembering
  if a document is shared before this ships.
- `emptyAtlasDocument` and `v` are untouched: a Document that names no keys is
  unchanged by this phase, byte for byte.

## Surface after this phase

- `packages/core/src/atlas/types.ts` exports `AtlasContent` with an optional
  `from?: string`.
- `packages/core/src/atlas/data.ts` exports the types `AtlasData`,
  `AtlasDataEntry`, `AtlasDataSource`, `ResolvedContent`,
  `ParseAtlasDataResult`, and the functions `parseAtlasData`, `emptyAtlasData`,
  and `resolveContent(content, data)` with the four resolution branches above.
- `checkAtlasDocument(doc, data?)` accepts an optional second argument and
  reports dangling keys and orphan entries as warnings; called with one argument
  it behaves as it always did.
- All of the above are re-exported from `packages/core/src/atlas/index.ts`, so
  `@luminous/core/atlas` is the single import path.
- Negative space, relied on by later phases: nothing reads or writes a
  `.atlasdata.json` file yet; no server route serves one; no client code
  resolves Content; `setNode` still replaces `content` wholesale with no guard;
  `AtlasNodeContent` still renders `node.content.text` directly.
