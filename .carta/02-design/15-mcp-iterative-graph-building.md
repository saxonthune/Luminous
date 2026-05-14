---
title: MCP Iterative Graph Building
summary: Tool surface for AI agents to build and query property graphs iteratively — six tiers from CRUD to pack authoring, with layout policy and sync strategy.
tags: [mcp, ai, tools, graph, iteration]
deps: [doc02.04, doc02.11, doc02.14]
---

# MCP Iterative Graph Building

This document defines the tool surface for AI agents to build, query, and maintain Luminous property graphs iteratively. It supersedes the HTTP-only model in [doc02.04](./04-mcp-design.md) for graph-building workflows.

The tool surface is organized in six tiers from most fundamental (graph CRUD) to most infrastructural (sync). An MVP can ship Tiers 1–2 and still be useful; the higher tiers add pack awareness and iterative support.

---

## Tier 1: Graph CRUD

The primitive mutation layer. Agents call these to build up graph structure.

### Node operations

| Tool | Contract |
|---|---|
| `create_node` | `{ path, kind, props?, tags?, id? }` → `{ ok, id }` |
| `update_node` | `{ path, id, props?, tags? }` → `{ ok }` (shallow-merges props) |
| `delete_node` | `{ path, id }` → `{ ok }` (also removes incident edges) |
| `move_node` | `{ path, id, position }` → `{ ok }` (viewport geometry only; no-op until viewer stores positions in the file) |

### Edge operations

| Tool | Contract |
|---|---|
| `create_edge` | `{ path, kind, from, to, props?, tags?, id? }` → `{ ok, id }` |
| `update_edge` | `{ path, id, props?, tags? }` → `{ ok }` |
| `delete_edge` | `{ path, id }` → `{ ok }` |

### Atomic batch

| Tool | Contract |
|---|---|
| `apply` | `{ path, operations: Operation[] }` → `{ ok, results[] }` |

`apply` executes the list in order, fail-fast, no partial commit, no rollback. Supports `$ref:<name>` forwarding so a create in operation N can supply its generated id to operation N+1.

The current `batch` tool in [doc02.04](./04-mcp-design.md) already implements this pattern; Tier 1 formalizes it as the foundation of the graph-building surface.

---

## Tier 2: Query

Read-only tools for inspecting graph state. Agents call these to orient themselves before mutating.

| Tool | Contract |
|---|---|
| `list_nodes` | `{ path, filter? }` → `{ nodes: NodeSummary[] }` — filter by kind, tags, or prop equality |
| `list_edges` | `{ path, filter? }` → `{ edges: EdgeSummary[] }` — filter by kind, from, to |
| `neighborhood` | `{ path, id, hops? }` → `{ nodes, edges }` — ego graph up to N hops (default 1) |
| `project` | `{ path, viewId }` → `{ spatialNodes, latentNodes, arrows, summaryEdges }` — evaluate a view's role assignments over the graph |
| `diagnostics` | `{ path }` → `{ warnings }` — orphaned nodes, missing kinds, containment cycles |

These do not expose the raw graph dump. Agents work via targeted queries, which keeps context windows small and tool calls meaningful.

---

## Tier 3: Pack awareness

Tools that let agents discover what kinds, views, and layers a loaded graph can use.

| Tool | Contract |
|---|---|
| `list_packs` | `{ path }` → `{ packs: { id, version }[] }` — packs declared in the graph file |
| `pack_schema` | `{ packId }` → `{ nodeKinds, edgeKinds }` — kind ids, labels, and props schemas |
| `list_views` | `{ packId }` → `{ views: { id, name, description? }[] }` |
| `list_layers` | `{ packId }` → `{ layers: { id, name, edgeKinds }[] }` |

These read the registry (see [doc02.14](./14-pack-contract.md)), not the file. The server must have the packs registered to answer.

---

## Tier 4: Pack authoring

Two modes for an agent to introduce new kinds at runtime.

### Mode A — Pack as data (long term)

A pack is serialized as JSON, uploaded via an MCP tool, deserialized, and registered. Renderers are either defaulted or supplied as a referenced renderer function via a pack bundle. This mode requires a stable pack serialization format and a renderer sandbox — non-trivial design work.

### Mode B — Pack as code with default renderer (MVP)

The agent uploads a TypeScript module (or the server loads it from a watched path). The server executes it in a trusted context (no sandbox in v1), registers the exported pack, and broadcasts the registration event to connected clients.

Default renderer: if a pack does not provide a node renderer for a kind, the server supplies a plain-text card that displays all props as key–value pairs. This is sufficient for iterative prototyping without requiring the agent to author Solid components.

**Recommendation: ship Mode B for MVP.** The agent authors a `.ts` pack file (just kinds, views, and layers — no custom renderers required), commits it to the pack directory, and the server hot-registers it. Round-trip from "I have an idea for a new node kind" to "it renders in the viewer" is one file write and one hot-reload. Mode A adds flexibility the MVP does not need.

---

## Tier 5: Iteration support

Infrastructure that makes multi-step agent dialogue coherent.

### History and checkpoints

The Yjs CRDT in `server-next` provides a free undo/redo log over the document. Checkpoints are named snapshots: `checkpoint_create { path, name }` and `checkpoint_restore { path, name }`. An agent that is about to make a large structural change can checkpoint first; the human can restore if the change doesn't land well.

### Diff preview

`preview_apply { path, operations[] }` returns the expected diff without committing. Agents can show the human what would change before executing.

### Layout policy (resolved)

When an MCP agent creates a node via `create_node`, it **omits `position`**. The view's ELK auto-layout assigns position when the viewer renders the updated graph.

**Rationale**: MCP stays simple — it reasons about structure, not geometry. Viewport geometry belongs in the view, not the graph. Agents that need to influence layout can set layout-relevant props on nodes (e.g. a `weight` or `rank` prop that an ELK options hook consumes), but they do not write pixel coordinates.

This is the resolved choice. The alternative (agent sets position) couples the agent to viewport dimensions and zoom level, which change with window size and are not semantically meaningful to a graph-building workflow.

---

## Tier 6: Sync

Largely free from `server-next`'s Yjs CRDT.

When an agent mutates the graph, the server writes the change to the Yjs document and broadcasts a `changed` event over the WebSocket. Connected browser clients receive the event and reload the affected document. From the agent's perspective, the sync is invisible — it mutates, the viewer updates.

For multi-agent scenarios (two agents writing to the same graph simultaneously), Yjs's CRDT semantics handle concurrent writes without coordination. Structural conflicts (e.g. both agents deleting the same node) are resolved by the CRDT last-write-wins rule; the `diagnostics` tool can surface any resulting inconsistencies.

Agent-to-agent coordination (e.g. "agent A builds the schema layer, agent B populates props") is out of scope for this document. The sync layer does not need changes to support it; coordination is a workflow concern.
