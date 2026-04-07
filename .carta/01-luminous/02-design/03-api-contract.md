---
title: API Contract
status: draft
summary: Action-based HTTP API — concept actions as endpoints, not REST resources. POST /api/{concept}/{action} pattern.
tags: [api, http, actions, server, contract]
deps: [doc01.02.02]
---

# API Contract

Action-based HTTP API for `@luminous/server`. Endpoints map 1:1 to concept actions (doc01.02.02) rather than REST resources. The server is dumb storage — it applies actions to document state and persists. Domain logic lives in the client.

## Design Principles

- **Actions, not resources.** `POST /api/note/create` instead of `POST /api/notes`. Concepts have actions; the API exposes them directly.
- **Concept-namespaced.** Pattern: `POST /api/{concept}/{action}`. Actions that synchronize two concepts (nesting, formalization) are top-level.
- **Same names as MCP tools.** The HTTP API and future MCP operations share vocabulary. Same action, different transport.
- **Event-shaped.** Every mutation is an action with params. This composes forward into undo, event sourcing, and CRDT sync when needed.

## Endpoints

### Workspace

| Method | Path | Response |
|--------|------|----------|
| `GET` | `/api/documents` | `{ documents: [{ path, name, lastModified }] }` |
| `GET` | `/api/document/:path` | `{ notes, edges, positions }` |
| `GET` | `/api/health` | `{ status: "ok" }` |

`GET /api/documents` scans the server's root directory for `*.canvas.json` files. Path is relative to root, name is filename without extension, lastModified is mtime from filesystem.

### Note

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/api/note/create` | `{ title, body? }` | `{ ok, id }` |
| `POST` | `/api/note/update` | `{ id, title?, body? }` | `{ ok }` |
| `POST` | `/api/note/delete` | `{ id }` | `{ ok }` |

### Edge

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/api/edge/connect` | `{ fromId, toId, label? }` | `{ ok, id }` |
| `POST` | `/api/edge/disconnect` | `{ id }` | `{ ok }` |
| `POST` | `/api/edge/relabel` | `{ id, label }` | `{ ok }` |

### Nesting

Top-level — synchronizes Note and Canvas concepts.

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/api/nest` | `{ parentId, childId }` | `{ ok }` |
| `POST` | `/api/unnest` | `{ childId }` | `{ ok }` |

### Canvas (position persistence)

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/api/node/move` | `{ id, x, y }` | `{ ok }` |
| `POST` | `/api/node/resize` | `{ id, w, h }` | `{ ok }` |

### Batch

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/api/action/batch` | `{ path, actions[] }` | `{ ok, results[] }` |

Submit an ordered array of actions in a single request. Actions execute in sequence; each can reference IDs produced by earlier actions using `$ref` syntax.

**Request body:**

```json
{
  "path": "canvas.canvas.json",
  "actions": [
    { "action": "note/create", "params": { "title": "A" }, "ref": "a" },
    { "action": "note/create", "params": { "title": "B" }, "ref": "b" },
    { "action": "edge/connect", "params": { "fromId": "$ref:a", "toId": "$ref:b", "label": "depends on" } }
  ]
}
```

- `path` — relative path to the canvas file (required, no traversal)
- `actions` — non-empty array of action descriptors (required)
  - `action` — action name matching the existing single-action API
  - `params` — action parameters; string values matching `$ref:<name>` are resolved to IDs from earlier actions
  - `ref` — optional name to register the action's returned `id` for use in subsequent `$ref` values

**Response (all succeeded):** HTTP 200

```json
{ "ok": true, "results": [{ "ok": true, "id": "abc" }, { "ok": true, "id": "def" }, { "ok": true, "id": "ghi" }] }
```

**Response (failure):** HTTP 400

```json
{ "ok": false, "results": [{ "ok": true, "id": "abc" }, { "ok": false, "error": "note not found" }] }
```

**Error semantics:**
- **Fail-fast:** processing stops at the first failed action. Results contains only the actions processed up to and including the failure.
- **No rollback:** successfully applied actions before the failure are persisted. The batch is not atomic.
- **Unresolved ref:** if a `$ref:<name>` value cannot be resolved (the named ref was never set), the current action fails with `{ ok: false, error: "unresolved ref: <name>" }` and processing stops.
- **Partial save:** the document is only marked dirty and saved when all actions succeed. If any action fails, no write occurs.

**`$ref` resolution rules:**
- Only top-level string values in `params` are scanned — nested objects are not traversed.
- A `ref` is registered only when the action returns `{ ok: true, id }`. Actions without an `id` in their result do not produce a ref even if `ref` is declared.

### Change notifications

| Protocol | Path | Purpose |
|----------|------|---------|
| `WS` | `/ws/watch` | Subscribe to document changes |

Messages from server: `{ event: "changed", path }` when the backing file changes on disk (git pull, external edit, another client's save).

## Response envelope

All mutations return:

```json
{ "ok": true, "id": "abc123" }
```

or

```json
{ "ok": false, "error": "note not found" }
```

Reads return the data directly (no envelope).

## Future endpoints

These compose onto the existing contract when Structure concepts (doc01.02.02) are implemented. No existing endpoints change.

```
POST /api/schema/define         { name, fields }                    → { ok }
POST /api/schema/edit           { name, fields }                    → { ok }
POST /api/schema/delete         { name }                            → { ok }
POST /api/formalize             { noteIds[], schemaName, mapping? } → { ok }
POST /api/informalize           { nodeId }                          → { ok }
POST /api/schema-pair/describe  { from, to, description }           → { ok }
POST /api/schema-pair/remove    { from, to }                        → { ok }
```

`formalize` and `informalize` are top-level because they synchronize Note and Schema. `schema-pair/describe` synchronizes Edge and Schema.
