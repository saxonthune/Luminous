---
title: "PDR: Property Graph Architecture"
summary: Successor PDR committing Luminous to a property-graph contract, multi-document composition, per-view role semantics, kind packages, and a cactus-class Solid.js canvas engine. Supersedes parts of the unfolding PDR that assumed a single uniform node/edge list.
tags: [pdr, architecture, property-graph, kind-packages, views, disclosure, canvas-engine]
deps: [doc02.01]
---

# PDR: Property Graph Architecture

## 0. Executive summary

Luminous will commit to a **property graph as the interface contract** between every part of the system: pipelines, MCP, the canvas runtime, saved views, and the persistence layer all speak "nodes with kinds, edges with kinds, both with typed props." The choice of backing store (in-memory, SQLite, KùzuDB, etc.) is an implementation detail we refuse to calcify.

On top of this contract, Luminous will introduce:

- **Multi-document composition.** Substrate, layers, user annotations, positions, saved views, and per-agent contributions each live in their own document and compose into one virtual canvas at load time. Provenance is a directory path, not a field.
- **Kind packages.** Each pipeline ships a package declaring node/edge kinds, Solid renderers, disclosure schemas, layers, saved views, and named MCP queries. Packages are trusted code (v1), installed explicitly by the user.
- **View semantics with role assignments.** Each saved view assigns every in-scope edge kind a role (`contain`, `arrow`, `aggregate`, `hidden`) and every in-scope node kind a role (`spatial`, `abstract`, `hidden`). This is the formal mechanism that lets the same graph project into a treemap, a call graph, a statechart, or an invariant map — without duplicating data.
- **Disclosure levels.** `peek` / `card` / `open` / `deep`, each a declarative field selection plus a renderer. Same node, progressively more content, driven by zoom and by user intent. No editor mode in v1.
- **Stable IDs** from source content, hybrid (path-primary with a rename detector emitting `prev_ids`), so that pipeline regeneration never clobbers user work.
- **Cactus-class canvas engine.** DOM-based, Solid-native, with specific growth in virtualization, hybrid edge rendering, layout dispatch, and zoom-as-reactive-signal. No framework switch; no WebGL base.
- **Read-view MCP surface.** Agents query, inspect, write to their own layer, and invoke named queries. Agents do not dump the graph. Editor-mode for humans is deferred; all authoring in v1 is MCP writing to source files that pipelines then ingest.

The two use-case classes that motivated earlier versions of the architecture — code projects and formal specs — **collapse into a single architecture** under the assumption that MCP always writes to source files and Luminous is read-only. Code and spec pipelines are peers; the only difference is which source files they parse.

This PDR does not replace [doc02.01](./01-pdr-unfolding-architecture.md). It builds on its commitments (polymorphic nodes, freeform edges, server-as-storage, willing-to-delete) and adds the structure needed for the next round of forces — richer visualizations, multiple pipelines, layer toggles, progressive disclosure, and MCP-first authoring.

## 1. Context and forces

### 1.1 What changed since the unfolding PDR

The unfolding PDR committed to "polymorphic nodes, freeform edges, server-as-storage, client-as-intelligence." Those remain correct. What it did not anticipate, and what this PDR addresses:

- **Pipelines are multiple and heterogeneous.** Rust, Solid, Python, .NET, CDK, Quint, Datalog — each pipeline generates node kinds the engine has never seen. The uniform `{id, type, position, size}` record is insufficient; kinds need typed property schemas, custom renderers, and per-kind disclosure rules.
- **Progressive disclosure is a first-class requirement, not a nice-to-have.** Click a C# interface → see its methods. Click a method → see its XML docs. This is not "hover tooltip" territory; it's four or five distinct levels of richness per node, each with its own renderer.
- **Layers toggle independently.** A Rust canvas shows ownership, borrows, calls, trait impls, unsafe, churn, coverage — each as an edge set the user turns on/peek/off. Layers are not a styling flourish; they are how users reason about a single graph from multiple angles.
- **Same graph, multiple spatial interpretations.** A statechart view nests substates; the same underlying module graph flattens for a call view. Spatial structure is a function of the view, not of the data.
- **AI agents are first-class authors for specs.** MCP writes Quint modules, XState sidecars, and spec JSON to source files. Luminous watches those files, re-ingests, re-renders. Humans read, maybe tweak small things in source, never open Quint's declaration syntax in their head.
- **"Never read or write code" is a real product goal.** The canvas is the primary developer surface for reasoning about both requirements and reality. Viewer-mode is the near milestone; editor-mode is the horizon but explicitly out of scope for v1.

### 1.2 Two classes collapsed to one

Earlier drafts distinguished a "code class" (artifact → graph → visualization) from a "spec class" (MCP dialogue → graph → visualization with round-trip editing). Under the decision that MCP always writes to source files and Luminous is read-only, these classes become the same workflow:

```
source artifact  →  pipeline  →  property graph  →  views  →  canvas
```

The only difference is *what writes the source artifact*: a compiler/IDE/developer for code, an MCP agent for specs. From Luminous's perspective, both are source files watched by a pipeline. This collapse is a strict simplification and shapes every decision below.

### 1.3 The goal statement

Luminous's thesis: **developers should be able to build requirements and inspect the reality of their code without reading or writing code themselves.** The canvas is the primary surface. The artifact chain (source → graph → view) must be faithful enough that the visual representation is a trustworthy proxy for the underlying reality. Every decision in this PDR is in service of that goal.

