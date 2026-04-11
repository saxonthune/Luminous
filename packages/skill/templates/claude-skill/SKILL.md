---
name: luminous
description: Luminous canvas tool — create and work with visual canvases that serve both human spatial thinking and AI structured context. Use when building canvases, writing pipeline scripts, or working with .canvases/ files.
---

# Luminous

Luminous is a visual canvas tool for software design. It bridges two complementary strengths: humans reason well with spatial arrangements, AI performs well with structured context. A Luminous canvas is both — a spatial workspace a human can see and rearrange, and structured data an AI agent can read, query, and modify.

This is a *design* tool, not a diagramming tool. Diagrams are pictures. Design is the activity of discovering the right structure — and that requires both human spatial intuition and AI's ability to hold precise context.

## What a Canvas Is

A `.canvas.json` file in `.canvases/` contains:

- **Schemas** — define what kinds of nodes and edges exist on this canvas. Each schema has a name, label, and primitives (visual building blocks like title, markdown body, drag-bar).
- **Structure** — the nodes. Each node references a schema, has geometry (x, y, w, h), optional content (field values), and optional nesting (parentId).
- **Edges** — connections between nodes. Freeform by default (any node to any node, optional label). Can reference an edge schema for typed relationships.

Canvases are built two ways:
1. **By hand or via MCP tools.** An agent or human creates nodes and edges to represent architecture, product concepts, data models, or any other structure worth seeing spatially.
2. **By pipeline scripts.** Scripts that perform static analysis of source code and emit `.canvas.json` files automatically.

## MCP Tools Available

When the Luminous MCP server is connected, you have these tool groups:

- **canvas** — `list` discovers available canvases, `read` loads a full document
- **node** — create, move, resize, nest, reorder, delete nodes
- **edge** — connect/disconnect nodes, relabel edges
- **schema** — define and remove node/edge schemas
- **diag** — read-only queries: outline (nesting tree), summary (counts/depth), query (filter nodes), subtree, bbox
- **batch** — apply multiple mutations atomically with cross-referencing

**Typical workflow:** `canvas.list` → `canvas.read` → understand the structure → make changes with node/edge/schema tools. Use `batch` for multi-step mutations that should succeed or fail together.

## Writing Pipeline Scripts

A pipeline script reads source code via static analysis and emits a `.canvas.json` file. The pipeline is the reusable artifact — it can be shared across projects and communities. Each pipeline defines its own node types from the forces of its domain.

### What Makes a Good Pipeline

A pipeline is a compiler whose target is human spatial cognition. The "instruction set" is nodes, edges, and nesting. A pipeline is correct when its output **enables insight** — when the topology supports the arrangements a user needs to see patterns.

**Get the topology right.** Which things become nodes, how they nest, and what edges connect them determines which spatial arrangements are *reachable*. A topology that buries information in body text instead of nodes and edges forecloses layouts the user might need. Getting the topology right is more important than getting the default layout right.

**The subnode test.** Should a concept be its own node type, or body text on a parent? Ask: do edges need to connect to this kind of thing specifically, or to the parent that contains it? This is a schema-level decision, not case-by-case. If signals as a category need edges (they're read across component boundaries), then Signal is a type and every signal is a node. If the data varies wildly across instances, it stays as body text.

**parentId for containment, edges for cross-boundary flow.** The canvas has two traversal mechanisms: `parentId` answers "what contains what" (always a tree), edges answer "how do things relate across that structure" (can be a graph). Use `parentId` for pure containment. Use edges for relationships that cross containment boundaries.

### Pipeline Output Structure

```json
{
  "version": 2,
  "schemas": {
    "my-type": {
      "name": "my-type",
      "label": "My Type",
      "primitives": [
        { "type": "drag-bar" },
        { "type": "title", "bind": "title" },
        { "type": "markdown", "bind": "body" }
      ],
      "kind": "node"
    },
    "my-edge": {
      "name": "my-edge",
      "label": "My Edge",
      "kind": "edge",
      "directed": true,
      "primitives": []
    }
  },
  "structure": {
    "node-id": {
      "id": "node-id",
      "schemaName": "my-type",
      "geometry": { "x": 0, "y": 0, "w": 280, "h": 120 },
      "content": { "title": "Node Title", "body": "Details here" },
      "parentId": null,
      "order": "a0"
    }
  },
  "edges": {
    "edge-id": {
      "id": "edge-id",
      "fromId": "source-node-id",
      "toId": "target-node-id",
      "schemaName": "my-edge",
      "label": "relationship"
    }
  }
}
```

### Pipeline Design Process

1. **Identify the domain's natural containment hierarchy.** What contains what? Components contain signals. Modules contain functions. Tables contain columns. This becomes the `parentId` tree.

2. **Identify cross-boundary relationships.** What connects across the containment hierarchy? Data flow, dependencies, references. These become edges.

3. **Define node types from forces, not from anticipation.** Each type should exist because the domain demands it — because edges need to connect to that kind of thing, or because the visual distinction carries meaning. Don't pre-build types you might need later.

4. **Start with detection heuristics.** AST patterns, naming conventions, import graphs. The pipeline reads code structure, not runtime behavior.

5. **Layout is a reasonable default.** Tree layout reflecting the containment hierarchy is usually the right starting point. The human refines from there.

## Modeling Philosophy

### Unfolding Design

Luminous follows an unfolding design process: start minimal, grow complexity only when forces demand it. This applies to pipelines too.

- **Don't overengineer schemas.** Define the node and edge types your pipeline actually needs — the ones that carry visual meaning and connect via edges. Don't add types speculatively. Three types that capture the real structure are better than ten that anticipate hypothetical needs.
- **Body text is fine.** Not every piece of data needs to be a structured field. If a detail is informational but nothing connects to it or filters by it, markdown body text is the right home.
- **Schema granularity follows edge connectivity.** The test for whether something deserves its own schema: does anything need to point at it, or does it live inside something that gets pointed at? Let the edges decide the types.

### What Makes a Model Useful to Human + AI

A canvas serves two audiences simultaneously. The model is good when:

- **A human can see structure at a glance.** Nesting shows containment. Edge density shows coupling. Color-coded types show the vocabulary. The spatial arrangement itself communicates — a cluster of tightly-connected nodes is visually different from a sparse chain.
- **An AI can query precisely.** Node types are filterable. Edges are traversable. The `diag` tools can answer "what are the roots?", "what's in this subtree?", "how many of each type?" without reading every node.
- **Both can rearrange without losing information.** The topology (nodes, edges, nesting) carries the semantics. Layout is a view over that topology. A human can drag nodes around to see a different arrangement; an AI can query a different projection. Neither action destroys the underlying structure.
- **The model earns its complexity.** Every node type, every edge schema, every level of nesting should justify itself through use. If a type exists but nothing connects to it and no one filters by it, it's dead weight. Remove it.
