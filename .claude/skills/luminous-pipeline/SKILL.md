---
skill: luminous-pipeline
description: |
  Teaches an agent to author a Luminous graph.json + pack.json pair for any repo.
  Covers the graph v3 format, pack.json shape, primitive vocabulary, co-location rule,
  deterministic ID derivation, and the decision tree between the built-in primitives
  pack and a domain pack.
  Use when an agent needs to produce a Luminous canvas model of a codebase or domain.
version: 1.0
author: Claude
tags: [luminous, pipeline, graph, pack, canvas, authoring, data]
---

# Luminous Pipeline Authoring

This skill equips an agent to write a `graph.json` + `pack.json` pair for any repo — a Luminous canvas model of that repo's structure, written as plain data files. No Luminous code is changed.

## Routing Table

| File | Topic | When to use |
|------|-------|-------------|
| [primitives-reference.md](primitives-reference.md) | Full built-in primitive vocabulary (atoms, layout, control-flow) | Authoring the `render` field of a nodeKind or edgeKind |
| [template-pipeline.ts](template-pipeline.ts) | Annotated TypeScript example reading source → emitting graph.json | Starting a new pipeline script or reviewing an existing one |

---

## The Two Outputs

A pipeline produces two sibling files sharing a basename:

```
<repo>/.canvases/
  my-domain.graph.json   ← the model (nodes + edges)
  my-domain.pack.json    ← the vocabulary (kinds + renderers)
```

---

## graph.json v3 Format

```jsonc
{
  "version": 3,
  "pack": "my-domain",        // names my-domain.pack.json in the same directory
  "nodes": [
    {
      "id": "component.App",  // stable, derived from source content
      "kind": "solid.component",
      "props": {
        "name": "App",
        "filePath": "src/App.tsx"
      },
      "tags": []
    }
  ],
  "edges": [
    {
      "id": "edge.renders.component.App.component.Header",
      "kind": "solid.renders",
      "from": "component.App",
      "to": "component.Header",
      "props": {},
      "tags": []
    }
  ],
  "defaultView": "component-tree"
}
```

### Field reference

| Field | Required | Notes |
|-------|----------|-------|
| `version` | yes | Always `3` |
| `pack` | yes | Basename of the sibling `.pack.json`; use `"primitives"` to skip pack authoring entirely |
| `nodes` | yes | Array of node objects |
| `edges` | yes | Array of edge objects |
| `defaultView` | yes | Must match a `views[].id` in the pack |

### Node shape

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | Stable string; derive from source content, never random UUID |
| `kind` | yes | Must match a `nodeKinds[].id` in the pack |
| `props` | yes | Object matching the kind's `props` JSON Schema |
| `tags` | yes | String array; may be empty |

### Edge shape

Same as node, plus:

| Field | Required | Notes |
|-------|----------|-------|
| `from` | yes | `id` of the source node |
| `to` | yes | `id` of the target node |

---

## pack.json Format

```jsonc
{
  "id": "my-domain",          // must equal the file's basename
  "version": "0.1.0",         // informational only; never resolved against
  "description": "...",

  "nodeKinds": [
    {
      "id": "solid.component",
      "label": "Component",
      "props": {
        "type": "object",
        "properties": {
          "name":     { "type": "string" },
          "filePath": { "type": "string" }
        },
        "required": ["name"]
      },
      "render": {
        "type": "card", "shape": "rectangle", "padding": 12,
        "children": [
          { "type": "text", "value": "{content.name}", "style": "heading" },
          { "type": "badge", "value": "component", "tone": "muted" }
        ]
      }
    }
  ],

  "edgeKinds": [
    {
      "id": "solid.renders",
      "label": "renders",
      "directed": true,
      "props": { "type": "object", "properties": {} },
      "render": {}
    }
  ],

  "views": [
    {
      "id": "component-tree",
      "label": "Component Tree",
      "roles": [
        { "kind": "solid.component", "role": "spatial" },
        { "kind": "solid.renders",   "role": "contain" }
      ]
    }
  ],

  "layers": [],
  "disclosure": []
}
```

