---
title: Pack examples
summary: RTP, flowchart, Solid app, React app, Rust app — what each pack declares, what views each wants, and what falls out as Luminous's universal contract.
tags: [pack, examples, reference, contract]
deps: [doc02.14, doc02.16, doc02.17]
---

# Pack examples

Five concrete pack designs that span the range of domains Luminous targets. Each entry names the source artifact a pipeline consumes, the node and edge kinds the pack declares, the views the pack ships, and the renderer primitives the pack composes. The final section synthesizes what falls out as the universal contract Luminous holds for all packs.

These examples are reference designs, not implementation status. See [doc02.14](14-pack-contract.md) for the pack contract and [doc02.16](16-renderer-engine.md) for the renderer engine.

---

## 1. RTP statechart + concepts

The canonical case, fully specified in [doc02.10.03](10-examples/03-rtp-statechart-canvas.md).

**Source artifacts.** An XState v5 navigation chart and a Jackson concept inventory in markdown.

**Node kinds.** `statechart.region`, `statechart.composite`, `statechart.state`, `statechart.transition`, `rtp.concept`, `rtp.action`.

**Edge kinds.** `substate-of`, `transitions-to`, `invokes-action`, `belongs-to-concept`.

**Views.**

| View | Spatial kinds | `contain` | `arrow` | `summary` | Hidden |
|---|---|---|---|---|---|
| Statechart | region, composite, state | `substate-of` | `transitions-to` | `invokes-action` | concept, action, `belongs-to-concept` |
| Concept coverage | concept, action | `belongs-to-concept` | — | `invokes-action` | statechart kinds |

**Renderer primitives.** `card`, `text`, `badge` (for `meta.surface`), `kv-list` (for `meta.reads`), `markdown` (description), `if` (gate the reads list on non-empty), `chip` (for summary-edge endpoints).

**Diagnostics.** Orphan actions (no incoming `invokes-action`), unreachable states (no incoming `transitions-to`).

---

## 2. Generic flowchart

The simplest case, and the one that forces the shape question.

**Source artifacts.** Hand-authored property graph, Mermaid `flowchart` text, or BPMN-lite.

**Node kinds.** `flow.start`, `flow.end`, `flow.process`, `flow.decision`, `flow.subprocess`, `flow.data`, `flow.note`.

**Edge kinds.** `flow.flow` (with optional `content.label` like "yes" / "no" on decision branches), `flow.references` (call into a subprocess).

**Views.**

| View | Spatial kinds | `contain` | `arrow` | Notes |
|---|---|---|---|---|
| Flow | all flow kinds except `note` | — | `flow.flow` | Notes appear as latent annotations near their target |
| Swimlane | same | — | `flow.flow` | Layout groups by `content.owner` or `content.lane` |
| Subprocess focus | one chosen subprocess + its expansion | — | `flow.flow` | Other subprocesses as latent chips |

**Renderer primitives.** `card` with `shape`: rectangle for `process`, diamond for `decision`, pill for `start`/`end`, parallelogram for `data`, sticky-note for `note`. Plus `text` for labels.

**Diagnostics.** Decisions with fewer than two outgoing edges; dead-end nodes that are not `end`; cycles (often intentional but worth surfacing).

The flowchart pack is the smallest exercise of the shape primitive. A pack that supports only the flowchart view exercises the full contract with no AST pipeline involved.

---

## 3. Generic Solid application

The motivation for Luminous's first milestone.

**Source artifacts.** TypeScript / TSX over a Solid codebase, analyzed via the TypeScript compiler API.

**Node kinds.** `solid.component`, `solid.signal`, `solid.memo`, `solid.effect`, `solid.store`, `solid.resource`, `solid.datasource` (external API or imported fetch), `solid.context`, `solid.route`.

**Edge kinds.** `solid.renders` (component → component), `solid.creates` (component → signal/memo/effect/store/resource), `solid.reads` (memo/effect → signal/store), `solid.writes` (component/effect → signal), `solid.provides-context` (component → context), `solid.consumes-context` (component → context), `solid.fetches` (component/resource → datasource).

