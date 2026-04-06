---
title: API Contract
status: draft
summary: Action-based HTTP API — concept actions as endpoints, not REST resources. POST /api/{concept}/{action} pattern.
tags: [api, http, actions, server, contract]
deps: [doc01.04]
---

# API Contract

Action-based HTTP API for `@luminous/server`. Endpoints map 1:1 to concept actions (doc01.04) rather than REST resources. The server is dumb storage — it applies actions to document state and persists. Domain logic lives in the client.

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

These compose onto the existing contract when Structure concepts (doc01.04) are implemented. No existing endpoints change.

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