### nodeKind / edgeKind fields

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | Namespaced with a prefix (e.g. `solid.`, `rust.`, `flow.`) |
| `label` | yes | Human-readable label shown in the UI |
| `props` | yes | JSON Schema for node/edge content |
| `render` | yes (recommended) | Renderer JSON; omit to use fallback rendering |
| `directed` | edgeKind only | `true` for directed edges |

### view roles

Each entry in `views[].roles` assigns a **role** to a kind for that view:

| Role | Meaning |
|------|---------|
| `spatial` | Renders as a standalone card on the canvas |
| `contain` | This edge kind drives nesting (parent/child containment) |
| `arrow` | Renders as a directed arrow between nodes |
| `summary` | Rendered as a chip/label on summary edges, not a standalone card |
| `latent` | Exists in the graph but is hidden in this view |
| `hidden` | Excluded from this view entirely |

---

## The Co-location Rule

`"pack": "my-domain"` resolves to `my-domain.pack.json` **in the same directory as the graph file**. The client derives the path; the server treats `.pack.json` files as opaque bytes.

```
.canvases/
  my-domain.graph.json   ← declares "pack": "my-domain"
  my-domain.pack.json    ← resolved automatically
```

---

## Decision Tree

```
Do I need meaningful domain kinds with distinct visuals?
│
├── No  → Use "pack": "primitives"
│         • No pack.json to write
│         • All nodes render as generic labeled boxes
│         • Good for quick boxes-and-arrows graphs
│
└── Yes → Author a pack.json using the built-in vocabulary
          • Declare nodeKinds / edgeKinds with render JSON
          • Compose render trees from the primitives in primitives-reference.md
          • Start minimal: one view, core kinds; add views/layers later
```

The built-in `"primitives"` pack ships with Luminous and requires no pack file — set `"pack": "primitives"` in the graph and omit the `.pack.json` entirely.

---

## The Determinism Convention

**Never use random UUIDs for node IDs.** Derive IDs from stable source content so re-running the pipeline produces a diffable update, not duplicates.

```typescript
// Good: stable, derived from source
const componentId = (name: string, filePath: string) =>
  `component.${filePath}:${name}`;

// Bad: random — every run creates new nodes
const componentId = () => crypto.randomUUID();
```

ID derivation belongs to the pipeline, not the pack. The pack describes kinds; it does not mint IDs.

Canonical patterns:
- File-scoped items: `kind.filePath:name` (e.g. `signal.src/App.tsx:count`)
- Tree-path items: `kind.parent.child` (e.g. `state.nav.home`)
- Edge IDs: `edge.edgeKind.fromId.toId` or `edge.edgeKind.fromId.toId.disambiguator`

Sort nodes and edges by ID before writing to produce stable diffs:

```typescript
nodes.sort((a, b) => a.id.localeCompare(b.id));
edges.sort((a, b) => a.id.localeCompare(b.id));
```

---

## Pipeline Structure Pattern

A pipeline script follows this shape (see [template-pipeline.ts](template-pipeline.ts) for a full annotated example):

```
1. Parse source artifacts (AST, markdown, config files) into typed data structures
2. Walk the parsed data → collect node objects (kind + props + stable ID)
3. Walk the parsed data → collect edge objects (from + to + stable ID)
4. Optionally: resolve cross-references (e.g. string action names → node IDs)
5. Sort nodes and edges deterministically
6. Write graph.json (and pack.json if authoring a domain pack)
```

Each step should be a pure function for testability. The main function assembles steps and writes output.

---

## Fallback Rendering

A pack is never required for a graph to open. If a kind has no `render` in the pack, or the pack is missing entirely, Luminous generates a default `card` with a text heading from the first string field and a `kv-list` of remaining fields. This fallback is legible but unstyled — authoring a `render` is an opt-in upgrade.

---

## What This Skill Does NOT Cover

- **Per-domain pipelines** (Solid analysis, Rust analysis, React analysis) — those are separate efforts.
- **Custom primitives** — the escape hatch for specialized renderers (live charts, embedded sub-canvases). This skill covers only the built-in vocabulary.
- **Product code changes** — a pipeline writes `.graph.json` and `.pack.json` into the target repo. Luminous itself is unchanged.
- **MCP tools for pipeline work** — `node/add` via MCP uses random UUIDs and is designed for interactive canvas building, not pipelines. Use direct file writes for pipeline output.