**Views.**

| View | Purpose | `contain` | Arrows | Latent |
|---|---|---|---|---|
| Component tree | "What renders what?" | `solid.renders` | — | signals as chips on parent |
| Reactivity | "What flows from where?" | `solid.creates` | `solid.reads`, `solid.writes` | components, visible as containing frames |
| Data flow | "Where does external data enter?" | — | `solid.fetches` | everything not on a fetch path |
| Project summary | "Everything in one picture" | `solid.creates` | `solid.reads`, `solid.writes`, `solid.fetches` | none |

The project summary view is the milestone-1 deliverable: components colored one way, signals another, datasources a third, signals pointing to their consumers via distinct edge colors. The view's role table expresses exactly this.

**Renderer primitives.** `card`, `text`, `badge` (signal type, prop count), `kv-list` (props), `code-block` (signal init expression), `if` (gate props block on non-empty), `chip`.

**Diagnostics.** Orphan signals (created but never read), unstable memo deps, effects with no read set, prop-drilling depth.

---

## 4. Generic React application

Similar substrate to Solid, different idioms.

**Source artifacts.** TypeScript / TSX over a React codebase.

**Node kinds.** `react.component`, `react.hook` (`useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`), `react.custom-hook`, `react.context`, `react.store` (Redux, Zustand, Jotai), `react.datasource`, `react.route`.

**Edge kinds.** `react.renders`, `react.uses-hook` (component → hook), `react.composes` (custom-hook → primitive-hook), `react.depends-on` (effect → state, from deps array), `react.provides-context`, `react.consumes-context`, `react.fetches`.

**Views.**

| View | Purpose |
|---|---|
| Component tree | Same shape as Solid's component tree |
| Hook usage | Bipartite: components on one side, hooks on the other. Surfaces god-components |
| Custom hook composition | Custom hooks as containers, primitive hooks nested inside |
| Effect graph | `useEffect` nodes with `depends-on` edges; surfaces missing deps as a diagnostic layer |
| Context flow | Providers, consumers, the path between them |

**Renderer primitives.** Same as Solid, plus a `deps-array` rendering (a compact comma-separated chip strip for inline deps).

**Diagnostics.** Exhaustive-deps violations, context providers consumed nowhere, hooks called conditionally (rule-of-hooks violations).

---

## 5. Rust application

The largest substrate shift — no reactivity, no rendering. Pure types, traits, modules.

**Source artifacts.** rust-analyzer or `syn`-based static analysis.

**Node kinds.** `rust.crate`, `rust.module`, `rust.struct`, `rust.enum`, `rust.trait`, `rust.impl`, `rust.function`, `rust.type-alias`, `rust.macro`, `rust.lifetime`.

**Edge kinds.** `rust.contains` (crate → module → item), `rust.implements` (impl → trait, impl → struct/enum), `rust.uses-type` (function/struct → type), `rust.calls` (function → function), `rust.bound-by` (generic param → trait), `rust.re-exports` (module → item).

**Views.**

| View | Purpose | `contain` | Arrows |
|---|---|---|---|
| Module tree | Crate / module / item hierarchy | `rust.contains` | — |
| Trait coverage | Bipartite: traits on one side, types on the other | — | `rust.implements` |
| Call graph | Function-to-function, often huge, filtered by module via query | — | `rust.calls` |
| Type dependency | Which functions use which types | — | `rust.uses-type` |
| Boundary | Public surface of each module | `rust.contains` | `rust.re-exports`, `rust.uses-type` filtered to cross-module |

**Renderer primitives.** `card`, `text`, `badge` (visibility — `pub`, `pub(crate)`), `kv-list` (struct fields), `code-block` (function signature, with `language: "rust"`), `markdown` (doc comment). Disclosure levels let a struct card collapse its fields into a count badge or expand them into the full kv-list.

**Diagnostics.** Orphan traits (no impls), god-objects (high type-usage count), circular module deps, dead code (no incoming `calls` and not `pub`).