## 2. Core decisions

The following decisions are binding. Later sections elaborate each.

| # | Decision | Rationale |
|---|---|---|
| D1 | Property graph as interface contract | Every subsystem speaks the same model. Product-level DB choice is deferred. |
| D2 | Multi-document composition | Pipeline-owned vs. user-owned vs. agent-owned data must never clobber. Directory path = provenance. |
| D3 | Kind packages as the pipeline contract | Pipelines bring their own vocabulary, renderers, and default views. Engine knows nothing about Rust or Quint. |
| D4 | Role-based view semantics | Same graph, many projections, declared per view. No hidden privileged fields. |
| D5 | Disclosure levels (peek / card / open / deep) | Four levels cover the range from "dot on map" to "full inspector." No editor level in v1. |
| D6 | Hybrid stable IDs | Path-primary + rename detector. User positions and annotations survive regeneration. |
| D7 | Cactus-class canvas engine | DOM + Solid fine-grained reactivity. No framework switch. |
| D8 | Trusted components | Packages ship code; user installs explicitly. Declarative-only fallback available for built-ins. |
| D9 | Read-view only in v1 | All authoring is MCP → source → pipeline. Editor mode deferred. |

## 3. Data model

### 3.1 Property graph primitives

```
Node = {
  id:        string,             // globally unique, derivation-stable
  kind:      string,             // namespaced; e.g. "rust.type", "quint.state"
  props:     Record<string, any>,// typed per kind
  facets:    string[],           // free-form tags used for ad-hoc filtering
}

Edge = {
  id:        string,
  kind:      string,             // e.g. "rust.calls", "statechart.substate-of"
  from:      NodeId,
  to:        NodeId,
  props:     Record<string, any>,
  facets:    string[],
}
```

Node kinds and edge kinds are declared by kind packages (§5). Props are typed by the owning package's schema. `facets` is an escape hatch for ad-hoc tagging that doesn't justify a new kind or property; use sparingly.

There is exactly one level of primitive: nodes and edges. No hyperedges, no nested subgraph primitives at the data layer. Containment, nesting, and hierarchical structure are expressed as **edges** whose visual interpretation is decided per view (§4).

### 3.2 Kinds are the main lever

`kind` does most of the useful work in this architecture:

- Dispatches to the right renderer.
- Dispatches to the right disclosure schema.
- Populates the right layer.
- Validates props against the right schema.
- Drives per-view role assignment.

Two rules:

1. **Kinds are namespaced.** A package declares kinds under its prefix (`rust.*`, `quint.*`, `solid.*`). No collisions across packages.
2. **Kinds are open but versioned.** Packages can declare new kinds at any time; the graph admits them. Each package declares a semver; a canvas manifest pins the package versions it uses.

### 3.3 Stable IDs

IDs must survive source refactors that the user would call "the same thing moved." The scheme:

- **Primary ID**: deterministic hash of `(kind, canonical-source-key)` where `canonical-source-key` is kind-specific. For a Rust type, something like `my_crate::net::http::Request#struct`. For a Quint state, the module path plus state name.
- **Rename detection**: at regeneration time, diff old vs. new node sets. Any ID that disappeared but has a near-match (same kind, similar name, similar neighborhood) records the old ID in its `prev_ids: string[]` field. The composition layer rewrites user-authored references through `prev_ids` automatically.
- **Failure mode**: if the rename detector is wrong, the user sees an annotation attached to the wrong node. Recoverable: user drags the annotation; position/annotation storage is keyed by the new ID from then on.

Packages supply the ID-derivation function. The engine supplies the rename-detection harness.

### 3.4 Multi-document composition

A canvas is **not** a single file. It is a composition of several, each with a single owner:

```
<canvas-root>/
  canvas.json                    ← thin manifest: name, package versions, doc list
  substrate/
    nodes.json                   ← pipeline-owned; kinds, props, ids
    edges.json                   ← pipeline-owned
  layers/
    owns.json                    ← pipeline-owned; one file per layer
    borrows.json
    calls.json
    churn.json
    <agent-id>.json              ← agent-contributed layers
  annotations.json               ← user-owned; freeform regions, notes, callouts
  positions/
    <view-id>.json               ← user-owned; per-view position overrides
  views/
    <view-id>.json               ← saved views (built-in or user-authored)
```

Ownership conventions:

- **Pipeline writes**: substrate, its own layer files. Never annotations, never positions, never user-authored views.
- **User writes**: annotations, position overrides, user-authored views.
- **Agent writes**: its own layer file (e.g. `layers/agent-cycles.json`), optionally its own view. Agents do not touch substrate or other agents' layers.
- **Engine writes**: nothing permanent. Derived caches live out of tree.

Ownership is enforced by the write API, not by file permissions. Violations are pipeline bugs and should fail loudly.

### 3.5 Load-time composition

When a canvas opens, the engine:

1. Reads `canvas.json` to discover docs and pinned package versions.
2. Loads packages (§5); validates kind universe.
3. Reads substrate; validates nodes and edges against kind schemas.
4. Reads layers; merges edges into the graph, tagging each with its source doc.
5. Reads annotations; injects them as edges/nodes of kind `annotation.*`.
6. Reads positions for the current view.
7. Reads the active view.
8. Applies the view's role assignments, layout, filter, camera.

