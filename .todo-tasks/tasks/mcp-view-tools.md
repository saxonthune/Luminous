# MCP View Tools: list_views and project

## Motivation

The raw-graph lens (Phase 2) tells an agent what *exists*. This phase adds the **view/scene lens**: what the *user sees*. An agent needs to know which views a canvas defines and what each one renders — which nodes are visible vs latent vs hidden, how they nest, which edges are drawn as arrows vs collapsed into chips.

`project` is exactly `evaluateView(graph, view)` — the same pure function the browser renders from (`PgCanvasView.tsx` calls it). So the MCP, as the client-equivalent intelligence layer, fetches the raw document + pack from the dumb storage server, builds the graph with `buildGraph`, and runs core's `evaluateView` locally. It returns visible **structure**, not pixel geometry (positions are computed client-side by cactus/ELK and intentionally absent from the graph) and not live viewport state (which view is open / zoom — that is client-only and out of scope).

`list_views` is pulled forward to ship alongside `project`: without it the agent gets a scene it cannot interpret (it would not know what views exist or what roles they assign).

## Predecessor surface (Phases 1 & 2)

Triage and implement against these declared surfaces:

From Phase 1 (`core-query-foundation`):
- `buildGraph(nodes, edges, pack?, info?): Graph` (existing) — Document→indexed Graph.
- `evaluateView(graph, view): SceneGraph` and `evaluateContainment(graph, view): ContainmentTree` (existing, unchanged) — the canonical projector.
- Solid-free subpath export `@luminous/core/view` exists (re-exports `evaluateView`); `@luminous/core/graph`, `/types` exist.
- `SceneGraph` = `{ spatialNodes, latentNodes, arrows, summaryEdges, containment, warnings }`; `ContainmentTree` = `{ rootIds, childrenOf: Map, parentOf: Map, warnings }`.
- `View` = `{ id, name, description?, nodeRoles, edgeRoles, layers, layout, filter?, camera?, zoomToLevel? }`.

From Phase 2 (`mcp-graph-query-tools`):
- The MCP build bundles core pure subpaths; importing `@luminous/core/view` in MCP code builds and runs.
- The "declared-in-toolConfig + intercepted-in-CallTool" pattern (and optional `local?` marker) is established — `view` follows it.
- `query-tools.ts` has a `loadGraph(serverUrl, path)` helper (Document → `buildGraph`). Reuse it; do not duplicate.

## Do NOT

- Do NOT touch `packages/server-next`. Fetch the document via `GET /api/document/:path` and the pack via `GET /api/pack/:path` (both already exist; `pack-describe.ts` shows pack resolution).
- Do NOT reimplement projection — import `evaluateView` from `@luminous/core/view`. Reimplementing it is the drift this architecture avoids.
- Do NOT import the core barrel `.` (solid). Use `@luminous/core/view`, `/graph`, `/types`.
- Do NOT attempt to return positions / x-y geometry or the live active view / zoom. Projection is structure only; live viewport state is client-only and out of scope.
- Do NOT run full pack deserialization if it pulls solid (renderers/registry). You only need the raw `views` array from the pack JSON — read it directly.

## Plan

### 1. Create `packages/mcp/src/view-tools.ts`

Follows `pack-describe.ts` / `query-tools.ts` patterns.

```ts
import { evaluateView } from '@luminous/core/view'
import type { View, SceneGraph } from '@luminous/core/types'

// Resolve the canvas's pack JSON (sibling file) and return its raw views array.
async function loadViews(serverUrl, canvasPath): Promise<View[]>
export async function listViews(serverUrl, canvasPath): Promise<{ views: ViewSummary[] }>
export async function project(serverUrl, canvasPath, viewId?): Promise<ProjectedScene>
```

