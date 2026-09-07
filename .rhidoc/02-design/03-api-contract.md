---
title: API Contract
summary: HTTP + WebSocket API for @luminous/server — document listing, reading, mutation actions, diagnostics, and change notifications
tags: [api, http, server, contract]
deps: [doc02.02]
---

# API Contract

HTTP + WebSocket API for `@luminous/server` (`packages/server`). The server is a native Node.js HTTP server (no framework). It serves a directory of `.canvas.json` files, applies mutation actions, and broadcasts changes via WebSocket.

## Server Configuration

- **Port:** 4080 (configurable via `PORT` env var)
- **Root directory:** configurable via `--dir` CLI argument, defaults to cwd
- **CORS:** all origins, methods GET/POST/OPTIONS

## Read Endpoints

| Method | Path | Response |
|--------|------|----------|
| `GET` | `/api/health` | `{ status: "ok", commit: "<short-hash>" }` |
| `GET` | `/api/documents` | `{ documents: [{ path, name, lastModified }] }` |
| `GET` | `/api/document/:path` | Full `Document` object |

`GET /api/documents` recursively scans the root directory for `.canvas.json` files. `GET /api/document/:path` returns the complete document — schemas, structure, content, edges, and legend. Paths are URL-decoded and validated against traversal (`..` and leading `/` rejected).

## Mutation Endpoints

### Nylon actions

Nylon uses a shared action executor in the server and static demo. The other
action endpoints below describe the older Canvas API.

`GET /api/nylon/document/:path` returns `{ ok: true, snapshot }`. The snapshot
contains `document`, `revision`, `undo`, and `redo`. Each history entry contains
`actionId`, `label`, `origin`, and the target `document` for that undo or redo;
the last entry is the next undo or redo. These bounded target snapshots let
the client preview history changes without a server round trip.

`POST /api/nylon/action` accepts:

```json
{
  "path": "system.nylon.json",
  "actionId": "unique-request-id",
  "baseRevision": "revision-from-read",
  "origin": "api",
  "action": {
    "op": "layout.dag",
    "id": "parent",
    "direction": "LR",
    "context": { "collapsed": [], "covered": [] }
  }
}
```

The executor accepts Nylon batch operations, `batch`, `selection.move`,
`layout.dag`, `layout.space`, `container.expand`, `document.replace`, `doctor`,
`undo`, and `redo`. `dryRun: true` returns the calculated Document without
committing it or changing history. Origin is `ui`, `cli`, or `api`; it labels
history and is not an authentication claim.

Successful responses contain `{ ok: true, snapshot, changed }`. A duplicate
request also includes `replayed: true` and returns the current snapshot.
Failures contain `{ ok: false, error }`; stale revisions return HTTP 409 with
`conflict: true`. Other refused actions return HTTP 400. Retrying a request
preserves its action ID, revision, and payload. A different payload cannot
reuse an action ID.

Each canonical document path has one serialized history session. Only a
successful storage commit advances history. Reads and actions compare current
file content with the session's content; external edits clear both history
branches. Saves publish complete files by atomic rename and check for changed
content before publishing. File watching refreshes sessions and notifies
clients; it does not suppress Nylon external edits during an own-write window.

The client action controller retains confirmed state and pending Actions. It
applies Actions locally for immediate display, sends them sequentially against
confirmed revisions, and retains later previews as earlier Actions are
confirmed. Display revisions track the predicted Document so gestures can
detect intervening changes without treating an identical confirmation as a
change. A refusal or divergent result discards dependent previews and refreshes
authoritative state. The static demo uses the same controller with a local adapter.

Nylon changes do not use `POST /api/document/write`; whole-document imports
use `document.replace`. Server restart discards session history. Static demos
use browser memory with the same executor and history rules. See doc01.12.04
for user-visible requirements.

Nylon notifications have `{ event: "changed", path, revision, actionId }` when
the action ID is known, and omit the action ID for filesystem changes. Clients
refresh after reconnecting and reject outdated asynchronous loads.

All mutations use `POST` with a JSON body containing `path` (the canvas file) and action-specific params. Response envelope: `{ ok: true, id?: string }` on success, `{ ok: false, error: string }` on failure.

### Single action

`POST /api/{action}` — execute one action.

**Node actions:**