Every merged node/edge carries its `source_doc` for provenance. The write API uses `source_doc` to route mutations back to the right file.

### 3.6 Why not one big graph file

- **Surgical regeneration.** Re-running the borrow analyzer rewrites `layers/borrows.json`, nothing else. Git diffs are tiny and readable.
- **Unambiguous provenance.** No "who wrote this field" detective work.
- **Partial loading.** At crate zoom, don't load the member-level layers.
- **MCP write surface.** An agent that wants to contribute "cyclic dependency findings" writes one file.

### 3.7 Storage realization

On disk: JSON-per-doc as above, git-friendly.

In memory: a single indexed structure (likely a pair of Maps plus per-edge-kind secondary indices). Rebuildable from disk; no persistence of its own.

For persistent large-graph caches (Rust crates at member zoom), an on-disk SQLite derived cache is allowed but not required. Any cache is a performance concern, not a source of truth — canvas docs remain canonical.

**Deferred**: KùzuDB, DuckDB, custom query engines. These become plausible if query latency or memory pressure force the issue. The property-graph contract is designed so that backend swaps do not leak upward.

### 3.8 Facets vs. kinds vs. props

Three mechanisms with overlapping power; the choice matters for refactorability:

- **Kind** — the primary discriminator. Changes rendering, disclosure, layer membership. Use when the answer to "what is this?" differs.
- **Prop** — typed data on a kind. Use when "what is this?" is the same but the value varies.
- **Facet** — untyped, ad-hoc tag. Use for transient filters or cross-cutting concerns that don't justify a new kind or prop. Graduate to props when a facet becomes load-bearing.

When in doubt, lean toward kinds. A proliferation of facets is a signal that the kind universe is under-specified.

## 4. View semantics

The view layer is what turns a graph into a canvas. Its commitments are the most consequential in this PDR.

### 4.1 The role system

In any given view, each edge kind plays exactly one role:

| Role | Meaning |
|---|---|
| `contain` | Child rendered **inside** parent's coordinate system. Parent's bounds enclose child. |
| `arrow` | Drawn as a visible edge between two spatial nodes. |
| `aggregate` | Collapsed into a badge/count/summary on the source node. |
| `hidden` | Present in the graph, not rendered in this view. |

And each node kind plays exactly one role:

| Role | Meaning |
|---|---|
| `spatial` | Has a position; rendered. |
| `abstract` | Present in the graph, not directly rendered (may appear via aggregation on a spatial node). |
| `hidden` | Excluded from the view. |

A view declares a role assignment for every kind it scopes. Unscoped kinds are implicitly `hidden`.

### 4.2 What roles buy

**Same graph, many projections.** The Rust example:

- Treemap view: `rust.module-contains-type: contain`, `rust.calls: hidden`, `rust.owns: arrow`.
- Call-graph view: `rust.module-contains-type: hidden`, `rust.calls: arrow`, `rust.owns: hidden`.
- Ownership view: `rust.module-contains-type: hidden`, `rust.owns: arrow`, `rust.borrows: arrow` (styled differently).

All three views read the same property graph. No data duplication; no schema migration. The view picks.

**Multi-parentage is free.** A method might be `contain`-ed by its class in a class view and by its source file in a file view. Both edges exist in the graph; each view picks its containment kind.

**Per-view renderers.** A `rust.type` renders as a treemap cell in one view and as a card with a methods table in another. The view can override the default card renderer per kind.

### 4.3 Constraints on `contain`

Containment implies a coordinate system. The rules:

1. **At most one edge kind per view plays `contain`.** Two would mean coordinate ambiguity.
2. **The containment subgraph must be acyclic.** Cycle = load-time error. No attempt to heal.
3. **A node's position is relative to its containment parent** in that view. If no containment parent, position is relative to the canvas root.
4. **A node has exactly one containment parent per view**, even if multiple edges of the `contain` kind point to it — take the first, warn on the rest.

These are engine-enforced; packages cannot opt out.

### 4.4 Layouts

Each view declares a layout algorithm:

- `treemap` — requires `contain` kind. Fills parent bounds with children weighted by a prop.
- `dagre` / `elk` — layered DAG. Uses `arrow`-role edges.
- `force` — physics simulation on `arrow` edges.
- `manual` — positions come entirely from the user positions doc.
- `hierarchy` — tree layout with a `contain` kind, but drawn as a classic tree (not nested rects).

Layouts are pure functions: `(nodesInScope, edgesInScope, options) → positions`. They live behind a plugin registry so packages can contribute new ones without touching the engine.

User positions override layout output. When a user drags a node, the override persists in `positions/<view-id>.json`. Re-running the layout does not overwrite overrides unless the user explicitly resets.

### 4.5 Per-view position storage

The same node has different `(x, y)` in different views. Position storage is keyed by `(view_id, node_id)`. When switching views, the canvas animates between layouts; user overrides are preserved per view.

### 4.6 Semantic zoom as a reactive signal

Renderers receive the current zoom level as a Solid signal in their render context. A kind's renderer is a single component that chooses its disclosure level based on zoom:

```
<Show when={level() === 'peek'}>...</Show>
<Show when={level() === 'card'}>...</Show>
...
```

The mapping from zoom scale to level is configurable per view (so a "crate overview" view stays at `card` level even when zoomed in, while a "member detail" view expands to `open` at moderate zoom).

