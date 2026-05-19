# .carta/ Manifest

Machine-readable index for AI navigation. Read this file first, then open only the docs relevant to your query.

**Retrieval strategy:** See doc00.04 for AI retrieval patterns.

## Column Definitions

- **Ref**: Cross-reference ID (`docXX.YY.ZZ`)
- **File**: Path relative to title directory
- **Summary**: One-line description for semantic matching
- **Tags**: Keywords for file-path→doc mapping
- **Deps**: Doc refs to check when this doc changes
- **Refs**: Reverse deps — docs that list this one in their Deps (computed automatically)
- **Attachments**: Non-md files sharing the doc's numeric prefix. Sidecar artifacts that travel with the doc during structural operations. Purely filesystem-derived; not a frontmatter field.

Orphaned attachments (non-md files with no corresponding root .md) are reported as warnings on stderr during regeneration and do not appear in this table.

## 00-codex — Codex

| Ref | File | Summary | Tags | Deps | Refs | Attachments |
|-----|------|---------|------|------|------|-------------|

| doc00.00 | `00-index.md` | Meta-documentation — how to read this workspace | index, meta | — | — | — |
| doc00.01 | `01-about.md` | Why this workspace exists, how to read it, two-sources-of-truth theory | docs, meta, theory | — | — | — |
| doc00.02 | `02-maintenance.md` | Doc lifecycle — unfolding philosophy, development loop, versioning, epochs | docs, maintenance, philosophy | — | — | — |
| doc00.03 | `03-conventions.md` | Cross-reference syntax, frontmatter schema, file naming, writing style | docs, conventions | — | — | — |
| doc00.04 | `04-ai-retrieval.md` | How AI agents navigate this workspace — hierarchical retrieval, MANIFEST usage, token budgets | docs, ai, retrieval | — | — | — |

## 01-vision — Vision

| Ref | File | Summary | Tags | Deps | Refs | Attachments |
|-----|------|---------|------|------|------|-------------|

| doc01.00 | `00-index.md` |  |  | — | — | — |
| doc01.01 | `01-vision.md` | Luminous bridges human visual thinking and AI context — a canvas tool for software design that serves both | vision, visualization, canvas, software-design, ai-context | — | doc01.03.01, doc02.02, doc02.12, doc03.01, doc03.02, doc03.06 | — |
| doc01.02 | `02-background.md` | Why Luminous was split from Carta — separation of the docs system from the visualization tools | background, history, carta, split | doc02.01 | — | — |

### Milestones

| Ref | File | Summary | Tags | Deps | Refs | Attachments |
|-----|------|---------|------|------|------|-------------|

| doc01.03.00 | `03-milestones/00-index.md` |  |  | — | — | — |
| doc01.03.01 | `03-milestones/01-milestone-1.md` | Product milestones — what Luminous must do next, defined by what a user can do | milestones, vision, roadmap, pipeline, static-analysis | doc01.01, doc02.01 | doc02.10.01, doc03.05 | — |
| doc01.03.02 | `03-milestones/02-milestone-2.md` | Use Luminous alongside a real project to validate the tool and surface friction | milestones, dogfooding, tinyforum | doc01.03 | doc03.06 | — |

## 02-design — Design

| Ref | File | Summary | Tags | Deps | Refs | Attachments |
|-----|------|---------|------|------|------|-------------|

