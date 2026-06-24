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
| [primitives-reference.md](primitives-reference.md) | Full built-in primitive vocabulary (atoms, layout, control-flow) — **generated** from `packages/core/src/render/primitive-descriptors.ts` via `just gen-skill-reference` | Authoring the `render` field of a nodeKind or edgeKind |
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
| `info` | no | Optional markdown string describing this canvas; surfaced as a blue (i) button in the app header that opens an info modal. Useful for narrating what the canvas shows and how to read its views. |

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

**Edge labels.** Two paths exist, tried in order:

1. **`edgeKind.render`** — a level-keyed map (same shape as `nodeKind.render`) producing a styled JSX label drawn on the connector. Wins if present.
2. **`edge.props.label`** — a non-empty string drawn on the arrow, truncated and click-revealable. Quick path; requires the edgeKind's `props` JSON Schema to declare `"label"` (an `additionalProperties: false` schema with no `label` property will reject it at validation time).

An edge with neither is drawn bare from its view role (`arrow`, `contain`, or `summary`). See the `render` row in the kind-fields table below for an `edgeKind.render` example.

---

## pack.json Format

```jsonc
{
  "id": "my-domain",          // must equal the file's basename
  "version": "0.1.0",         // required string; informational — never resolved against
  "description": "...",

  "nodeKinds": [
    {
      "id": "domain.component",
      "label": "Component",
      "props": {                          // JSON Schema for the node's props
        "type": "object",
        "properties": {
          "name":     { "type": "string" },
          "filePath": { "type": "string" }
        },
        "required": ["name"],
        "additionalProperties": false
      },
      "idTemplate": "component.{name}",    // optional — see Determinism section
      "render": {                          // optional — keyed by DISCLOSURE LEVEL
        "card": {                          // each value is a RenderNode tree
          "type": "card",
          "children": [
            { "type": "text", "value": "{content.name}", "style": "heading" },
            { "type": "badge", "value": "component", "tone": "muted" }
          ]
        }
      }
    }
  ],

  "edgeKinds": [
    {
      "id": "domain.renders",
      "label": "renders",
      "directed": true,
      "props": {
        "type": "object",
        "properties": { "label": { "type": "string" } },
        "additionalProperties": false
      },
      "acceptsSource": ["domain.component"],   // optional — valid source kinds
      "acceptsTarget": ["domain.component"],   // optional — valid target kinds
      // edges may carry a "render" (level-keyed map, same shape as a nodeKind's)
      // OR rely on a "label" prop; absent both, drawn from view role (arrow/contain/summary)
      "render": {
        "card": { "type": "text", "value": "{content.label}", "style": "caption" }
      }
    }
  ],

  "views": [
    {
      "id": "component-tree",
      "name": "Component Tree",                // NOTE: the field is "name", not "label"
      "description": "...",
      "zoomToLevel": [
        { "minZoom": 0,   "level": "peek" },
        { "minZoom": 0.4, "level": "card" },
        { "minZoom": 1.2, "level": "open" },
        { "minZoom": 3.0, "level": "deep" }
      ],
      "nodeRoles": { "domain.component": "spatial" },  // map of nodeKind id → role
      "edgeRoles": { "domain.renders": "contain" },    // map of edgeKind id → role
      "layers": {},                                    // map of layer id → on|off|peek
      "layout": { "algorithm": "elk", "direction": "RIGHT" }  // algorithm: "grid"|"elk"|"mrtree"; direction: "RIGHT"|"DOWN" (ELK/mrtree only, default RIGHT)
    }
  ],

  "layers": [],          // optional; see Layers below
  "disclosure": [        // optional; which props show at each level
    {
      "kind": "domain.component",
      "peek": ["name"],
      "card": ["name", "filePath"],
      "open": ["name", "filePath"],
      "deep": ["name", "filePath"]
    }
  ]
}
```

### Disclosure levels

There are exactly four, ordered by zoom: **`peek` · `card` · `open` · `deep`**. They drive two things:

1. **`render` is a map keyed by level** — `{ "card": <RenderNode>, "open": <RenderNode> }`. The interpreter picks the render for the current zoom level. **The most common mistake is writing `render` as a flat `{ "type": "card", ... }` — that is wrong; the keys are read as level names and the kind renders nothing.** You need not supply all four levels — supply what you have; `card` is the sensible default to author first.
2. **`disclosure`** declares, per kind, which prop fields are visible at each level — consumed by fallback rendering and inspectors.

