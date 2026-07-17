# MCP atlas tool group: author .atlas.json documents

## Motivation

The Luminous MCP models `.graph.json` (canvas/node/edge/batch/query/view/pack) and
`.dataflow.json` (dataflow), but **not `.atlas.json`**. So an agent cannot author or
edit an Atlas document (e.g. expand braincrawl). This adds an `atlas` tool group,
built exactly like `dataflow` — a thin proxy over the server's dumb-storage
endpoints plus core operations applied in the MCP process.

Depends on `atlas-edge-operations` (Phase 1), which adds `addEdge`, `removeEdge`,
`buildBisectActions`, and the edge `AtlasAction`s this tool exposes.

## The pattern (from dataflow)

The server is dumb storage: `GET /api/document/{path}`, `POST /api/document/write`
(`{path, content}`), `GET /api/documents`. `dataflow-tools.ts` loads via GET +
`parseDataflowDocument`, mutates with **core** operations in-process, writes via
POST + `serializeDataflowDocument`. The `dataflow` tool is registered in
`tools.config.ts` and dispatched in `server.ts` (`:267`). The atlas group mirrors
this one-to-one. Atlas has no server-side batch endpoint, so its `batch` is applied
locally via `applyAtlasBatch` (like `view`/`dataflow`), not proxied like the graph
`batch`.

## Do NOT

- **Do NOT** add a server-side atlas endpoint. Storage stays generic; all atlas
  domain logic runs in the MCP process against `@luminous/core/atlas`.
- **Do NOT** re-implement node/edge logic — call the core operations
  (`addNode`/`setNode`/`removeNode`/`reparent`/`addEdge`/`removeEdge`/
  `buildBisectActions`/`applyAtlasBatch`). The MCP only loads, dispatches, writes.
- **Do NOT** generate node ids. Atlas ids are meaningful and author-supplied
  (e.g. `cli.braincrawl.openalex`) — `node/create` takes an explicit `id`.
- **Do NOT** proxy the atlas `batch` to the server. Apply `applyAtlasBatch`
  in-process and write the whole result back.

## Plan

### 1. `packages/mcp/src/atlas-tools.ts` (new — mirror `dataflow-tools.ts`)

- `loadAtlas(serverUrl, path)`: GET `/api/document/{path}`, `parseAtlasDocument`.
- `writeAtlas(serverUrl, path, doc)`: `serializeAtlasDocument`, POST `/api/document/write`.
- `listAtlases(serverUrl)`: GET `/api/documents`, filter `.atlas.json`.
- `createAtlas(serverUrl, path)`: require `.atlas.json`; `emptyAtlasDocument()`; write.
- `readAtlas(serverUrl, path)`: `loadAtlas`.
- Mutation helpers, each **load → apply core op → write → return updated doc**:
  `nodeCreate`, `nodeSet`, `nodeReparent`, `nodeDelete`, `edgeConnect`,
  `edgeDisconnect`, `edgeBisect` (calls `buildBisectActions` then `applyAtlasBatch`),
  and `applyBatch` (`applyAtlasBatch` over an `AtlasAction[]`). Bail with the
  `AtlasResult` error when `!ok`.

### 2. Register the group (`tools.config.ts`)

Add an `atlas` entry describing the document kind and its verbs, action-dispatch
shape like `dataflow` (an `action` param plus per-verb params). Mark it `local`
so `server.ts` handles it in-process. Mirror `dataflow`'s config structure.

### 3. Dispatch in `server.ts`

Add an `if (name === 'atlas') { ... }` block (clone the `dataflow` block at
`:267-309+`), routing each `action` to the `atlas-tools.ts` helper. Add `atlas` to
the ListTools output if it isn't emitted by the generic `toolConfig` map. Append
the `.atlas.json` document kind and its verbs to the server `instructions` string
(`:149`).

### 4. Tests (`packages/mcp/` test suite)

Mock the storage fetch (GET/POST) and assert each verb loads, applies the right
core op, and writes the expected document. Include an `edge/bisect` test turning
`A→B` into `A→N→B`, and a `batch` test. (No live server needed — stub `fetch`.)

## Files to Modify

- `packages/mcp/src/atlas-tools.ts` — new.
- `packages/mcp/src/tools.config.ts` — `atlas` group.
- `packages/mcp/src/server.ts` — atlas dispatch block; ListTools; instructions.
- `packages/mcp/src/atlas-tools.test.ts` — new coverage (stubbed fetch).

## Verification

```bash
pnpm -C packages/mcp exec tsgo --noEmit
pnpm -C packages/mcp exec vitest run
just mcp
```

## Out of Scope

- A live end-to-end call against a running server + wired MCP (this session has no
  MCP connected; verify via unit tests with stubbed storage).
- The bisect UI (separate client task).
- Query/view tools for atlas (read-side projection) — a possible follow-up; this
  task is the author/edit path.

## Notes

- `just mcp` regenerates the MCP bundle (see justfile) — run it so the built server
  reflects the new group.
- Verb naming mirrors the graph MCP (`node/create`, `edge/connect`) for cross-tool
  consistency; `edge/bisect` is atlas-specific.

## Surface after this phase

- The MCP exposes an `atlas` tool group over `.atlas.json`: `list`, `create`,
  `read`, `node/create` (explicit id), `node/set`, `node/reparent`, `node/delete`,
  `edge/connect`, `edge/disconnect`, `edge/bisect`, and `batch` (in-process
  `applyAtlasBatch`), each a load→apply-core-op→write proxy over dumb storage.
- Server instructions describe the atlas document kind; `just mcp` rebuilds the bundle.
- Not built: live-call verification here, atlas query/view tools, bisect UI.
