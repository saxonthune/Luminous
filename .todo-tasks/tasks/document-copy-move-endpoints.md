# Server endpoints: document copy + move + delete

## Motivation

The dataflow designer file picker needs to duplicate, rename, and delete files,
but the server exposes no file-manipulation operation beyond list, read, create
(graph only), and whole-document write (dataflow only). There is no copy, move,
or delete on either side. We add three primitives — **copy**, **move**, and
**delete** — that back the picker's Duplicate, Rename, and Delete actions. Rename
is a move where the parent directory is unchanged; the client UI labels copy/move
as "Duplicate" and "Rename", but the server stays at the primitive level so a
cross-folder move is the same call.

## Do NOT

- Do NOT add a `rename` or `duplicate` endpoint. The server primitives are
  `copy` and `move`. Naming those after UI verbs would leak UI concerns into the
  API and force a redundant endpoint when a real cross-folder move is needed.
- Do NOT allow copy/move/delete of non-dataflow files. Restrict every path to
  `isDataflowPath`, exactly as `POST /api/document/write` does (index.ts:192).
- Do NOT silently overwrite an existing target. If a copy/move `to` already
  exists, fail with `{ ok: false, error: "target exists" }`.
- Do NOT touch the graph action pipeline (`/api/action/*`, `applyAction`,
  `applyBatch`) or the debounced `scheduleSave` machinery — dataflow files are
  written whole and immediately via `writeRawDocument`.

## Plan

### 1. Add `copyDocument` and `moveDocument` to `packages/server/src/store.ts`

Both resolve paths through the existing `resolveDocPath` helper (store.ts:38) and
return the same result shape as `createDocument`:
`{ ok: true; path: string } | { ok: false; error: string }`.

Import `copyFile`, `rename`, and `rm` from `node:fs/promises` (extend the
existing import at store.ts:2). Reuse the `access`-based existence check pattern
from `createDocument` (store.ts:119-124).

`copyDocument(from, to)`:
- Resolve `fromAbs` and `toAbs` via `resolveDocPath`.
- Existence check on `toAbs` — if it exists, return `{ ok: false, error: "target exists" }`.
- `await copyFile(fromAbs, toAbs)`. If the source is missing, `copyFile` throws
  ENOENT — catch and return `{ ok: false, error: "source not found" }`.
- After a successful copy, set `recentWrites.set(toAbs, Date.now())` so the
  watcher suppresses the echo (mirror `writeRawDocument`, store.ts:223).
- Return `{ ok: true, path: to }`.

`moveDocument(from, to)`:
- Resolve `fromAbs` and `toAbs`.
- Existence check on `toAbs` — if it exists, return `{ ok: false, error: "target exists" }`.
- `await rename(fromAbs, toAbs)`. Catch ENOENT on the source → `{ ok: false, error: "source not found" }`.
- Invalidate all in-memory state for the source path so a stale entry can't be
  served after the file has moved: `cache.delete(from)`, `rawCache.delete(from)`,
  `dirty.delete(from)`, and if a timer exists in `timers` for `from`, clear it
  and delete it.
- Set `recentWrites.set(fromAbs, Date.now())` and `recentWrites.set(toAbs, Date.now())`
  so the watcher suppresses both echoes.
- Return `{ ok: true, path: to }`.

`deleteDocument(path)`:
- Resolve `abs` via `resolveDocPath`.
- `await rm(abs)`. If the file is missing, `rm` throws ENOENT — catch and return
  `{ ok: false, error: "not found" }`.
- Invalidate all in-memory state for the path (same as move's source
  invalidation): `cache.delete(path)`, `rawCache.delete(path)`,
  `dirty.delete(path)`, and clear + delete any `timers` entry for `path`.
- Set `recentWrites.set(abs, Date.now())` so the watcher suppresses the echo.
- Return `{ ok: true, path }`.

All three functions are dataflow-agnostic at the store layer (they operate on raw
files); the dataflow restriction is enforced at the route layer in step 3, the
same division as `writeRawDocument` (no restriction in the store) vs. the write
route (restriction in `index.ts`).

### 2. Export the three functions and import them in `index.ts`

Add `copyDocument`, `moveDocument`, and `deleteDocument` to the store import
block at `packages/server/src/index.ts:7-19`.

### 3. Add two POST route branches in `packages/server/src/index.ts`

Place both immediately after the `POST /api/document/write` branch (which ends
at index.ts:204), before `POST /api/graph/create`. Each mirrors the `write`
branch's body-parse + validation structure (index.ts:179-204):

`POST /api/document/copy` — body `{ from, to }`:
- Parse body; on JSON error return 400 `{ error: "invalid JSON" }`.
- For each of `from` and `to`: if missing or `hasTraversal`, return 400
  `{ ok: false, error: "invalid path" }`.
- If either is not `isDataflowPath`, return 400
  `{ ok: false, error: "only .dataflow.json paths may be copied here" }`.
