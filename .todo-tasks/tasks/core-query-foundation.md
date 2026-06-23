# Core Query Foundation: GraphQuery type, evaluator, neighborhood, and MCP-consumable exports

## Motivation

The MCP needs to let an agent query subsets of a graph (filter nodes/edges, fetch a node's neighborhood) and project a graph through a view. Per the architecture decision, **the MCP is an intelligence layer equivalent to the browser client** — it fetches raw documents from the dumb storage server and computes locally by importing `@luminous/core`. The server stays storage-only.

Two things block that today:

1. **`GraphQuery` is undefined.** `packages/core/src/types.ts:170-172` declares `export type GraphQuery = unknown` with `// OPEN: ... PDR §15.3`, and `View.filter?: GraphQuery` (types.ts:154) already references it. The filter grammar must be defined **once in core** so both the MCP query tools and the client's `View.filter` reuse the same canonical type — this is the drift-prevention principle.

2. **Core is not consumable from the tsc-built MCP.** Core is consumed today only by the Vite-built client via `main: src/index.ts` (raw TS, no build step). Its `.` export re-exports solid-js/cactus chrome (`index.ts:2,17,18`). The MCP builds with `tsc` and runs `node dist/server.js`, so it needs to import core's **pure modules only** (graph, view, query, types — none of which touch solid) without dragging solid into its build.

This phase delivers the canonical query layer in core and makes it importable by the MCP. It writes **no MCP code** — that is Phase 2/3.

## Do NOT

- Do NOT touch `packages/server-next` — the server stays dumb storage. All query/projection logic lives in core (this phase) and the MCP (later phases).
- Do NOT write any MCP code or tool config — this phase is core-only.
- Do NOT change the existing `.` export of `@luminous/core` to point away from `src/index.ts` — the Vite client depends on it. ADD subpath exports alongside it; do not break the existing one.
- Do NOT pull solid-js or `@luminous/cactus` into the new query module. `query.ts` must import only from `./types.ts` and `./graph.ts` (type-only imports from types are fine — `RenderNode` is type-only and erases).
- Do NOT over-build the grammar with a textual DSL parser. `GraphQuery` is a **structured JSON object**, not a query string.

## Plan

### 1. Define `GraphQuery` in `packages/core/src/types.ts`

Replace `export type GraphQuery = unknown` (line 172) and its `// OPEN` comment with a concrete structured grammar. Richer operators, reused for both nodes and edges:

```ts
/** A predicate over a single prop value, addressed by dot-path into node/edge props. */
export type PropPredicate =
  | { op: 'eq'; value: unknown }
  | { op: 'ne'; value: unknown }
  | { op: 'exists' }
  | { op: 'absent' }
  | { op: 'in'; values: unknown[] }
  | { op: 'gt'; value: number }
  | { op: 'gte'; value: number }
  | { op: 'lt'; value: number }
  | { op: 'lte'; value: number }
  | { op: 'contains'; value: string }   // substring for strings; membership for arrays
  | { op: 'regex'; value: string };     // tested against String(value)

/** Tag constraints. `any` = at least one; `all` = every; `none` = excludes all. */
export interface TagMatch {
  any?: string[];
  all?: string[];
  none?: string[];
}

/**
 * Structured query over a graph's nodes or edges. A node/edge matches when ALL
 * present top-level constraints match. `from`/`to` apply only to edges (ignored
 * for node queries). Boolean composition nests via and/or/not.
 *
 * Resolves PDR §15.3 (the GraphQuery open question).
 */
export interface GraphQuery {
  /** Match kind exactly, or against a set (any-of). */
  kind?: KindId | KindId[];
  /** Tag constraints. */
  tags?: TagMatch;
  /**
   * Prop predicates by dot-path (e.g. "name", "meta.owner"). A bare scalar
   * value is shorthand for { op: 'eq', value }. All entries AND-combined.
   */
  props?: Record<string, PropPredicate | string | number | boolean | null>;
  /** Edge-only: source node id, exact or any-of. */
  from?: NodeId | NodeId[];
  /** Edge-only: target node id, exact or any-of. */
  to?: NodeId | NodeId[];
  /** All subqueries must match. */
  and?: GraphQuery[];
  /** At least one subquery must match. */
  or?: GraphQuery[];
  /** Subquery must NOT match. */
  not?: GraphQuery;
}
```

Keep `GraphQuery` exported (it already is via `export * from './types.ts'`).

### 2. Create `packages/core/src/query.ts`

Pure module. Imports only from `./types.ts` (types) and `./graph.ts` (for the `Graph` shape; no runtime needed beyond reading its maps/indices).

Export:

```ts
export function matchNode(node: Node, query: GraphQuery): boolean
export function matchEdge(edge: Edge, query: GraphQuery): boolean
export function queryNodes(graph: Graph, query: GraphQuery): Node[]
export function queryEdges(graph: Graph, query: GraphQuery): Edge[]
export function neighborhood(graph: Graph, id: NodeId, hops?: number): { nodes: Node[]; edges: Edge[] }
```

Semantics:
- **Prop path resolution**: a small `getByPath(obj, "a.b.c")` walking nested objects; missing path → `undefined`.
- **`exists`/`absent`** test path presence (`absent` = path resolves to `undefined`).
- **`contains`**: substring when the value is a string; `Array.includes` when it's an array; otherwise false.
- **`regex`**: `new RegExp(value).test(String(resolved))`; an invalid pattern → no match (do not throw).
- **`gt/gte/lt/lte`**: only when the resolved value is a number; otherwise no match.
- **bare scalar in `props`** → treated as `{ op: 'eq', value }`.
- **`kind` / `from` / `to`**: array → any-of; scalar → exact.
- **Composition**: top-level constraints AND together with `and[]`/`or[]`/`not`. `or` present → at least one must match. `not` present → its subquery must not match. An empty/`{}` query matches everything.
- **`queryNodes`/`queryEdges`** iterate `graph.nodes` / `graph.edges` values and return matches in insertion order.
- **`neighborhood(graph, id, hops=1)`**: BFS from `id` following BOTH `graph.outgoing` and `graph.incoming` (undirected reach), up to `hops` levels. Returns reached nodes (including the seed) and every edge traversed. `hops: 0` → just the seed node, no edges. Unknown `id` → `{ nodes: [], edges: [] }`.

### 3. Re-export `query.ts` from the core barrel

Add `export * from './query.ts';` to `packages/core/src/index.ts`.

### 4. Add pure-module subpath exports so the MCP can import core

In `packages/core/package.json`, extend `exports` so the MCP can import the pure modules without resolving the solid-laden barrel:

```jsonc
"exports": {
  ".": "./src/index.ts",
  "./types": "./src/types.ts",
  "./graph": "./src/graph.ts",
  "./view": "./src/view.ts",
  "./query": "./src/query.ts"
}
```

These four modules form a solid-free subgraph (`query`→`types`,`graph`; `graph`→`types`; `view`→`types`,`graph`; `types`→ type-only `render/types`). Verify by inspection that none of them imports solid-js or `@luminous/cactus` at runtime.

> NOTE on MCP build consumption: the actual mechanism for the tsc-built MCP to bundle these raw-TS subpaths (core build step vs MCP bundler vs project references) is decided and implemented in **Phase 2**, where the MCP is the thing being built. This phase only needs the subpath export map to exist and the modules to be solid-free. Do not change the MCP build here.

### 5. Tests

Add `packages/core/tests/query.test.ts` (match the existing `tests/` location used by `view.test.ts`). Cover:
- each `PropPredicate` op (eq, ne, exists, absent, in, gt/gte/lt/lte, contains on string and array, regex incl. invalid pattern → no match)
- dot-path resolution into nested props
- `tags` any/all/none
- `kind`/`from`/`to` scalar and array forms
- `and`/`or`/`not` composition and empty-query-matches-all
- `queryNodes`/`queryEdges` over a small `buildGraph(...)` fixture
- `neighborhood` at hops 0, 1, 2, undirected reach, unknown id

## Files to Modify

- `packages/core/src/types.ts` — replace `GraphQuery = unknown` with the structured grammar (+ `PropPredicate`, `TagMatch`).
- `packages/core/src/query.ts` — NEW pure module: matchers, queryNodes/queryEdges, neighborhood, getByPath.
- `packages/core/src/index.ts` — add `export * from './query.ts';`.
- `packages/core/package.json` — add `./graph`, `./view`, `./query` subpath exports.
- `packages/core/tests/query.test.ts` — NEW test suite.

## Verification

```bash
pnpm -C packages/core test
pnpm -C packages/core typecheck
```

## Out of Scope

- All MCP code, tool config, and the MCP build mechanism (Phase 2/3).
- Wiring `View.filter` into the client's view evaluation (the type is now defined; consuming it in the renderer is future work).
- `evaluateQuery` as a single unified entry — two typed functions (`queryNodes`/`queryEdges`) are clearer than one polymorphic one.

## Notes

- The grammar deliberately resolves PDR §15.3. If a PDR doc (doc02.11 or a §15 doc) explicitly tracks this open question, update that line to point at `GraphQuery` in `types.ts`. Do not invent new carta docs.
- `regex`/`contains` operate on `String(resolved)` / arrays — keep them total (never throw) so a bad agent-supplied query degrades to "no match," not a 500.

## Surface after this phase

- `@luminous/core` exports (via barrel and named): `GraphQuery`, `PropPredicate`, `TagMatch` types; `matchNode`, `matchEdge`, `queryNodes`, `queryEdges`, `neighborhood` functions.
- `queryNodes(graph, query): Node[]` and `queryEdges(graph, query): Edge[]` — pure, total, insertion-ordered.
- `neighborhood(graph, id, hops=1): { nodes: Node[]; edges: Edge[] }` — undirected BFS, seed included, hops:0 → seed only.
- `GraphQuery` is the structured JSON grammar documented above (kind / tags / props-with-PropPredicate / from / to / and / or / not). A bare scalar in `props` means `eq`. Empty query matches all.
- `package.json` subpath exports exist: `@luminous/core/graph`, `@luminous/core/view`, `@luminous/core/query`, `@luminous/core/types` — all solid-free.
- Existing `buildGraph(nodes, edges, pack?, info?)` (graph.ts) and `evaluateView(graph, view)` / `evaluateContainment(graph, view)` (view.ts/graph.ts) are unchanged and remain the canonical Document→Graph adapter and projector.
- `packages/server-next` is deliberately untouched and still pure storage.
- NOT done: the MCP build mechanism for consuming these raw-TS subpaths — Phase 2 owns that.