| doc02.00 | `00-index.md` | Product and software design — architecture decisions, concept inventory, API contracts, engine internals | design | — | — | — |
| doc02.01 | `01-pdr-unfolding-architecture.md` | Product decision record for transforming Luminous from schema-first to unfolding-first | pdr, architecture, unfolding, crystallization | doc02.01 | doc01.02, doc01.03.01, doc02.01, doc02.02, doc02.05.01, doc02.06.01, doc02.11, doc02.12, doc03.01, doc03.02, doc03.03, doc03.06 | — |
| doc02.02 | `02-concept-inventory.md` | Luminous concepts (Jackson framework) — Workspace, Document, Note, Edge, Nesting, Canvas, Selection, Schema, Formalization, Schema-Pair, Verification | concepts, design, jackson, formalization, unfolding | doc02.01, doc01.01 | doc02.03, doc02.04, doc03.02 | — |
| doc02.03 | `03-api-contract.md` | HTTP + WebSocket API for @luminous/server — document listing, reading, mutation actions, diagnostics, and change notifications | api, http, server, contract | doc02.02 | doc02.04 | — |
| doc02.04 | `04-mcp-design.md` | MCP architecture — config-driven, concept-grouped tools over HTTP. AI uses same action contract as browser client. | mcp, ai, api, tools, architecture | doc02.02, doc02.03 | doc02.15 | — |
| doc02.07 | `07-solidjs-pipeline-spec.md` | Node types, nesting rules, and edge semantics for the Solid.js static analysis pipeline | pipeline, solid, static-analysis, milestone-1 | doc01.03 | doc02.08, doc02.10.01 | — |
| doc02.08 | `08-edge-schemas.md` | Edge schema system — discriminated union, layoutRole, connection constraints, declarative routing (exitSide/enterSide), ancestor edge suppression, and the runtime filter pattern | edges, schemas, design, cactus-boundary | doc03.03, doc02.05.01, doc02.06.02, doc02.07 | doc02.10.02 | — |
| doc02.09 | `09-primitive-reference.md` | Enumerated reference for node primitives (drag-bar, title, markdown, container) with bind semantics and examples | primitives, schemas, reference, node | — | doc02.10.02 | — |
| doc02.11 | `11-pdr-property-graph-architecture.md` | Successor PDR committing Luminous to a property-graph contract, multi-document composition, per-view role semantics, packs, and a cactus-class Solid.js canvas engine. Supersedes parts of the unfolding PDR that assumed a single uniform node/edge list. | pdr, architecture, property-graph, packs, views, disclosure, canvas-engine | doc02.01 | doc02.10.03, doc02.14, doc02.15, doc02.16, doc02.17 | — |
| doc02.12 | `12-app-shell-statechart.md` | Statechart of Luminous's app shell — boot, picker, canvas-mounted, error, theme region. Boundary: app-shell only, canvas internals are a black box. | ui, statechart, app-shell, shell | doc02.01, doc01.01 | doc02.13 | app-shell.statechart.json |
| doc02.13 | `13-app-shell-component-tree.md` | Component tree of the app shell, derived from the statechart and six inventories. Canvas internals are not modeled here. | components, derivation, app-shell | doc02.12 | doc02.19 | — |
| doc02.14 | `14-pack-contract.md` | A pack is JSON data owned by the domain it describes, co-located with its graph as a sibling file. What a pack declares, how a graph names it, and how Luminous resolves it. | pack, contract, schema, data, co-location | doc02.11, doc02.16 | doc02.15, doc02.16, doc02.17, doc02.18, doc02.19, doc02.20 | — |
| doc02.15 | `15-mcp-iterative-graph-building.md` | Tool surface for AI agents to build and query property graphs iteratively — six tiers from CRUD to pack authoring, with layout policy and sync strategy. | mcp, ai, tools, graph, iteration | doc02.04, doc02.11, doc02.14 | — | — |
| doc02.16 | `16-renderer-engine.md` | Renderers are JSON over a primitive vocabulary; the engine interprets them; custom primitives are the code escape hatch. | renderer, primitives, pack, rendering | doc02.14, doc02.11 | doc02.14, doc02.18 | — |
| doc02.17 | `17-projection-and-identity.md` | Node identity persists across projections; decoration layers above projection; contain-per-view; animation between views falls out of identity stability. | projection, identity, view, animation, decoration | doc02.11, doc02.14 | doc02.18, doc02.19 | — |
| doc02.18 | `18-pack-examples.md` | RTP, flowchart, Solid app, React app, Rust app — what each pack declares, what views each wants, and what falls out as Luminous's universal contract. | pack, examples, reference, contract | doc02.14, doc02.16, doc02.17 | — | — |
| doc02.19 | `19-canvas-component-tree.md` | What lives inside the canvas — toolbars, view switcher, layer toolbar, context menus — derived from inventories of state, mutation rate, and ownership boundary. | canvas, chrome, component-tree, boundaries | doc02.13, doc02.14, doc02.17 | doc02.20 | — |
| doc02.20 | `20-chrome-schema.md` | Action records, menu and toolbar schemas, chrome slots; cactus owns chrome rendering, Luminous owns the schema producers, packs stay unchanged. | chrome, api, actions, menus, cactus, boundary | doc02.14, doc02.19 | — | — |

### Cactus Canvas Engine