### 4.7 Filters and queries

Every view carries an optional filter — a query expression evaluated against the node/edge set at load time. Matching items are full-opacity; non-matching dim to a peek state. Queries are graph-pattern-like:

```
nodes where kind = "rust.type" and exists edge of kind "owns" to kind = "rust.type" where props.wrapper = "Arc"
```

Query execution is an index walk over edge-kind indices. Named queries (§10) are packaged versions of these, exposed to MCP.

### 4.8 Saved views

A saved view bundles:

- `id`, `name`, `description`
- Kind-role assignments (edges and nodes)
- Layer states (on / peek / off)
- Layout algorithm + options
- Default filter
- Default camera position and zoom
- Optional per-kind renderer overrides (e.g., use the `statechart-state` renderer for `rust.type` in this view)
- Optional zoom-to-disclosure-level map

Packages ship saved views as defaults. Users author additional saved views, which live under `views/` in the canvas root. Saved views are first-class artifacts — shareable, diffable, and the natural unit for "show the new hire the module structure" or "concurrency audit."

## 5. Kind packages

A kind package is the unit a pipeline ships. It is the contract between the engine and pipeline authors.

### 5.1 Three-part internal shape

A package cleanly separates three concerns:

**Schema** — pure data. Zero UI. Loadable in headless contexts (MCP server, CI lint).
- Node kinds and edge kinds with props schemas (Zod or equivalent).
- ID derivation functions.
- Validation rules.

**Presentation** — UI code. Requires Solid.
- Renderers per kind, per disclosure level.
- Geometry hints and default sizes.
- Theme token contributions.

**Configuration** — declarative glue.
- View declarations (role assignments, layouts, defaults).
- Layer declarations.
- Disclosure schemas.
- Named queries.

MCP and headless consumers load only Schema; the canvas loads all three.

### 5.2 Required minimum (package loads and renders something)

1. **Package metadata**: `id`, `name`, `version`, `description`, optional `dependsOn`, optional `sourceUrl`.
2. **Node-kind schemas**: for each kind, `id`, `propsSchema`, `idDerivation`.
3. **Edge-kind schemas**: for each kind, `id`, `propsSchema`, source/target kind constraints.
4. **At least one node renderer per kind**, minimum = `card` level: `(props, ctx) => JSX`.
5. **At least one view** declaring role assignments and a default layout.

### 5.3 Required for good defaults (package feels complete)

6. **Disclosure schema per node kind**: declarative per-level field selection (§6).
7. **Geometry hints**: default size, aspect ratio, min/max bounds, resize policy.
8. **Layer declarations**: named layers, default states, styling.
9. **Saved views**: named projections with camera, filter, layer states.

### 5.4 Optional but valuable

10. **Named MCP queries**: domain verbs over the graph (§10).
11. **Validation rules**: constraints pipelines want enforced (fails loud on violation).
12. **Theme tokens**: per-package palette/size vocabulary.
13. **Additional renderers**: `peek`, `open`, `deep` beyond the minimum `card`.
14. **Interaction hooks**: per-kind click/hover/dblclick overrides.

### 5.5 On-disk layout

```
packages/rust/
  package.json              ← metadata, dependsOn, version
  schema/
    kinds.ts                ← node + edge kinds, zod schemas
    id-derivation.ts
    validation.ts
  presentation/
    renderers/
      Type.tsx
      Trait.tsx
      Module.tsx
    geometry.ts
    theme.ts
  config/
    views/
      treemap.ts
      call-graph.ts
      ownership.ts
    layers.ts
    disclosure.ts
    queries.ts
  package.entry.ts          ← exports the three bundles
```

Not dogma. A small package may collapse files. What matters is the three-part separation at the module level.

### 5.6 Trust model

Packages ship code. Code runs. We take the **trusted components** path:

- Users explicitly install packages (like VS Code extensions, like tldraw shape plugins).
- Installed packages run with full canvas API access.
- No sandboxing in v1.
- The engine itself ships a small set of **declarative-only built-in kinds** (generic card, markdown block, table, badge, freeform region) that any package can reference instead of shipping its own component. This gives us a safe baseline and an expressive escape hatch.

This mirrors how every successful extensible developer tool in recent memory has shipped. Sandboxing is possible later; commits no design ground now.

### 5.7 Versioning and composition

- Packages are semver'd.
- Canvas manifest pins package versions.
- Packages may `dependsOn` other packages — e.g. a `quint` package might depend on a base `statechart` package that provides the statechart kind vocabulary and views.
- The engine validates at load time that all declared kinds resolve through the package graph.

### 5.8 What MCP sees of a package

MCP loads only Schema. It discovers:

- What node and edge kinds exist.
- Their prop schemas.
- The named queries the package exposes.

MCP never loads renderers. An agent asking "show me this" gets structured data back; visualization happens in the canvas, not in MCP.

## 6. Disclosure system

### 6.1 Four levels

| Level | When | Typical content |
|---|---|---|
| `peek` | Hover, very small zoom | Single-line identifier |
| `card` | Default at moderate zoom | Name + 2–4 summary fields |
| `open` | Click, or moderate zoom with "expand" intent | Full prop set, related items in small tables |
| `deep` | Inspector panel, "explore" intent | Everything, reverse-deps, transitive queries, source links |