| Action | Params | Returns |
|--------|--------|---------|
| `node/create` | `schemaName`, `geometry`, `order`, `parent?`, `content?`, `id?` | `{ ok, id }` |
| `node/setContent` | `id`, `fields` | `{ ok }` |
| `node/setParent` | `id`, `parent?`, `order` | `{ ok }` |
| `node/setOrder` | `id`, `order` | `{ ok }` |
| `node/setGeometry` | `id`, `geometry: { x, y, w, h }` | `{ ok }` |
| `node/delete` | `id` | `{ ok }` |

`node/delete` re-parents orphaned children to null and removes connected edges.

**Edge actions:**

| Action | Params | Returns |
|--------|--------|---------|
| `edge/connect` | `fromId`, `toId`, `label?`, `schemaName?`, `id?` | `{ ok, id }` |
| `edge/disconnect` | `id` | `{ ok }` |
| `edge/relabel` | `id`, `label?` | `{ ok }` |
| `edge/setRouting` | `id`, `routing: { exitSide, enterSide }` | `{ ok }` |
| `edge/clearRouting` | `id` | `{ ok }` |

`exitSide`/`enterSide` values: `top`, `bottom`, `left`, `right`.

**Schema actions:**

| Action | Params | Returns |
|--------|--------|---------|
| `schema/define` | `schema` (NodeSchema or EdgeSchema object) | `{ ok }` |
| `schema/delete` | `name` | `{ ok }` |

### Batch

`POST /api/action/batch` — execute an ordered array of actions atomically.

```json
{
  "path": "canvas.canvas.json",
  "actions": [
    { "action": "node/create", "params": { "schemaName": "note", "geometry": { "x": 0, "y": 0, "w": 200, "h": 100 }, "order": "a0" }, "ref": "a" },
    { "action": "node/create", "params": { "schemaName": "note", "geometry": { "x": 300, "y": 0, "w": 200, "h": 100 }, "order": "a1" }, "ref": "b" },
    { "action": "edge/connect", "params": { "fromId": "$ref:a", "toId": "$ref:b", "label": "depends on" } }
  ]
}
```

- `ref` — optional name to register the action's returned `id`
- `$ref:<name>` — in param string values, resolved to a previously registered ID
- **Fail-fast:** processing stops at the first failed action
- **No rollback:** successfully applied actions before a failure are persisted
- **Partial save:** the document is only written when all actions succeed

## Diagnostic Endpoints

All diagnostic endpoints are read-only GET requests (except `query` which is POST for complex filters).

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/diag/roots/:path` | Root-level nodes grouped by schema — counts, bounding boxes |
| `GET` | `/api/diag/outliers/:path` | Geometry anomalies — oversized, undersized, overflow nodes (top 50) |
| `GET` | `/api/diag/bbox/:path/:id` | Bounding box of a node and its descendants, with health assessment |
| `GET` | `/api/diag/subtree/:path/:id` | Full subtree structure from a node (max 500 nodes) |
| `GET` | `/api/diag/outline/:path[/:id]` | Hierarchical outline/tree view — full document or subtree (max 500 nodes) |
| `GET` | `/api/diag/summary/:path` | Quick stats — node/edge counts, max depth, schema distribution, bounding box |
| `POST` | `/api/diag/query` | Complex node filtering + field projection |

### Query

```json
{
  "path": "canvas.canvas.json",
  "filter": { "type": "component", "root": true },
  "fields": ["title", "schemaName", "geometry"]
}
```

Filter fields: `type` (schema name), `parent` (ID or null for roots), `ids` (array), `root` (boolean). Selectable fields: `title`, `schemaName`, `parent`, `geometry`. Max 500 results.

## Change Notifications

| Protocol | Path | Purpose |
|----------|------|---------|
| `WS` | `/ws/watch` | Subscribe to document changes |

Messages from server: `{ event: "changed", path }` when the backing file changes on disk (external edit, git pull, another client's save).

## Storage

- **In-memory cache** with debounced auto-save (2-second delay after first mutation)
- **File format:** v2 `.canvas.json` — four flat hashtables (schemas, structure, content, edges) plus optional legend
- **Backwards compatibility:** auto-injects `kind: 'node'` on load for v1 schemas
- **File watching:** external file changes broadcast via WebSocket after 3-second debounce
- **Graceful shutdown:** flushes all dirty documents on SIGINT/SIGTERM
