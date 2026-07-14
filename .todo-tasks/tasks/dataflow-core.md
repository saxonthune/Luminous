# Dataflow core module

## Motivation

The Dataflow Designer app (docs: doc01.05.01 idea, doc02.21 format, doc02.22
operations — read them via `rhidoc cat doc02.21` etc.) needs a core module for
its document type: types, parsing, pure mutation functions, and a check
function. This is phase 1 of the dataflow-designer chain; the MCP tools
(phase 3) and client app (phase 4) both consume this module.

## Do NOT

- Do NOT touch `packages/server`, `packages/client`, or `packages/mcp` — later
  phases own those.
- Do NOT touch the existing graph/pack machinery in core (`graph.ts`,
  `loader.ts`, `validate.ts`, `registry.ts`, `pack/`, `render/`).
- Do NOT add new dependencies (no zod; hand-roll validation like
  `src/validate.ts` does).
- Do NOT store layout, positions, or sizes in the document — the viewer
  computes layout.
- Do NOT add a `role`/`kind` field to boxes — roles are deliberately not
  enforced (doc01.05.03).
- Do NOT create a new package — this is a module inside `packages/core`.

## Plan

### 1. Types — `packages/core/src/dataflow/types.ts`

The document shape (TypeScript is the source of truth for this shape; a
descriptive JSON Schema lives at
`.rhidoc/02-design/21-dataflow-document.schema.json` for reference):

```ts
export interface DataflowDocument { v: number; boxes: DataflowBox[]; flows: DataflowFlow[]; }
export interface DataflowBox { id: string; name: string; description?: string; contract?: ContractBlock; }
export interface ContractBlock { format: string; text: string; }
export interface DataflowFlow { from: string; to: string; }
```

Plus a `DataflowAction` discriminated union covering the mutations in step 3
(`addBox`, `set`, `connect`, `disconnect`, `removeBox`), for batch use.

### 2. Parse/serialize — `packages/core/src/dataflow/document.ts`

- `emptyDataflowDocument(): DataflowDocument` — `{ v: 1, boxes: [], flows: [] }`.
- `parseDataflowDocument(text: string): { ok: true; doc: DataflowDocument } | { ok: false; issues: string[] }` —
  hand-rolled structural validation in the style of `src/validate.ts`:
  well-formed JSON, `v` is a number, boxes/flows are arrays, required fields
  present and correctly typed, unique box ids, flow endpoints reference
  existing box ids, no unknown top-level or box/flow fields.
- `serializeDataflowDocument(doc): string` — stable field order, 2-space
  indent, trailing newline.

### 3. Mutations — `packages/core/src/dataflow/operations.ts`

Pure functions; each returns `{ ok: true; doc } | { ok: false; error: string }`
and never mutates its input:

- `addBox(doc, { name, description?, contract? })` — id is the kebab-cased
  name; on collision append `-2`, `-3`, …; id never changes after creation.
- `setBox(doc, id, { name?, description?, contract? })` — updates only the
  given fields; error if the box does not exist.
- `connect(doc, from, to)` — error if either endpoint is missing or the exact
  flow already exists.
- `disconnect(doc, from, to)` — error if the flow does not exist.
- `removeBox(doc, id, opts?: { cascade?: boolean })` — error if flows attach
  to the box and `cascade` is not set; with `cascade`, remove those flows too.
- `applyDataflowBatch(doc, actions: DataflowAction[])` — applies in order;
  fail-fast; on any error returns the error and the ORIGINAL document
  unchanged (atomic).

### 4. Check — `packages/core/src/dataflow/check.ts`

`checkDocument(doc): CheckIssue[]` where
`CheckIssue = { severity: 'error' | 'warning'; message: string; boxId?: string }`.
Errors: flow endpoint naming no box, duplicate box ids, duplicate box names.
Warnings: a box with inbound flows and no outbound flow ("black hole"), a box
with no flows at all ("orphan"). Warnings never block anything.

### 5. Barrel and export

- `packages/core/src/dataflow/index.ts` re-exporting all of the above.
- Add subpath export `"./dataflow": "./src/dataflow/index.ts"` to
  `packages/core/package.json`, mirroring the existing `./graph` pattern.
- Do NOT re-export from the root barrel `src/index.ts` (keeps the module
  independent of the graph machinery).

### 6. Tests

Follow the existing core test layout (find existing `*.test.ts` under
`packages/core/src/` and match their location and style; vitest). Cover:
parse accepts a valid document and rejects each malformed shape;
serialize/parse round-trip; every mutation's success and error paths; id
collision suffixing; rename preserves id; batch atomicity (a failing middle
action leaves the document untouched); each check error and warning.

## Files to Modify

- `packages/core/src/dataflow/types.ts` — new
- `packages/core/src/dataflow/document.ts` — new
- `packages/core/src/dataflow/operations.ts` — new
- `packages/core/src/dataflow/check.ts` — new
- `packages/core/src/dataflow/index.ts` — new
- `packages/core/package.json` — add `./dataflow` subpath export
- test file(s) next to the module, matching existing core test conventions

## Verification

```bash
just test-core
just typecheck-core
just lint
```

## Out of Scope

- Server, MCP, and client wiring (phases 2–4).
- Drift detection against code.
- Flow labels, contract registries, compound operation verbs.

## Notes

- The glossary (doc01.05.03) fixes the vocabulary: Box, Flow, Document,
  Description, Contract. Use these words in identifiers and test names.

## Surface after this phase

- `@luminous/core/dataflow` exports: `DataflowDocument`, `DataflowBox`,
  `ContractBlock`, `DataflowFlow`, `DataflowAction`, `CheckIssue`,
  `emptyDataflowDocument`, `parseDataflowDocument`,
  `serializeDataflowDocument`, `addBox`, `setBox`, `connect`, `disconnect`,
  `removeBox`, `applyDataflowBatch`, `checkDocument`.
- All mutations are pure (never mutate input); `applyDataflowBatch` is atomic
  (error returns the original document).
- Box ids are kebab-cased names, collision-suffixed, stable across renames.
- Negative space: `packages/server`, `packages/client`, `packages/mcp`, and
  all existing core graph/pack modules are untouched and behave exactly as
  before.