**Gate your pipeline output.** Before loading a `graph.json` + `pack.json` pair in Luminous, validate it locally: `tsx scripts/validate-pack.ts <graph.json> <pack.json>`. The script exits `1` on errors (warnings are non-fatal) and prints every issue including the flat-`render` mistake described above. You can also call `validateGraphAndPack(graphText, packText)` from `@luminous/core` directly in a pipeline script if you want to fail-fast with structured output.

### nodeKind / edgeKind fields

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | Namespaced with a prefix (e.g. `solid.`, `rust.`, `flow.`) |
| `label` | yes | Human-readable label shown in the UI |
| `props` | yes | JSON Schema for node/edge props |
| `render` | no | Map of disclosure level → RenderNode. Applies to **both** nodeKinds and edgeKinds. For an edgeKind it produces the label drawn on the connector. Omit to use fallback rendering. |
| `idTemplate` | no | Template for deriving an id from props — interactive creation only |
| `defaultSize` | no | `{ "w": number, "h": number }` — initial node size |
| `directed` | edgeKind | `true` for directed edges |
| `acceptsSource` / `acceptsTarget` | edgeKind, no | Arrays of kind ids constraining edge endpoints |

#### `edgeKind.render` example

`render` on an edgeKind works exactly like on a nodeKind — a level-keyed map of RenderNode trees. Precedence: `edgeKind.render` wins; else a non-empty `edge.props.label` string is used; else the edge is drawn bare from its view role.

```jsonc
"render": {
  "card": { "type": "text", "value": "{content.label}", "style": "caption" }
}
```

For `edge.props.label` to pass validation the edgeKind's `props` schema must permit it — an `additionalProperties: false` schema with no `label` property will reject the edge at validation time:

```jsonc
"props": {
  "type": "object",
  "properties": { "label": { "type": "string" } },
  "additionalProperties": false
}
```

### view fields

| Field | Notes |
|-------|-------|
| `id` | View identifier; a graph's `defaultView` must match one |
| `name` | Human-readable label — the field is `name`, **not** `label` |
| `description` | One-line summary |
| `zoomToLevel` | Array of `{ minZoom, level }` mapping zoom to disclosure level |
| `nodeRoles` | Map of nodeKind id → role |
| `edgeRoles` | Map of edgeKind id → role |
| `layers` | Map of layer id → `on` \| `off` \| `peek` |
| `layout` | `{ "algorithm": "grid" \| "elk" \| "mrtree", "direction"?: "RIGHT" \| "DOWN" }` — `direction` applies to `elk`/`mrtree` only; default `RIGHT` |

### Layout hints

A nodeKind may declare optional integer props that the ELK layout engine reads as placement hints. These are normal `props` entries in the nodeKind's JSON Schema — not a new top-level slot.

**`tier`** — integer ≥ 0 on a node instance's `props`. Lower values place the node closer to the layout's starting edge (left, with `RIGHT` direction). Soft hint: ELK may override it when cycle-breaking demands. Ignored by non-ELK algorithms.

```json
// nodeKind props schema
"props": { "tier": { "type": "integer", "minimum": 0 } }

// node instance
{ "id": "n1", "kind": "component", "props": { "tier": 0 } }
```

**`childLayout`** — optional string prop on a **container** node's `props`. Controls how that container arranges its children. Ignored on leaf nodes.

| Value | Behaviour |
|-------|-----------|
| `pack` (default) | Area-minimizing bin-packer (`packRects`), sorts children by height descending |
| `grid` | √n-column grid in `childrenOf` order |
| `stack-v` | Single vertical column in `childrenOf` order |
| `stack-h` | Single horizontal row in `childrenOf` order |

`stack-v` and `stack-h` preserve child order — they do **not** sort by size.

```json
// nodeKind props schema
"props": { "childLayout": { "enum": ["pack", "grid", "stack-v", "stack-h"] } }

// node instance
{ "id": "layer1", "kind": "tier-container", "props": { "childLayout": "stack-v" } }
```

### roles

A role tells a view how to present a kind. Node kinds go in `nodeRoles`, edge kinds in `edgeRoles`:

| Role | Applies to | Meaning |
|------|-----------|---------|
| `spatial` | nodes | Renders as a standalone card on the canvas |
| `latent` | nodes | In the graph but not drawn as a card in this view |
| `hidden` | nodes & edges | Excluded from this view |
| `contain` | edges | Drives nesting (parent/child containment) |
| `arrow` | edges | Renders as a directed arrow between nodes |
| `summary` | edges | Rendered as a chip/label, not a standalone connector |

### Layers

`layers` (top-level array) declares toggleable overlays; each view's `layers` map sets each layer's initial state. Leave both empty (`"layers": []` and `"layers": {}`) for a v1 pack. A layer entry:

```jsonc
{ "id": "transitions", "name": "Transitions", "edgeKinds": ["domain.renders"], "defaultState": "on" }
```

Layer states: `"on"` = visible, `"peek"` = dimmed (present but de-emphasized), `"off"` = hidden.

---

## Rust Match-Arm Gating Vocabulary

The built-in `primitives` pack includes Rust-specific kinds and a gating layer for visualizing match-arm data flow:

### `rust.match` node kind

A Rust `match` expression. Props:

| Prop | Type | Required | Notes |
|------|------|----------|-------|
| `label` | string | yes | Display name for the match expression |
| `arms` | string[] | no | List of arm names/patterns (e.g. `["Ok(v)", "Err(e)"]`) |
| `selectedArm` | string | no | **Graph-side selection.** Which arm is currently active. Absent = no gating (all arms full). This is churny canvas state — it lives on the node, not on the view. |

```json
{
  "id": "rust.match.parse_result",
  "kind": "rust.match",
  "props": { "label": "parse_result", "arms": ["Ok(v)", "Err(e)"], "selectedArm": "Ok(v)" },
  "tags": []
}
```

### `rust.dataflow` edge kind

A directed data-flow edge between Rust nodes. Props:

| Prop | Type | Required | Notes |
|------|------|----------|-------|
| `arm` | string | no | Which match arm this flow belongs to. Edges without `arm` are never suppressed. |
| `label` | string | no | Optional display label |

```json
{
  "id": "edge.rust.dataflow.rust.match.parse_result.node.process_ok",
  "kind": "rust.dataflow",
  "from": "rust.match.parse_result",
  "to": "node.process_ok",
  "props": { "arm": "Ok(v)" },
  "tags": []
}
```

### `match-gating` layer

Controls whether non-selected match-arm nodes are gated (dimmed or hidden).

| State | Effect |
|-------|--------|
| `"off"` (default) | No gating — all arms render at full opacity |
| `"peek"` | Non-selected arm's exclusive downstream nodes are dimmed (opacity 0.35) |
| `"on"` | Non-selected arm's exclusive downstream nodes are hidden from the canvas |

Set in a view's `layers` map:

```json
"layers": { "match-gating": "peek" }
```

**How gating works (transitive correctness):**
1. For each `rust.match` node with `selectedArm` set, outgoing `rust.dataflow` edges whose `arm` ≠ `selectedArm` are suppressed.
2. `reachable()` traverses from data-flow source nodes (no incoming `rust.dataflow` edge) skipping suppressed edges.
3. Nodes that participate in data flow but are NOT reachable from any source become the peek set.
4. Nodes fed by *both* a selected and non-selected arm remain reachable → they stay full opacity.

Selection (`selectedArm`) is graph-side node data — it travels with the canvas file and persists across sessions. It is NOT stored on the view or in a runtime signal.

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
│         • Nodes use kind "prim.box"; edges use "prim.arrow" or "prim.contains"
│         • Node props: { label, description?, color?, tag? }  (label required)
│         • Good for quick boxes-and-arrows graphs
│
└── Yes → Author a pack.json using the built-in vocabulary
          • Declare nodeKinds / edgeKinds with render JSON (keyed by level)
          • Compose render trees from the primitives in primitives-reference.md
          • Start minimal: one view, core kinds, a "card" render; add levels later
```

The built-in `"primitives"` pack ships with Luminous and requires no pack file — set `"pack": "primitives"` in the graph and omit the `.pack.json` entirely; the client falls back to the shipped built-in. Your nodes must still use that pack's kinds: `prim.box` for nodes, `prim.arrow` / `prim.contains` for edges.

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

For a pipeline, ID derivation belongs to the pipeline: write the `id` field directly into every node and edge you emit. The pack's optional `idTemplate` is **only** used when a node is created interactively (e.g. via MCP) and has no id yet — pipelines never rely on it. Whether or not the pack declares `idTemplate`, a pipeline must still derive stable ids itself.

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
