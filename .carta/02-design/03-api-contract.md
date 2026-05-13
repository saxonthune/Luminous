---
title: API Contract
summary: HTTP + WebSocket API for @luminous/server — document listing, reading, mutation actions, diagnostics, and change notifications
tags: [api, http, server, contract]
deps: [doc02.02]
---

# API Contract

HTTP + WebSocket API for `@luminous/server` (`packages/server-next`). The server is a native Node.js HTTP server (no framework). It serves a directory of `.canvas.json` files, applies mutation actions, and broadcasts changes via WebSocket.

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
