# Serve dataflow documents

## Motivation

The server lists and watches only `*.graph.json` files, and its document read
path enforces the v3 graph shape. The Dataflow Designer (doc02.21, doc02.23)
needs the server to also list, serve, watch, and accept writes for
`*.dataflow.json` files — while staying dumb storage (no domain validation).
Phase 2 of the dataflow-designer chain.

## Do NOT

- Do NOT import `@luminous/core` into the server — it stays schema-agnostic.
- Do NOT validate dataflow document content on the server (beyond
  well-formed JSON).
- Do NOT change the behavior of any existing graph endpoint
  (`/api/graph/create`, `/api/action/*`, `/api/document/:path` for
  `.graph.json`, `/api/pack/:path`).
- Do NOT touch `packages/client`, `packages/mcp`, or `packages/core`.
- Do NOT allow the new write endpoint to write `.graph.json` files — graph
  mutations keep their single write path through actions.

## Plan

### 1. Listing — `packages/server/src/workspace.ts`

`walk()` (the `.endsWith(".graph.json")` check around line 40) also collects
`.dataflow.json`. `DocumentMeta.name` strips whichever of the two suffixes the
file has. Everything else about `scanDocuments` stays the same — dataflow
entries appear in `GET /api/documents` alongside graph entries, distinguished
by their `path` suffix (no new meta field).

### 2. Watching — `packages/server/src/store.ts`

`watchDocuments()` (the suffix filter around line 207) accepts both suffixes,
so external changes to a `.dataflow.json` broadcast the same
`{ event: "changed", path }` on `/ws/watch`.

### 3. Reading

`GET /api/document/:path` for a path ending `.dataflow.json` returns the raw
parsed JSON without the v3 gate (`loadDocument` currently returns an empty doc
when `version !== 3`). Add a raw-document path in `store.ts` (e.g.
`getRawDocument(docPath)`) used when the path has the dataflow suffix; cache
it like graph docs. `applyAction`/`applyBatch` on a `.dataflow.json` path must
fail with a clear error (400), not corrupt the file.

### 4. Writing — new endpoint

`POST /api/document/write` with body `{ path, content }` where `content` is
the document object (JSON). Only paths ending `.dataflow.json` are accepted
(400 otherwise). Behavior: same path namespacing/traversal rejection as other
endpoints (`hasTraversal`), write through the store so `recentWrites` is
updated (the watcher must not echo the server's own write), update the cache,
persist to disk (2-space indent + trailing newline), and `broadcast(path)` so
WS clients reload. Creating a new file at a non-existent path under a valid
root is allowed — that is how `dataflow create` works.

### 5. Tests — `packages/server`

Match the existing server test style (`just test-server` passes today; find
the test files and follow them). Cover: listing includes a `.dataflow.json`
fixture with the suffix-stripped name; `GET /api/document` round-trips raw
dataflow JSON; `POST /api/document/write` creates and updates a file and
rejects `.graph.json` paths and traversal paths; graph actions on a dataflow
path fail cleanly; existing graph tests still pass.

## Files to Modify

- `packages/server/src/workspace.ts` — listing suffixes, name stripping
- `packages/server/src/store.ts` — watch filter, raw read, write-through
- `packages/server/src/index.ts` — `/api/document/write` route, dataflow-path
  guards
- server test file(s) — new coverage above

## Verification

```bash
just test-server
just build
just lint
```

## Out of Scope

- MCP tools (phase 3) and client (phase 4).
- Any generic "document type registry" — two hardcoded suffixes are fine at
  this scale.

## Notes

- Between this phase and phase 4, dataflow files would appear in the Canvas
  app's picker (the client filters nothing yet). No tracked `.dataflow.json`
  files exist yet, so nothing user-visible changes; phase 4 adds the client
  filter before phase 5 commits example files.

## Surface after this phase

- `GET /api/documents` lists `*.dataflow.json` files as `DocumentMeta` with
  the suffix stripped from `name`.
- `GET /api/document/:path` returns raw dataflow JSON for dataflow paths;
  graph paths behave exactly as before.
- `POST /api/document/write` `{ path, content }` writes a whole dataflow
  document, creates files under valid roots, rejects non-dataflow paths, and
  broadcasts `{ event: "changed", path }` on `/ws/watch` after a write.
- The file watcher fires the same broadcast for external edits to
  `.dataflow.json` files, without echoing server-initiated writes.
- Graph action endpoints reject dataflow paths with a 4xx error.
- Negative space: the server still does not import core and does not validate
  dataflow content; all `.graph.json` behavior is unchanged.
