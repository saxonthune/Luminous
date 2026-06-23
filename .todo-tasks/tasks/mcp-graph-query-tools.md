# MCP Graph Query Tools: get_node, list_nodes, list_edges, neighborhood

## Motivation

Agents can read a whole canvas (`canvas read`) but cannot query a subset of it. This phase adds the **raw-graph query lens**: a `query` MCP tool that lets an agent fetch a single node, filter nodes/edges with the `GraphQuery` grammar, and pull a node's neighborhood — without loading the entire graph into context.

Per the architecture decision, **the MCP is the intelligence layer (client-equivalent)**: it fetches the raw document from the dumb storage server over the existing HTTP API, builds the indexed graph with `@luminous/core`'s `buildGraph`, and evaluates the query locally with the core functions defined in the predecessor phase. `server-next` is not touched.

## Predecessor surface (Phase 1 — `core-query-foundation`)

Triage and implement against this declared surface; do not assume anything beyond it:

- `@luminous/core` exports: `GraphQuery`, `PropPredicate`, `TagMatch` types; `queryNodes(graph, query): Node[]`, `queryEdges(graph, query): Edge[]`, `neighborhood(graph, id, hops?): { nodes, edges }`, `matchNode`, `matchEdge`.
- `buildGraph(nodes, edges, pack?, info?): Graph` (existing) turns Document arrays into the indexed `Graph`.
- Subpath exports exist and are solid-free: `@luminous/core/graph`, `@luminous/core/query`, `@luminous/core/view`, `@luminous/core/types`.
- `GraphQuery` is a structured JSON object (kind / tags / props-with-PropPredicate / from / to / and / or / not); bare scalar in `props` = `eq`; empty query matches all.

## Do NOT

- Do NOT touch `packages/server-next`. The MCP fetches via the existing `GET /api/document/:path`; no new server endpoints.
- Do NOT reimplement filtering or graph indexing in the MCP — import `buildGraph` and `queryNodes`/`queryEdges`/`neighborhood` from `@luminous/core`. Reimplementing them is the exact drift this architecture avoids.
- Do NOT import from `@luminous/core` (the barrel `.`) — it re-exports solid-js/cactus. Import only from the solid-free subpaths (`@luminous/core/graph`, `/query`, `/types`).
- Do NOT add view/projection tools here — that is Phase 3.
- Do NOT fold `getNode` into `listNodes` — `getNode` is its own action (explicit fetch-by-id).

## Plan

### 1. Solve MCP→core build consumption (the packaging obstacle)

The MCP builds via `tsc` (`packages/mcp/package.json` `build: "rimraf dist && tsc"`) and runs `node dist/server.js`. It must now import core's raw-TS pure modules and run under node. Choose and implement the lowest-friction mechanism:

- **Recommended: switch the MCP build to a bundler (`tsup`/esbuild).** It inlines the imported core TS into `dist/server.js`, tree-shakes unused code (solid never gets pulled because the subpaths don't reference it), and removes cross-package tsc-emit pain. Update `build` script and keep `dev` on `tsx` (already works with raw TS). Keep `typecheck` on `tsgo`.
- Alternatives if the bundler is undesirable: give `@luminous/core` a real `tsc` build emitting `dist` + types and point the new subpath exports at the emitted JS; or use TS project references with `composite`. Only do this if the bundler path fails.

Add `"@luminous/core": "workspace:*"` to `packages/mcp/package.json` dependencies. Run the workspace install so the symlink exists.

Whatever mechanism is chosen, the gate is: `pnpm -C packages/mcp build` succeeds and the bundled output contains no solid-js.

### 2. Create `packages/mcp/src/query-tools.ts`

Follows the `pack-describe.ts` pattern (fetch raw bytes from the storage server, compute locally). Export functions used by the server handler:

```ts
import { buildGraph } from '@luminous/core/graph'
import { queryNodes, queryEdges, neighborhood } from '@luminous/core/query'
import type { GraphQuery } from '@luminous/core/types'

async function loadGraph(serverUrl: string, path: string): Promise<Graph>  // GET /api/document/:path → buildGraph(doc.nodes, doc.edges, doc.pack)
export async function getNode(serverUrl, path, id): Promise<NodeSummary>            // throws if not found
export async function listNodes(serverUrl, path, filter?: GraphQuery): Promise<{ nodes: NodeSummary[] }>
export async function listEdges(serverUrl, path, filter?: GraphQuery): Promise<{ edges: EdgeSummary[] }>
export async function neighborhoodOf(serverUrl, path, id, hops?: number): Promise<{ nodes: NodeSummary[]; edges: EdgeSummary[] }>
```

- `NodeSummary` = `{ id, kind, props, tags }`; `EdgeSummary` = `{ id, kind, from, to, props, tags }`. (Return full nodes/edges — they are already compact; no need to trim props in v1.)
- `loadGraph` reuses the same fetch shape as `describePackForCanvas` in `pack-describe.ts`. Reuse a small fetch helper if one is natural; do not over-abstract.
- An empty/omitted `filter` returns all nodes/edges (consistent with empty-query-matches-all).
- `buildGraph` throws on a malformed graph (dup ids, dangling edges). Catch and surface a clean error string rather than crashing the tool call.

### 3. Register the `query` tool

Follow the established split (see how `pack` is handled in `server.ts`): the tool is declared in `toolConfig` for **schema/registration**, and **intercepted** in the `CallToolRequestSchema` handler for **execution** (because it computes locally instead of proxying to a server endpoint).

In `packages/mcp/src/tools.config.ts`, add a `query` group with actions `getNode`, `listNodes`, `listEdges`, `neighborhood`. Their `method`/`path` fields are vestigial for an intercepted tool — set them to a clearly-unused placeholder (e.g. `method: 'GET', path: ''`) and rely on interception, OR add an optional `local?: true` marker to `ActionConfig`/`ToolGroupConfig` and skip such groups in the generic proxy registration. Prefer the marker if it reads cleanly; otherwise the placeholder + interception (matching how `pack` already works) is acceptable.

- `path` param: reuse the shared `pathParam`.
- `id` param (getNode, neighborhood): described string.
- `hops?` param (neighborhood): described number, default 1.
- `filter?` param (listNodes, listEdges): a described **object**. A fully-recursive JSON Schema for `GraphQuery` is out of scope; describe it as a freeform object whose description documents the grammar compactly (kind / tags{any,all,none} / props{path: value | {op,...}} / from / to / and / or / not; bare value = eq; omit to match all). Include 1–2 inline examples in the description.

In `server.ts`, add a `name === 'query'` interception branch (mirroring the `pack` branch) that dispatches on `action` to the `query-tools.ts` functions, returning `{ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }` and the same error-to-`isError` handling used elsewhere.

### 4. Update the MCP instructions blurb

In `server.ts`, extend the `instructions` string and the "Tool groups:" line to mention `query` (getNode/listNodes/listEdges/neighborhood) and add a line to the recommended workflow: query to orient before mutating.

### 5. Tests

Add `packages/mcp/src/query-tools.test.ts` (vitest, matching the package's `test: "vitest run"`). Mock `fetch` to return a small fixed document, and assert:
- `getNode` returns the right node and throws/error-shapes on a missing id
- `listNodes`/`listEdges` honor a `GraphQuery` filter (at least kind + one prop predicate + a tags match) and return all when filter omitted
- `neighborhoodOf` returns expected nodes/edges at hops 1
- a malformed graph (dangling edge) surfaces a clean error, not a throw through the tool boundary

## Files to Modify

- `packages/mcp/package.json` — add `@luminous/core` dep; switch `build` to the chosen bundler (recommended `tsup`); add the bundler devDep.
- `packages/mcp/src/query-tools.ts` — NEW: loadGraph + getNode/listNodes/listEdges/neighborhoodOf.
- `packages/mcp/src/tools.config.ts` — add the `query` tool group (+ optional `local?` marker on the config types).
- `packages/mcp/src/server.ts` — `query` interception branch; instructions blurb.
- `packages/mcp/src/query-tools.test.ts` — NEW tests.

## Verification

```bash
pnpm -C packages/mcp test
pnpm -C packages/mcp typecheck
pnpm -C packages/mcp build
```

## Out of Scope

- View/projection tools (`list_views`, `project`) — Phase 3.
- Any change to `server-next` or to core's query functions (consume them as-is).
- Pagination / result caps on large graphs — note it if you add a silent cap; otherwise return all matches for now.

## Notes

- Reuse the fetch-from-server pattern already in `pack-describe.ts`; the storage server is at `process.env.LUMINOUS_SERVER_URL` (see `server.ts`).
- The `pack` handler in `server.ts` is the reference for "declared in toolConfig, intercepted in CallTool." Mirror it.
- If `tsup` is added, ensure `dist/server.js` keeps its shebang/bin behavior (`bin: luminous-mcp`). esbuild can preserve/﻿add the node shebang via banner if needed.

## Surface after this phase

- MCP exposes a `query` tool with actions: `getNode {path, id}`, `listNodes {path, filter?}`, `listEdges {path, filter?}`, `neighborhood {path, id, hops?}`.
- Returns: `getNode` → `{ id, kind, props, tags }`; `listNodes` → `{ nodes: NodeSummary[] }`; `listEdges` → `{ edges: EdgeSummary[] }`; `neighborhood` → `{ nodes, edges }`.
- `filter` accepts the `GraphQuery` JSON grammar; omitted filter returns all.
- `packages/mcp/src/query-tools.ts` exports `getNode`, `listNodes`, `listEdges`, `neighborhoodOf`, and an internal `loadGraph(serverUrl, path)` (Document→`buildGraph`).
- The MCP build now bundles `@luminous/core` pure subpaths (mechanism chosen in step 1); `pnpm -C packages/mcp build` produces a runnable, solid-free `dist/server.js`. Phase 3 can rely on importing further core subpaths (e.g. `@luminous/core/view`) the same way.
- The "declared-in-toolConfig + intercepted-in-CallTool" pattern (with the optional `local?` marker if added) is established for locally-computed tools; Phase 3's `view` tool follows it.
- `packages/server-next` remains untouched (pure storage).