---

## What the examples agree on

Tabulating across all five packs, the shared shape of the universal contract emerges.

### Universal requirements

| Capability | Required because |
|---|---|
| Property graph with `kind`/`content` on nodes and edges | All five |
| `packs[]` declaration per graph file | Each example loads a different pack |
| Per-view `(node-kind, edge-kind) → role` tables | Every view in every example |
| Layout algorithms: hierarchical (ELK), grid, force-directed, bipartite, swimlane | Different views need different layouts |
| Per-view containment derived from one edge kind | Every primary view has a `contain` role |
| Renderer primitive vocabulary: text, badge, icon, kv-list, markdown, code-block, vstack, hstack, card-with-shape, conditional, for-each | All five |
| Disclosure levels (collapsed / expanded body) | Solid signal init, Rust struct fields, RTP `meta.reads` |
| Theme-token colors per kind | All five |
| Diagnostic layers (orphans, cycles, rule violations) | Every example has characteristic diagnostics |
| Per-view layer enablement with opacity | RTP layers, Rust visibility filters |
| Cross-domain string-reference resolution at pipeline time | RTP transitions → concept actions; React effects → hooks; Rust uses-type |
| Default rendering for unknown kinds | A graph without a registered pack still renders legibly |

### Two non-obvious requirements

**Shape is non-trivial.** Flowcharts force diamonds, pills, and parallelograms. The renderer engine treats shape as an attribute of the `card` container ([doc02.16](16-renderer-engine.md)) rather than as separate primitives, so a node's outline lives with the node's renderer JSON and inherits all its content rendering.

**Latent is the trickiest visibility mode.** The Solid reactivity view renders components as containing frames around their signals, not as standalone cards. The RTP concept-map view renders actions as chips on `summary` edges, not as cards. Latent means "render only via summary edges, never as a standalone primary node," and the projection engine surfaces it as an explicit visibility class — neither spatial nor hidden, but a third state.

### What the examples agree Luminous does NOT do

- **Parse source code.** Each language pack ships its own pipeline (TypeScript compiler API, rust-analyzer, etc.).
- **Re-resolve string references.** Pipelines produce graphs with resolved ids; Luminous reads ids verbatim.
- **Author domain-specific layouts.** A swimlane is bipartite-with-labeled-rows; ELK with constraints handles it. The pack's view spec parameterizes the algorithm; Luminous offers the algorithm.
- **Live re-analysis.** Pipelines emit one-shot. Re-running a pipeline produces a new graph file. Watcher integration is a pipeline concern, not Luminous's.

### The QueryBar pressure

Several examples — Rust call graphs, React effect graphs, Solid component summaries on large apps — exceed what view-switching and layer-toggling can handle alone. Filtering by "only functions in module X" or "only effects depending on this specific signal" is a third orthogonal control: query.

The Luminous toolbar story is therefore: **ViewSwitcher** chooses the projection, **LayerToolbar** tunes which edges and diagnostic layers participate, **QueryBar** filters node identity within the active projection. The QueryBar consumes a pack's `namedQueries` (declared in the contract; see [doc02.14](14-pack-contract.md)). The decoration mechanism described in [doc02.17](17-projection-and-identity.md) renders query matches uniformly across all packs.

---

## The contract that holds across all five

A pack declares: kinds, edge kinds, views, layers, disclosure schemas, renderer JSON per kind. Optionally: custom primitives, named queries, a pipeline.

Luminous loads the graph, resolves the declared packs from the registry, interprets the active view's role table over the graph, runs the layout algorithm, renders nodes and edges by interpreting renderer JSON through the primitive vocabulary, and surfaces decorations from the active selection, pins, layer toggles, and query results.

Cactus paints geometry: positioned components, lines, labels. It receives a flat list of nodes and edges with positions and pre-interpreted render functions; it never inspects what is being rendered.

The five examples differ in every domain detail and agree on every architectural detail. The universal contract is what they agree on.