- `const result = await copyDocument(from, to)`.
- On success, `broadcast(to)`.
- `sendJson(res, result.ok ? 200 : 400, result)`.

`POST /api/document/move` — body `{ from, to }`:
- Same parsing and validation as copy (swap the error text to "moved").
- `const result = await moveDocument(from, to)`.
- On success, `broadcast(from)` AND `broadcast(to)` — a client watching the old
  path must learn it is gone, and any list view must pick up the new path.
- `sendJson(res, result.ok ? 200 : 400, result)`.

`POST /api/document/delete` — body `{ path }`:
- Parse body; on JSON error return 400 `{ error: "invalid JSON" }`.
- If `path` is missing or `hasTraversal`, return 400
  `{ ok: false, error: "invalid path" }`.
- If `path` is not `isDataflowPath`, return 400
  `{ ok: false, error: "only .dataflow.json paths may be deleted here" }`.
- `const result = await deleteDocument(path)`.
- On success, `broadcast(path)`.
- `sendJson(res, result.ok ? 200 : 400, result)`.

`Access-Control-Allow-Methods` already lists POST (index.ts:101) — no CORS
change needed.

## Files to Modify

- `packages/server/src/store.ts` — add `copyDocument`, `moveDocument`,
  `deleteDocument`; extend the `node:fs/promises` import with `copyFile`,
  `rename`, `rm`.
- `packages/server/src/index.ts` — import the three functions; add
  `POST /api/document/copy`, `POST /api/document/move`, and
  `POST /api/document/delete` route branches after the write branch.
- `packages/server/src/store.test.ts` (or the nearest existing server test file —
  check `packages/server/src/` for `*.test.ts`; create one if none exists) — unit
  tests: successful copy creates the target and leaves the source; successful move
  creates the target and removes the source; successful delete removes the file;
  copy/move target-exists fails without clobbering; source-not-found (copy/move)
  and not-found (delete) fail cleanly.

## Verification

```bash
just typecheck
just test
```

If the server has no test runner wired, verify manually instead:

```bash
# from a workspace with a *.dataflow.json file, start the server, then:
curl -sS -X POST localhost:4080/api/document/copy -H 'Content-Type: application/json' -d '{"from":"root/example.dataflow.json","to":"root/example-copy.dataflow.json"}'
curl -sS -X POST localhost:4080/api/document/move -H 'Content-Type: application/json' -d '{"from":"root/example-copy.dataflow.json","to":"root/renamed.dataflow.json"}'
curl -sS -X POST localhost:4080/api/document/delete -H 'Content-Type: application/json' -d '{"path":"root/renamed.dataflow.json"}'
# repeat the copy to confirm target-exists returns {ok:false,error:"target exists"}
```

## Out of Scope

- All client-side and UI work — the dataflow picker Duplicate/Rename/Delete
  controls are the paired task `dataflow-picker-duplicate-rename-ui`.
- Extending copy/move/delete to `.graph.json` or `.pack.json` files.

## Notes

- Reference to mirror for the route shape: `POST /api/document/write`,
  `packages/server/src/index.ts:176-204`.
- Reference for the store-layer existence check: `createDocument`,
  store.ts:113-129.
- Reference for watcher-echo suppression via `recentWrites`: `writeRawDocument`,
  store.ts:220-225, and the watcher's 3s window check at store.ts:249-252.
- Reviewer watch item: the move path's cache invalidation. If `cache.delete` /
  `rawCache.delete` on the source is missed, a later read of the old path could
  serve a stale cached document instead of a 404/reload.

## Surface after this phase

- `POST /api/document/copy` — request body `{ from: string, to: string }` (both
  workspace-relative, `.dataflow.json` only); response
  `{ ok: true, path: string }` on success (HTTP 200) or
  `{ ok: false, error: string }` on failure (HTTP 400). Errors:
  `"invalid path"`, `"only .dataflow.json paths may be copied here"`,
  `"target exists"`, `"source not found"`, `"invalid JSON"`. On success the
  server broadcasts the `to` path over `/ws/watch`.
- `POST /api/document/move` — same request/response contract; error text uses
  "moved" wording. On success the server broadcasts BOTH the `from` and `to`
  paths over `/ws/watch`.
- `POST /api/document/delete` — request body `{ path: string }` (workspace-relative,
  `.dataflow.json` only); response `{ ok: true, path: string }` (HTTP 200) or
  `{ ok: false, error: string }` (HTTP 400). Errors: `"invalid path"`,
  `"only .dataflow.json paths may be deleted here"`, `"not found"`,
  `"invalid JSON"`. On success the server broadcasts the deleted `path` over
  `/ws/watch`.
- `copyDocument(from, to)`, `moveDocument(from, to)`, and `deleteDocument(path)`
  exported from `packages/server/src/store.ts`, each returning
  `{ ok: true; path: string } | { ok: false; error: string }`.
- Negative space: copy/move/delete reject non-dataflow paths; the graph action
  pipeline and `POST /api/document/write` are unchanged.