| Ref | File | Summary | Tags | Deps | Refs | Attachments |
|-----|------|---------|------|------|------|-------------|

| doc02.05.00 | `05-cactus/00-index.md` |  |  | — | — | — |
| doc02.05.01 | `05-cactus/01-overview.md` | Architecture of the cactus canvas engine — layers, coordinate systems, DOM conventions, and design principles | cactus, canvas, engine, architecture, overview | doc02.01 | doc02.05.02, doc02.05.03, doc02.05.04, doc02.05.05, doc02.06.02, doc02.08, doc03.03 | — |
| doc02.05.02 | `05-cactus/02-api-contract.md` | Complete public API reference for the cactus canvas engine — components, hooks, types, and geometry utilities | cactus, canvas, api, components, hooks, types | doc02.05.01 | — | — |
| doc02.05.03 | `05-cactus/03-layout-primitives.md` | The layout algorithms cactus ships — tidyLayout, treeLayout, forceDirectedLayout, compositeLayout, dagLayout — with their contracts and when to use each | cactus, layout, algorithms | doc02.05.01 | doc02.05.04 | — |
| doc02.05.04 | `05-cactus/04-layout-engine-contract.md` | The LayoutEngine interface and mental model — how the domain layer produces constraints and cactus suggests positions | cactus, layout, architecture | doc02.05.01, doc02.05.03 | — | — |
| doc02.05.05 | `05-cactus/05-theme-token-contract.md` | The --cactus-* CSS custom property contract — the named slots cactus declares, its two shipped themes, and how consumers bring their own | cactus, theming, css, contract | doc02.05.01 | — | — |

### Architecture Decision Records

| Ref | File | Summary | Tags | Deps | Refs | Attachments |
|-----|------|---------|------|------|------|-------------|

| doc02.06.00 | `06-adr/00-index.md` | Significant architecture decisions with context, rationale, and consequences | adr, architecture | — | — | — |
| doc02.06.01 | `06-adr/01-solid-migration.md` | Architecture decision record for migrating Luminous client-next and cactus from React to Solid.js | adr, architecture, solid, react, performance, reactivity | doc02.01, doc02.05 | doc03.05 | — |
| doc02.06.02 | `06-adr/02-schema-discriminant.md` | ADR: Schema becomes a discriminated union NodeSchema | EdgeSchema with an optional kind field on the node variant for backwards compatibility | adr, schema, types, discriminant | doc03.03, doc02.05.01 | doc02.08 | — |

### Examples

| Ref | File | Summary | Tags | Deps | Refs | Attachments |
|-----|------|---------|------|------|------|-------------|

| doc02.10.00 | `10-examples/00-index.md` | Use cases that act as gauges for Luminous capabilities — each example defines features the product must enable | examples, gauges, use-cases | — | — | — |
| doc02.10.01 | `10-examples/01-solidjs-reference-graph.md` | Static analysis of a Solid.js codebase rendered as a canvas — components, signals, and their consumer edges (milestone 1) | examples, milestone-1, static-analysis, solid, pipeline | doc01.03.01, doc02.07 | — | — |
| doc02.10.02 | `10-examples/02-api-coverage-workbench.md` | Tri-layer canvas — OpenAPI controllers, JSON Schema aggregate, SQL tables — coverage edges reveal data-flow gaps | examples, openapi, json-schema, sql, coverage, gap-analysis | doc02.08, doc02.09 | — | — |
| doc02.10.03 | `10-examples/03-rtp-statechart-canvas.md` | Worked example. RankThePlanet (RTP) hands Luminous a navigation statechart and a concept inventory; Luminous renders both as one property graph with two views (statechart shape, concept-coverage shape). | examples, statechart, xstate, concepts, rtp, property-graph | doc02.11 | — | concepts.json, concepts.markdown, navigation.statechart.json |

## 03-research-sessions — Research Sessions

| Ref | File | Summary | Tags | Deps | Refs | Attachments |
|-----|------|---------|------|------|------|-------------|