No `edit` level in v1. Editing is out of scope; all authoring is MCP → source → pipeline.

### 6.2 Disclosure schema

Each kind declares a disclosure schema — a declarative description of what appears at each level:

```
kind: rust.type
peek:  [name]
card:  [name, kind_label, field_count, impl_count]
open:  [name, fields[].(name, type), methods[].(name, signature)]
deep:  [open fields, impls[], reverse_callers, transitive_owners, docstring, source_link]
```

The schema serves two audiences:

1. **The renderer**, which can reference it to pick fields automatically.
2. **The inspector panel**, which auto-generates a panel for any kind without a custom inspector, using the schema as its structure.

A kind may ship both a disclosure schema and custom-coded renderers; they compose. Most kinds will want the schema to drive the `open` and `deep` levels (since they are largely data display) and a custom renderer for `card` (since that's where visual identity lives).

### 6.3 Interaction model

Default interactions, engine-level:

- Hover a node → peek.
- Click → select; opens the inspector panel at `open` level.
- Double-click → focus (animate camera to fit); elevate to `open` level in-canvas.
- Shift-click or "explore" action → `deep` in the inspector.
- Click an aggregate badge → expand into a list of related nodes in the inspector.
- Cmd/Ctrl-click → open-in-editor (for kinds that declare a source link).

Packages override per kind when defaults don't fit.

### 6.4 Inspector panel

A right-side docked panel that renders the selected node's `open` content (or `deep` if requested). The inspector uses the same renderer component as the `open` level in-canvas, by default. Packages can ship a distinct inspector renderer for kinds where the in-canvas card and the inspector layout differ meaningfully.

Inspector supports navigation: clicking a related-item reference swaps the inspector to that node without changing the canvas selection. A breadcrumb / back-stack tracks the traversal.

## 7. Layers

### 7.1 Model

Layers are edge-kind filters with state.

```
Layer = {
  id:          string,
  name:        string,
  edgeKinds:   string[],   // which edge kinds populate this layer
  state:       'on' | 'peek' | 'off',
  opacity:     { on: 1.0, peek: 0.2 },   // conventional defaults
  style:       { color, lineStyle, zIndex }
}
```

A view declares which layers are in scope and their default states. The user toggles layers via a toolbar; toggles persist in the saved view or as a session override.

### 7.2 Three states, not two

- `on` — full prominence.
- `peek` — low opacity, still visible. The reason to keep a layer visible while not foregrounded.
- `off` — excluded from rendering.

The three-state model is what makes "hold context while focusing on one thing" work. Two-state (on/off) forces users to lose their bearings.

### 7.3 Cross-cutting decorators

Some visual concerns apply across all kinds regardless of layer: selection outline, diff badges (deferred), validation error underlines (for specs). These are cross-cutting decorators, applied by the engine in a final pass, after kind renderers. Packages do not implement them; packages expose flags that decorators consume.

### 7.4 Agent-contributed layers

An MCP agent performing analysis — "find circular dependencies," "trace error types," "audit Send bounds" — writes its result as a new layer under `layers/<agent-id>.json`. The layer is visible alongside pipeline-generated layers, stylable, toggleable. This is the main shape of AI-augmented analysis in Luminous.

## 8. Saved views

Saved views are the primary affordance for making the canvas teachable. One graph, many readings.

Each saved view is a single JSON file containing everything §4.8 lists. Packages ship defaults:

- Rust: "Treemap overview," "Call graph," "Ownership," "Concurrency audit," "Error flow."
- Quint: "Lifecycle statechart," "Action catalog," "Invariant map," "Reachable state (bounded)."
- Solid: "Component tree," "Reactivity DAG," "Store mutations," "Affordance map."

User-authored views sit alongside in `views/`. Naming is free; no enforced taxonomy.

A view file should be small enough (tens of lines) that users read it, edit it, and PR it when they want to contribute a canonical view to their team.

## 9. Canvas engine (cactus)

### 9.1 Commitment

Luminous commits to a **cactus-class** canvas engine: DOM-based node rendering, Solid-native reactivity, custom to Luminous's domain. No framework switch to React for tldraw; no base on Cytoscape / Sigma / Konva / PixiJS. The arguments are documented in the sanity-check; summarized:

- **Arbitrary per-kind components** force DOM rendering. Canvas/WebGL bases cannot host markdown blocks, interactive tables, sub-canvases, or live form fields without reinventing the browser.
- **Solid's fine-grained reactivity** is uniquely suited to a canvas where thousands of cells update independently.
- **tldraw and React Flow assume shapes we don't want** (whiteboard UX, data-flow editor). Adopting them means fighting their opinions.

### 9.2 Required growth

Cactus-today does not yet support what this PDR commits to. The engine must grow in the following directions, each a tractable engineering scope:

1. **Viewport virtualization.** Only render nodes in-viewport. Prerequisite for every scale claim.
2. **Hybrid edge rendering.** Node bodies as DOM; edges as SVG or canvas overlay. Edges at scale in DOM are painful.
3. **Multi-pass render pipeline.** Substrate → contained children → layers → annotations → cross-cutting decorators → selection UI. Each pass is independently togglable and stylable.
4. **Pluggable layout dispatch.** Layouts are pure functions behind a registry. Treemap, dagre, elk, force, manual. Workers for heavy cases.
5. **Zoom-as-reactive-signal.** Renderers read a zoom signal; no imperative re-render orchestration.
6. **Containment coordinate systems.** Parent-relative positions, transform composition, hit-testing aware of nesting.
7. **Per-view position storage.** Position overrides keyed on `(view_id, node_id)`, loaded with the active view.
8. **Kind-aware input layer.** Click/hover/dblclick dispatch consults the hit kind and lets the package's interaction hooks run before defaults.

### 9.3 Libraries, not engines

Adopted as dependencies:

- `d3-zoom` — already in use. Keep.
- `d3-hierarchy` — treemap, pack, partition. Pure math.
- `elkjs` — layered layout. Runs in a worker.
- `dagre` — simpler DAG layout when elk is overkill.
- `d3-force` — force-directed simulation when structure is weak.

These are pure functions. None of them renders; none of them owns the engine loop.

### 9.4 Solid as a deliberate tradeoff

Solid's thin ecosystem means Luminous owns more of the engine than a React-based project would. This cost is accepted in exchange for fine-grained reactivity that materially improves canvas performance at scale.

### 9.5 Deferred

- **WebGL hybrid rendering.** Rejected as a v1 concern. The requirement that would force it — rendering 10k+ nodes simultaneously in a way a user could glean information from — has been explicitly deprioritized. A user who asks for "everything at once" is asking for a broken UX, and a well-designed view will always aggregate first.
- **Excalidraw-style freeform drawing.** The annotation track supports regions, notes, arrows — not general pen drawing. Can be added later without engine rework.

## 10. MCP surface

### 10.1 Four verbs

The MCP surface is intentionally narrow:

- **`graph.query(pattern)`** — pattern-match over node/edge kinds and props. Returns IDs plus requested fields.
- **`graph.inspect(node_id, level)`** — return the disclosure payload at `card`, `open`, or `deep`. Used by agents to get the same rich content the inspector panel shows.
- **`layer.write(layer_id, {nodes?, edges?})`** — agent contributes its own layer. Agents cannot write to substrate or to layers owned by other agents. Writes include agent ID as provenance.
- **`query.named(package, query_name, args)`** — invoke a package-exposed named query (e.g. `rust.callers-of(node)`, `quint.reachable-states(init, depth)`). These are the domain verbs.

### 10.2 No dump

There is explicitly no `graph.dump()` or `graph.all()`. The rationale: dump-style access encourages agents to re-index the graph client-side on every call, which is slow, stale, and wasteful. Queries are cheap; dumps are not.

This is the same lesson as LSP vs. "parse the whole project yourself," and it generalizes to any AI-queryable knowledge base.

### 10.3 Provenance

Every write records:
- `author` — agent ID or user session ID.
- `timestamp`.
- `source_doc` — which file the write targets.

Reads carry provenance forward: any node/edge returned includes its `source_doc` so the caller knows who produced it.

### 10.4 Named queries as the extensibility seam

The interesting AI verbs are almost always domain-specific. A generic `graph.query` can express them but is verbose. Packages expose named queries — small, curated functions — that agents invoke by name:

- `rust.callers-of(fn)` → list of callers.
- `rust.types-holding(pattern)` → types whose field types match.
- `quint.invariants-violated-by(trace)` → invariants a trace breaks.
- `solid.high-rate-writers()` → stores updating at >30Hz.

Each named query is documented in the package's schema and discoverable via an MCP introspection call. This is the primary way the domain language grows.

## 11. Pipeline contract

### 11.1 Obligations

A pipeline, to integrate with Luminous:

1. **Ingests source artifacts.** File globs, git repos, whatever the domain dictates.
2. **Emits substrate + layer docs** conforming to the kind packages it ships or depends on.
3. **Ships a kind package** (or depends on one) covering every kind it emits.
4. **Provides ID derivation** for every node kind it emits. Determinism is mandatory.
5. **Supports regeneration.** Re-running the pipeline on unchanged source must produce byte-identical output (modulo ordering). Re-running on changed source must preserve IDs for unchanged entities.
6. **Reports failures structurally.** Pipeline errors land as a `pipeline-error` node kind with `source_doc`, `message`, `span` — visible in the canvas as an error node, not a console message the user has to hunt for.

### 11.2 Pipeline shape

A pipeline is an executable (likely Node or Python) that reads source and writes canvas docs. The interface is files in, files out. Pipelines are not long-running services; they can be invoked on save (via a watcher) or on demand (via a CLI command).

### 11.3 Spec-class conventions

Spec pipelines (Quint, XState sidecars, TLA+ when supported, JSON Schema) benefit from two conventions beyond the core contract:

- **`rationale` fields.** States, transitions, invariants, and actions carry a `rationale` string. Pipelines propagate it from source comments where present. Renderers expose it in `open` level. Without rationale, statecharts are sterile; with it, every transition carries its design justification in-canvas.
- **Verification-results layers.** Running an external checker (Quint simulator, TLC, Alloy Analyzer) emits a layer under `layers/verification-<tool>.json`. Reachable states, violated invariants, counterexample traces land as annotated overlays. This is the main form of feedback from formal tools inside the canvas.

Both are conventions, not engine features. The engine does nothing special for spec pipelines.

### 11.4 Minimum viable pipelines (MVP roster)

In priority order for v1:

1. **Solid component + reactivity pipeline** — the existing Milestone 1 work, upgraded to emit kind-packaged output.
2. **XState / statechart pipeline** — reads an XState sidecar JSON, emits statechart nodes and transitions with `rationale` support.
3. **Rust pipeline** — module treemap substrate plus owns/borrows/calls/implements layers. Member zoom deferred.
4. **Quint pipeline** — leveraging Quint's IR. Emits states, actions, invariants.

Pipelines beyond this list are welcome but non-blocking.

## 12. Workflow classes

### 12.1 The single workflow

All pipelines share one shape:

```
source artifacts ↔ pipeline ↔ canvas docs ↔ engine ↔ views
                                         ↕
                                       MCP
```

### 12.2 Code class

- Source authored by humans in editors, by compilers, by existing tooling.
- Pipeline runs on save or on demand.
- Luminous visualizes; human navigates and reasons.
- MCP queries on behalf of agents answering user questions about the codebase.

### 12.3 Spec class

- Source authored by MCP agents writing to Quint / XState sidecar / spec JSON files.
- Human reviews the canvas; rarely tweaks small things in source (treated like Tailwind-level edits).
- Pipeline watches source, re-ingests.
- MCP queries and writes; named queries like "propose a new state" or "suggest an invariant" are package-scoped conversational authoring moves mediated through source-file writes.

### 12.4 What's genuinely shared

- Property graph model.
- View layer.
- Canvas engine.
- MCP query/inspect surface.
- Disclosure system.
- Layer system.
- Saved views.

### 12.5 What's domain-specific (and belongs in packages, not the engine)

- Kind vocabulary.
- Renderers.
- Default views.
- Layout choices.
- Named queries.
- Conventions like `rationale` or verification layers.

This is the reason kind packages are the central extensibility primitive: they carry every domain-specific commitment.

## 13. Reference projections

The vocabulary of views that pipelines ship. These are the "materialized summaries" the formal-methods conversation referenced. Each is a standard kind of projection with a standard set of role assignments and layout.

| Projection | Answers | Containment | Arrow | Aggregate | Layout |
|---|---|---|---|---|---|
| **Treemap** | What is inside what, by size? | `contains-*` | none | fields[] | treemap |
| **Call / dataflow graph** | What flows where? | none | `calls` / `flows-to` | none | dagre / elk |
| **Statechart** | What are the phases and transitions? | `substate-of` | `transitions-to` | `guards`, `invariants` | hierarchy |
| **Action catalog** | What can happen, and under what preconditions? | none | none | `preconditions`, `effects` | table-like |
| **Invariant map** | What must always be true? | none | `constrains` | `variables-mentioned` | force + clusters |
| **Variable × action matrix** | Which actions touch which variables? | none | none | `reads`, `writes` | matrix |
| **Counterexample trace** | Show me the failure concretely | none | `next-step` | state values | linear |
| **Reachable state graph** | What states are reachable, bounded? | none | `transition` | none | force |
| **Rule / provenance tree** | Why does this derived fact exist? | `derives-via` | none | none | hierarchy |
| **Component tree** | What renders what? | `contains-component` | `consumes-store` | affordances | hierarchy + overlay |

These aren't engine features. They're saved views shipped by the relevant packages, expressed in the role system. A new projection is a new saved view; the engine already supports it.

## 14. What is deferred

These capabilities are intentionally out of scope for v1. Documenting them here prevents re-litigation and signals that the architecture is designed to absorb them later without overhaul.

- **Editor mode / round-trip.** No in-canvas editing of kind-node content in v1. All authoring is MCP → source → pipeline. When editor mode is introduced later, it adds an `edit` disclosure level and an "emit direction" to the pipeline contract; nothing upstream changes.
- **Derived-facts / datalog escape hatch.** A rule layer that derives edges from edges. Useful when queries want transitive closures or pattern-matched synthesis. Not needed for v1.
- **Live verification overlays.** Static verification-results layers are in v1. Live / continuous verification with in-canvas feedback as source changes is deferred.
- **Diff mode.** Two canvas snapshots diffed, added/removed/changed rendered as cross-cutting decorators. Architecture supports it; not in v1.
- **LSP bridge.** Bidirectional selection between editor and canvas. Valuable for code class; deferred.
- **Canvas thumbnail mode.** WebGL rendering for nodes below a visual size threshold, promoting to DOM when interactive. Only needed if a view is asked to render 10k+ simultaneous nodes — explicitly not a v1 requirement.
- **Multi-user collaborative editing.** Yjs is in place from the unfolding PDR, but collaborative authoring is not a v1 surface. Read-only Yjs sync for watch-together sessions is plausible but not committed.
- **Sandboxed package execution.** Trust model is explicit install in v1. Sandboxing becomes relevant when package ecosystems grow; architecture makes no commitments that preclude it.
- **Sub-canvas navigation.** A node whose body is a whole other canvas. Architecture supports it via `canvas_ref` on a node; UX for traversal and back-navigation is deferred.

## 15. Open questions

Questions answered in this PDR:

- *Property graph or flat list?* → Property graph at the contract level; flat list reserved as an export format.
- *Storage shape?* → Multi-document JSON on disk; in-memory indexed structure; SQLite as optional derived cache.
- *How does containment work?* → Edges with `contain` role, per-view assignment, acyclic, one per view.
- *What does a pipeline ship?* → A kind package with schema, presentation, configuration.
- *Trust model?* → Trusted components, explicit install, declarative fallback for built-ins.
- *Read or read-write?* → Read-only in v1.
- *Canvas engine?* → Cactus-class; DOM-based, Solid-native, custom, with named growth targets.

Questions still open — to be resolved in follow-on ADRs:

1. **Kind closure.** Is the kind universe for a canvas strictly the union of loaded packages, or are ad-hoc kinds (for freeform user scribbles) allowed outside any package? Lean strict; confirm.
2. **View inheritance.** Can a saved view extend another (base view + overrides)? Probably yes, but the composition semantics need pinning.
3. **Query language surface.** A textual DSL, a JSON pattern, or both? Named queries sidestep this for common cases, but an ad-hoc query path is needed for the filter surface.
4. **Rename detector policy.** How aggressive? What signals? When does it ask the user vs. act silently? Needs tuning on the first real pipeline.
5. **Package distribution.** Git-based install? npm-like registry? Single-repo bundling for v1 with distribution deferred is likely.
6. **Per-view renderer override composition.** If a view says "use renderer X for kind Y," and the package ships renderer Z, what's the precedence? And what are the user-overridable hooks?

## 16. First milestone and implementation sequence

The work is sequenced so each step earns its place against the next.

**Step 1 — Data model lift.** Internal conversion of the current canvas format to the property-graph shape. No file-format break yet; existing canvases load through a migration layer that synthesizes kinds from old node/edge fields. This is table stakes.

**Step 2 — Multi-document composition.** Introduce substrate / annotations split on one concrete use case (the Solid pipeline). Prove that regeneration does not clobber user annotations. Highest-value split; lowest-risk to prototype.

**Step 3 — Kind package scaffolding.** A minimal kind package with schema, a single renderer, one view. Used to wrap the Solid pipeline's current output. Proves the contract end-to-end.

**Step 4 — View semantics with roles.** Ship the role system and a second view for the Solid canvas — e.g., a reactivity-DAG view alongside the component tree. Two views over one graph: if this works, the core commitment is proven.

**Step 5 — Disclosure system.** Ship `peek` / `card` / `open` levels and the inspector panel, driven by zoom and click. No `deep` yet.

**Step 6 — Layers.** Introduce the layer system; populate one or two layers from the Solid pipeline (consumption edges, high-rate writers). Toggle them.

**Step 7 — MCP surface.** Implement the four verbs. Point a coding agent at it and ask domain questions. Verify that no `graph.dump` temptation appears in practice.

**Step 8 — Second pipeline.** XState / statechart is the natural next target: small domain, standard sidecar JSON, large benefit per unit effort. Validates that the architecture isn't shaped only to Solid.

**Step 9 — Stable IDs hardened.** Rename detector with `prev_ids`. Run the pipeline on a real refactor; confirm user positions survive.

**Step 10 — Rust pipeline at module + type zoom.** The hard test — scale, multiple layers, treemap substrate, multi-view. Member zoom deferred.

Past step 10, the architecture is load-bearing and the work becomes incremental: more pipelines, richer views, more named queries.

## 17. Prior art referenced

Acknowledged influences, each contributing a specific pattern Luminous inherits:

- **Alloy Analyzer's theme system** (MIT, Daniel Jackson et al.). The most direct precursor for the view layer: raw instance graphs projected into readable domain diagrams via declarative per-signature theming. Read their docs before finalizing view APIs.
- **XState Viz / Stately.ai.** Gold standard for Harel statechart rendering. A reference implementation for the statechart kind renderer in the Quint / XState package.
- **tldraw's `ShapeUtil` system.** The model for kind packages: serializable records + pure components + declared geometry + per-type interaction. Close study recommended; divergences noted (we don't need the whiteboard tool palette).
- **Kumu's project / map / view separation.** The three-layer architecture that maps 1:1 onto substrate / canvas / saved view.
- **Neo4j Bloom, Cytoscape.js, Sigma.js.** Informative as counter-examples — they show why "style rules over uniform primitives" falls short of per-kind components.
- **Soufflé provenance trees.** The pattern for rule/derivation visualizations; reusable for Datalog or any rule-based spec.
- **Will Schultz's tla-web.** The reference for counterexample trace navigation.
- **Runway (Salesforce, Brandon Bloom).** Early demonstration that formal distributed-system models could be visual design artifacts; spiritual ancestor of Luminous's spec-class workflows.
- **VS Code custom editors.** The precedent for "extension ships code, user explicitly installs, code runs with first-class access." Our trust model mirrors this exactly.
- **LSP.** The architectural precedent for "agents query rather than parse." MCP's design inherits the same principle.
- **Unfolding PDR, [doc02.01].** The PDR this one builds on. Polymorphic nodes, freeform edges, server-as-storage, willing-to-delete all carry forward.

## 18. Closing stance

This PDR is a structural commitment, not a feature list. Every decision is chosen to be the one that compounds: once the property graph is the contract, every pipeline gets the same view layer for free; once role-based views are the mechanism, every new projection is a saved view, not an engine feature; once kind packages are the extensibility primitive, adding a new domain never requires modifying the engine.

The architecture is built to be re-entered. When the forces shift — when editor mode becomes necessary, when scale demands WebGL, when a new formal-methods tool becomes important — the changes land in known places. Nothing in this design is precious except the shape of the contract.

The software implements the product, and nothing else.