- **`loadViews`**: read the canvas (`GET /api/document/:path`) to get its `pack` field and `defaultView`; resolve the sibling pack path the way `describePackForCanvas` does (directory of the canvas + `<pack>.pack.json`); `GET /api/pack/:path`; return the raw `views` array (plain JSON already matching the `View` shape). The pack `views` are plain data — no deserialization needed for `evaluateView`, which only reads `nodeRoles`/`edgeRoles`.
- **`listViews`** → `{ views: ViewSummary[] }` where `ViewSummary = { id, name, description?, nodeRoles, edgeRoles, layout }`. Include the role maps so the agent can see what each view shows/hides/nests.
- **`project`**:
  - default `viewId` to the canvas's `defaultView`; if neither given nor present, error with a message listing available view ids.
  - find the matching `View` in the pack's views; if not found, error listing available ids.
  - load the graph (reuse Phase 2's `loadGraph`) and call `evaluateView(graph, view)`.
  - serialize the `SceneGraph` to JSON-safe form. `containment.childrenOf` and `parentOf` are `Map`s — convert to plain objects (`Record<string, string[]>` and `Record<string, string>`). Return:
    ```ts
    type ProjectedScene = {
      viewId: string
      spatialNodes: NodeSummary[]
      latentNodes: NodeSummary[]
      arrows: EdgeSummary[]
      summaryEdges: EdgeSummary[]
      containment: { rootIds: string[]; childrenOf: Record<string,string[]>; parentOf: Record<string,string> }
      warnings: SceneGraph['warnings']
    }
    ```
  - Reuse the `NodeSummary`/`EdgeSummary` shapes from `query-tools.ts` (export them there and import, or define a shared `summaries.ts` if cleaner — do not duplicate divergent definitions).

### 2. Register the `view` tool

Mirror the Phase 2 `query` registration: declare a `view` group in `tools.config.ts` (actions `list`, `project`), intercept `name === 'view'` in `server.ts`'s CallTool handler, dispatch on action to `view-tools.ts`.

- `view/list` params: `path` (pathParam).
- `view/project` params: `path` (pathParam), `viewId?` (described string — "omit to use the canvas's defaultView").
- Use the same `local?` marker / placeholder approach Phase 2 established.

### 3. Update the MCP instructions blurb

In `server.ts`, add `view` (list/project) to the "Tool groups:" line and the instructions. Add a sentence clarifying: `project` returns the visible structure of a view (spatial/latent/arrows/summary/containment) — the same partition the canvas renders — but not pixel positions or the user's live zoom.

### 4. Tests

Add `packages/mcp/src/view-tools.test.ts`. Mock `fetch` for both the document and the pack. Use a small pack with two views that assign different roles (one nests via a contain edge, one flat) over a small graph. Assert:
- `listViews` returns both views with their role maps.
- `project` with an explicit `viewId` partitions nodes into spatial/latent correctly and produces arrows vs summaryEdges per the edge roles.
- `project` with no `viewId` uses `defaultView`.
- containment Maps are serialized to plain objects (rootIds/childrenOf/parentOf present and JSON-safe).
- unknown `viewId` errors with a message listing available ids.

## Files to Modify

- `packages/mcp/src/view-tools.ts` — NEW: loadViews + listViews + project + Map→object serialization.
- `packages/mcp/src/tools.config.ts` — add the `view` tool group.
- `packages/mcp/src/server.ts` — `view` interception branch; instructions blurb.
- `packages/mcp/src/query-tools.ts` — export `NodeSummary`/`EdgeSummary` (or a shared module) for reuse; reuse `loadGraph`.
- `packages/mcp/src/view-tools.test.ts` — NEW tests.

## Verification

```bash
pnpm -C packages/mcp test
pnpm -C packages/mcp typecheck
pnpm -C packages/mcp build
```

## Out of Scope

- Live viewport state (which view is open, camera/zoom, disclosure level at current zoom). That needs a client→server presence channel — a separate future feature.
- Pixel/geometry output. Projection is structure only.
- Disclosure-level simulation (a `level?` param on project). Defer until a workflow needs it.
- `diagnostics` (orphans/cycles/missing-kinds). Separate validation tool, not this chain.

## Notes

- `evaluateView` may emit `warnings` (latent-without-summary, orphan-summary-edge); pass them through in `ProjectedScene.warnings` — they are useful agent feedback.
- `evaluateContainment` throws on a containment cycle or multiple contain-role kinds (load-time invariant). Catch and surface as a clean error string, not a thrown tool boundary.
- Keep the doc15 framing in mind: this resolves the doc's Tier-2 `project`/`list_views`, with `list_views` pulled forward (it was Tier 3) so the scene is interpretable.

## Surface after this phase

- MCP exposes a `view` tool: `list {path}` → `{ views: ViewSummary[] }`; `project {path, viewId?}` → `ProjectedScene` (spatial/latent/arrows/summaryEdges/containment/warnings, viewId defaulted to `defaultView`).
- `ViewSummary` includes `nodeRoles`/`edgeRoles` so the agent can interpret what a view shows.
- `project` reuses core's `evaluateView`; containment Maps serialized to plain objects; structure only (no geometry, no live viewport).
- Together with Phase 2, the agent now has both lenses: raw-graph (`query`) and view/scene (`view`).
- `packages/server-next` remains untouched (pure storage).