| doc03.00 | `00-index.md` | Exploratory conversations and synthesis — technology evaluation, architectural thinking, cross-domain pattern recognition | research, exploration | — | — | — |
| doc03.01 | `01-declarative-paradigms-synthesis.md` | Research session on how declarative/structured software paradigms (Solid.js, ECS, Rust, SQL, etc.) align with the mission of making software artifacts legible to both humans and AI | research, solid, architecture, reactive, ecs | doc01.01, doc02.01 | doc03.05 | — |
| doc03.02 | `02-modeling-workbench.md` | Research session exploring how Luminous evolves from concept-driven design to a general modeling workbench — vocabulary building, progressive formalization, and verification across multiple modeling formalisms | research, modeling, concepts, formalization, verification, vocabulary | doc01.01, doc02.01, doc02.02 | — | — |
| doc03.03 | `03-node-data-architecture.md` | Research session deriving Luminous's node data model from prior art (tldraw, Notion, Excalidraw, React Flow, Bevy ECS) — separation of structure/content/schema, flat storage with parent pointers, and graceful schema degradation | research, architecture, data-model, ecs, bevy, tldraw, notion, schema, nodes | doc02.01, doc02.05.01 | doc02.06.02, doc02.08 | — |
| doc03.04 | `04-visual-perception-research.md` | Research synthesis on cognitive load theory, Gestalt principles, node-link diagram effectiveness, and information visualization best practices — applied to Luminous canvas pipelines | research, visualization, perception, cognitive-load, gestalt, pipelines | doc02.05 | — | — |
| doc03.05 | `05-reference-graphs-and-ui-frameworks.md` | Research session synthesizing the browser rendering pipeline, Solid's reactive primitives, Qwik's resumability, and the framing of UI frameworks as DSLs over a live reference graph — with implications for Milestone 1's static analysis pipeline | research, reactivity, solid, qwik, rendering, pipeline, reference-graph, dsl | doc01.03.01, doc02.06.01, doc03.01 | — | — |
| doc03.06 | `06-tinyforum-as-shared-ai-context.md` | Framing Milestone 2: Luminous makes tinyForum easier to build with AI by producing artifacts that humans read spatially and AI agents read as rich structured context — canvases as the shared medium between both consumers | research, tinyforum, milestone-2, dogfooding, ai-context, canvas, mcp | doc01.01, doc01.03.02, doc02.01 | — | — |
| doc03.07 | `07-semantic-zoom-counterscale.md` | Research on level-of-detail semantic zoom and counter-scaled text — how to guarantee canvas text legibility under d3-zoom geometric scaling | research, semantic-zoom, zoom, typography, legibility, cactus | doc02.05 | — | — |

## Tag Index

Quick lookup for file-path→doc mapping:

| Tag | Relevant Docs |
|-----|---------------|
| `actions` | doc02.20 |
| `adr` | doc02.06.00, doc02.06.01, doc02.06.02 |
| `ai` | doc00.04, doc02.04, doc02.15 |
| `ai-context` | doc01.01, doc03.06 |
| `algorithms` | doc02.05.03 |
| `animation` | doc02.17 |
| `api` | doc02.03, doc02.04, doc02.05.02, doc02.20 |
| `app-shell` | doc02.12, doc02.13 |
| `architecture` | doc02.01, doc02.04, doc02.05.01, doc02.05.04, doc02.06.00, doc02.06.01, doc02.11, doc03.01, doc03.03 |
| `background` | doc01.02 |
| `bevy` | doc03.03 |
| `boundaries` | doc02.19 |
| `boundary` | doc02.20 |
| `cactus` | doc02.05.01, doc02.05.02, doc02.05.03, doc02.05.04, doc02.05.05, doc02.20, doc03.07 |
| `cactus-boundary` | doc02.08 |
| `canvas` | doc01.01, doc02.05.01, doc02.05.02, doc02.19, doc03.06 |
| `canvas-engine` | doc02.11 |
| `carta` | doc01.02 |
| `chrome` | doc02.19, doc02.20 |
| `co-location` | doc02.14 |
| `cognitive-load` | doc03.04 |
| `component-tree` | doc02.19 |
| `components` | doc02.05.02, doc02.13 |
| `concepts` | doc02.02, doc02.10.03, doc03.02 |
| `contract` | doc02.03, doc02.05.05, doc02.14, doc02.18 |
| `conventions` | doc00.03 |
| `coverage` | doc02.10.02 |
| `crystallization` | doc02.01 |
| `css` | doc02.05.05 |
| `data` | doc02.14 |
| `data-model` | doc03.03 |
| `decoration` | doc02.17 |
| `derivation` | doc02.13 |
| `design` | doc02.00, doc02.02, doc02.08 |
| `disclosure` | doc02.11 |
| `discriminant` | doc02.06.02 |
| `docs` | doc00.01, doc00.02, doc00.03, doc00.04 |
| `dogfooding` | doc01.03.02, doc03.06 |
| `dsl` | doc03.05 |
| `ecs` | doc03.01, doc03.03 |
| `edges` | doc02.08 |
| `engine` | doc02.05.01 |
| `examples` | doc02.10.00, doc02.10.01, doc02.10.02, doc02.10.03, doc02.18 |
| `exploration` | doc03.00 |
| `formalization` | doc02.02, doc03.02 |
| `gap-analysis` | doc02.10.02 |
| `gauges` | doc02.10.00 |
| `gestalt` | doc03.04 |
| `graph` | doc02.15 |
| `history` | doc01.02 |
| `hooks` | doc02.05.02 |
| `http` | doc02.03 |
| `identity` | doc02.17 |
| `index` | doc00.00 |
| `iteration` | doc02.15 |
| `jackson` | doc02.02 |
| `json-schema` | doc02.10.02 |
| `layout` | doc02.05.03, doc02.05.04 |
| `legibility` | doc03.07 |
| `maintenance` | doc00.02 |
| `mcp` | doc02.04, doc02.15, doc03.06 |
| `menus` | doc02.20 |
| `meta` | doc00.00, doc00.01 |
| `milestone-1` | doc02.07, doc02.10.01 |
| `milestone-2` | doc03.06 |
| `milestones` | doc01.03.01, doc01.03.02 |
| `modeling` | doc03.02 |
| `node` | doc02.09 |
| `nodes` | doc03.03 |
| `notion` | doc03.03 |
| `openapi` | doc02.10.02 |
| `overview` | doc02.05.01 |
| `pack` | doc02.14, doc02.16, doc02.18 |
| `packs` | doc02.11 |
| `pdr` | doc02.01, doc02.11 |
| `perception` | doc03.04 |
| `performance` | doc02.06.01 |
| `philosophy` | doc00.02 |
| `pipeline` | doc01.03.01, doc02.07, doc02.10.01, doc03.05 |
| `pipelines` | doc03.04 |
| `primitives` | doc02.09, doc02.16 |
| `projection` | doc02.17 |
| `property-graph` | doc02.10.03, doc02.11 |
| `qwik` | doc03.05 |
| `react` | doc02.06.01 |
| `reactive` | doc03.01 |
| `reactivity` | doc02.06.01, doc03.05 |
| `reference` | doc02.09, doc02.18 |
| `reference-graph` | doc03.05 |
| `renderer` | doc02.16 |
| `rendering` | doc02.16, doc03.05 |
| `research` | doc03.00, doc03.01, doc03.02, doc03.03, doc03.04, doc03.05, doc03.06, doc03.07 |
| `retrieval` | doc00.04 |
| `roadmap` | doc01.03.01 |
| `rtp` | doc02.10.03 |
| `schema` | doc02.06.02, doc02.14, doc03.03 |
| `schemas` | doc02.08, doc02.09 |
| `semantic-zoom` | doc03.07 |
| `server` | doc02.03 |
| `shell` | doc02.12 |
| `software-design` | doc01.01 |
| `solid` | doc02.06.01, doc02.07, doc02.10.01, doc03.01, doc03.05 |
| `split` | doc01.02 |
| `sql` | doc02.10.02 |
| `statechart` | doc02.10.03, doc02.12 |
| `static-analysis` | doc01.03.01, doc02.07, doc02.10.01 |
| `theming` | doc02.05.05 |
| `theory` | doc00.01 |
| `tinyforum` | doc01.03.02, doc03.06 |
| `tldraw` | doc03.03 |
| `tools` | doc02.04, doc02.15 |
| `types` | doc02.05.02, doc02.06.02 |
| `typography` | doc03.07 |
| `ui` | doc02.12 |
| `unfolding` | doc02.01, doc02.02 |
| `use-cases` | doc02.10.00 |
| `verification` | doc03.02 |
| `view` | doc02.17 |
| `views` | doc02.11 |
| `vision` | doc01.01, doc01.03.01 |
| `visualization` | doc01.01, doc03.04 |
| `vocabulary` | doc03.02 |
| `xstate` | doc02.10.03 |
| `zoom` | doc03.07 |
