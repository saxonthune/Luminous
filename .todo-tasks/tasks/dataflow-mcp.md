# Dataflow MCP tool group

## Motivation

Agents author dataflow documents through MCP (doc02.22 lists the verb set and
its rules — read it via `rhidoc cat doc02.22`). This phase adds the `dataflow`
tool group to `packages/mcp`, built on the phase-1 core module and the phase-2
server endpoints. Phase 3 of the dataflow-designer chain.

## Do NOT

- Do NOT add or change server endpoints — phase 2's surface is all you get:
  `GET /api/documents`, `GET /api/document/:path`, and
  `POST /api/document/write { path, content }`.
- Do NOT touch the existing tool groups (`pack`, `canvas`, `node`, `edge`,
  `view`, `query`) or their behavior.
- Do NOT reimplement document mutations in the MCP package — every mutation
  goes through the pure functions of `@luminous/core/dataflow`.
- Do NOT touch `packages/client`.
- Do NOT skip regenerating the bundle (`just mcp`) — the stdio server runs
  from `dist/`.

## Plan

### 1. Handlers — `packages/mcp/src/dataflow-tools.ts`

A handler module in the style of `query-tools.ts`/`view-tools.ts`. Shared
helpers: `loadDataflow(serverUrl, path)` (GET `/api/document/`, then
`parseDataflowDocument`) and `writeDataflow(serverUrl, path, doc)` (POST
`/api/document/write` with the serialized document). Tools:

- `list` — GET `/api/documents`, filter paths ending `.dataflow.json`.
- `create { path }` — path must end `.dataflow.json`; write
  `emptyDataflowDocument()`.
- `read { path }` — return the parsed document.
- `addBox { path, name, description?, contract? }` — via core `addBox`;
  return the new box id.
- `set { path, box, name?, description?, contract? }` — via core `setBox`.
- `connect { path, from, to }` / `disconnect { path, from, to }` — via core.
- `removeBox { path, box, cascade? }` — via core.
- `check { path }` — return `checkDocument` issues.
- `batch { path, actions }` — via core `applyDataflowBatch`; one write on
  success, no write on failure (atomicity comes from the single
  whole-document write).

Mutation errors from core come back as MCP tool errors with the core error
message; nothing is written on error.

### 2. Registration

- `packages/mcp/src/tools.config.ts` — add a `dataflow` group with
  `local: true` and the actions above, following the existing
  `ToolGroupConfig` shape so `ListTools` picks it up automatically. Write
  clear per-action and per-param descriptions — the tool schemas are how an
  agent learns this vocabulary (use the glossary terms: Box, Flow, Document).
- `packages/mcp/src/server.ts` — add the `dataflow` dispatch branch alongside
  the existing `view`/`query` branches.

### 3. Tests and bundle

- Tests matching the existing MCP test style (see how `query-tools`/config
  are tested today; `just test-mcp` passes). Cover: config shape (every
  dataflow action builds a valid tool), handler behavior against a mocked
  `fetch` (list filters, addBox writes the mutated doc, a failing batch
  writes nothing, create rejects non-dataflow paths).
- Regenerate the bundle with `just mcp`; commit `dist/` changes only if
  `dist` is tracked in git (check `git ls-files packages/mcp/dist` — if
  untracked, do not add it).

## Files to Modify

- `packages/mcp/src/dataflow-tools.ts` — new
- `packages/mcp/src/tools.config.ts` — add `dataflow` group
- `packages/mcp/src/server.ts` — dispatch branch
- MCP test file(s) — new coverage
- `packages/mcp/dist/*` — only if tracked

## Verification

```bash
just test-mcp
just typecheck-mcp
just build-mcp
just lint
```

## Out of Scope

- The client app (phase 4).
- Pack-style `describe` tooling — the tool schemas themselves carry the
  vocabulary.
- Drift/compare verbs.

## Notes

- Read phase 1's spec surface: all mutations are pure and
  `applyDataflowBatch` returns the original document on error — the handler
  only writes when `ok` is true.
- `LUMINOUS_SERVER_URL ?? 'http://localhost:4080'` is the existing server
  resolution; reuse it.

## Surface after this phase

- MCP exposes a `dataflow` tool group: `list`, `create`, `read`, `addBox`,
  `set`, `connect`, `disconnect`, `removeBox`, `check`, `batch` — parameter
  shapes as in the Plan.
- An agent with a running server can produce the Part I scenario end to end:
  create a document, add two boxes with descriptions, connect them.
- Every mutation round-trips through `@luminous/core/dataflow` and lands as
  one `POST /api/document/write`; failed mutations write nothing.
- Negative space: all pre-existing MCP tool groups are unchanged;
  `packages/client` is untouched.
