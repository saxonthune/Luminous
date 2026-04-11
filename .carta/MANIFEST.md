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

## 00-codex — Codex

| Ref | File | Summary | Tags | Deps | Refs |
|-----|------|---------|------|------|------|

| doc00.00 | `00-index.md` | Meta-documentation — how to read this workspace | index, meta | — | — |
| doc00.01 | `01-about.md` | Why this workspace exists, how to read it, two-sources-of-truth theory | docs, meta, theory | — | — |
| doc00.02 | `02-maintenance.md` | Doc lifecycle — unfolding philosophy, development loop, versioning, epochs | docs, maintenance, philosophy | — | — |
| doc00.03 | `03-conventions.md` | Cross-reference syntax, frontmatter schema, file naming, writing style | docs, conventions | — | — |
| doc00.04 | `04-ai-retrieval.md` | How AI agents navigate this workspace — hierarchical retrieval, MANIFEST usage, token budgets | docs, ai, retrieval | — | — |

## 01-luminous — Luminous

| Ref | File | Summary | Tags | Deps | Refs |
|-----|------|---------|------|------|------|

| doc01.00 | `00-index.md` |  |  | — | — |

### Vision

| Ref | File | Summary | Tags | Deps | Refs |
|-----|------|---------|------|------|------|

| doc01.01.00 | `01-vision/00-index.md` |  |  | — | — |
| doc01.01.01 | `01-vision/01-vision.md` | Luminous bridges human visual thinking and AI context — a canvas tool for software design that serves both | vision, visualization, canvas, software-design, ai-context | — | doc01.01.03.01, doc01.02.02, doc01.03.01, doc01.03.02 |
| doc01.01.02 | `01-vision/02-background.md` | Why Luminous was split from Carta — separation of the docs system from the visualization tools | background, history, carta, split | doc01.02.01 | — |
| doc01.01.03.00 | `01-vision/03-milestones/00-index.md` |  |  | — | — |
| doc01.01.03.01 | `01-vision/03-milestones/01-milestone-1.md` | Product milestones — what Luminous must do next, defined by what a user can do | milestones, vision, roadmap, pipeline, static-analysis | doc01.01.01, doc01.02.01 | — |
| doc01.01.03.02 | `01-vision/03-milestones/02-milestone-2.md` | Use Luminous alongside a real project to validate the tool and surface friction | milestones, dogfooding, tinyforum | doc01.01.03 | — |

### Design

| Ref | File | Summary | Tags | Deps | Refs |
|-----|------|---------|------|------|------|

| doc01.02.00 | `02-design/00-index.md` | Product and software design — architecture decisions, concept inventory, API contracts, engine internals | design | — | — |
| doc01.02.01 | `02-design/01-pdr-unfolding-architecture.md` | Product decision record for transforming Luminous from schema-first to unfolding-first | pdr, architecture, unfolding, crystallization | doc01.02.01 | doc01.01.02, doc01.01.03.01, doc01.02.01, doc01.02.02, doc01.02.05.01, doc01.02.06.01, doc01.03.01, doc01.03.02, doc01.03.03 |
| doc01.02.02 | `02-design/02-concept-inventory.md` | Luminous concepts (Jackson framework) — Workspace, Document, Note, Edge, Nesting, Canvas, Selection, Schema, Formalization, Schema-Pair, Verification | concepts, design, jackson, formalization, unfolding | doc01.02.01, doc01.01.01 | doc01.02.03, doc01.02.04, doc01.03.02 |
| doc01.02.03 | `02-design/03-api-contract.md` | HTTP + WebSocket API for @luminous/server — document listing, reading, mutation actions, diagnostics, and change notifications | api, http, server, contract | doc01.02.02 | doc01.02.04 |
| doc01.02.04 | `02-design/04-mcp-design.md` | MCP architecture — config-driven, concept-grouped tools over HTTP. AI uses same action contract as browser client. | mcp, ai, api, tools, architecture | doc01.02.02, doc01.02.03 | — |
| doc01.02.05.00 | `02-design/05-cactus/00-index.md` |  |  | — | — |
| doc01.02.05.01 | `02-design/05-cactus/01-overview.md` | Architecture of the cactus canvas engine — layers, coordinate systems, DOM conventions, and design principles | cactus, canvas, engine, architecture, overview | doc01.02.01 | doc01.02.05.02, doc01.02.05.03, doc01.02.06.02, doc01.02.08, doc01.03.03 |
| doc01.02.05.02 | `02-design/05-cactus/02-api-contract.md` | Complete public API reference for the cactus canvas engine — components, hooks, types, and geometry utilities | cactus, canvas, api, components, hooks, types | doc01.02.05.01 | — |
| doc01.02.05.03 | `02-design/05-cactus/03-layout-primitives.md` | The layout algorithms cactus ships — tidyLayout, treeLayout, forceDirectedLayout, compositeLayout, dagLayout — with their contracts and when to use each | cactus, layout, algorithms | doc01.02.05.01 | — |
| doc01.02.06.00 | `02-design/06-adr/00-index.md` | Significant architecture decisions with context, rationale, and consequences | adr, architecture | — | — |
| doc01.02.06.01 | `02-design/06-adr/01-solid-migration.md` | Architecture decision record for migrating Luminous client-next and cactus from React to Solid.js | adr, architecture, solid, react, performance, reactivity | doc01.02.01, doc01.02.05 | — |
| doc01.02.06.02 | `02-design/06-adr/02-schema-discriminant.md` | ADR: Schema becomes a discriminated union NodeSchema | EdgeSchema with an optional kind field on the node variant for backwards compatibility | adr, schema, types, discriminant | doc01.03.03, doc01.02.05.01 | doc01.02.08 |
| doc01.02.07 | `02-design/07-solidjs-pipeline-spec.md` | Node types, nesting rules, and edge semantics for the Solid.js static analysis pipeline | pipeline, solid, static-analysis, milestone-1 | doc01.01.03 | doc01.02.08 |
| doc01.02.08 | `02-design/08-edge-schemas.md` | Edge schema system — discriminated union, layoutRole, connection constraints, declarative routing (exitSide/enterSide), ancestor edge suppression, and the runtime filter pattern | edges, schemas, design, cactus-boundary | doc01.03.03, doc01.02.05.01, doc01.02.06.02, doc01.02.07 | — |

### Research Sessions

| Ref | File | Summary | Tags | Deps | Refs |
|-----|------|---------|------|------|------|

| doc01.03.00 | `03-research-sessions/00-index.md` | Exploratory conversations and synthesis — technology evaluation, architectural thinking, cross-domain pattern recognition | research, exploration | — | — |
| doc01.03.01 | `03-research-sessions/01-declarative-paradigms-synthesis.md` | Research session on how declarative/structured software paradigms (Solid.js, ECS, Rust, SQL, etc.) align with the mission of making software artifacts legible to both humans and AI | research, solid, architecture, reactive, ecs | doc01.01.01, doc01.02.01 | — |
| doc01.03.02 | `03-research-sessions/02-modeling-workbench.md` | Research session exploring how Luminous evolves from concept-driven design to a general modeling workbench — vocabulary building, progressive formalization, and verification across multiple modeling formalisms | research, modeling, concepts, formalization, verification, vocabulary | doc01.01.01, doc01.02.01, doc01.02.02 | — |
| doc01.03.03 | `03-research-sessions/03-node-data-architecture.md` | Research session deriving Luminous's node data model from prior art (tldraw, Notion, Excalidraw, React Flow, Bevy ECS) — separation of structure/content/schema, flat storage with parent pointers, and graceful schema degradation | research, architecture, data-model, ecs, bevy, tldraw, notion, schema, nodes | doc01.02.01, doc01.02.05.01 | doc01.02.06.02, doc01.02.08 |

## Tag Index

Quick lookup for file-path→doc mapping:

| Tag | Relevant Docs |
|-----|---------------|
| `adr` | doc01.02.06.00, doc01.02.06.01, doc01.02.06.02 |
| `ai` | doc00.04, doc01.02.04 |
| `ai-context` | doc01.01.01 |
| `algorithms` | doc01.02.05.03 |
| `api` | doc01.02.03, doc01.02.04, doc01.02.05.02 |
| `architecture` | doc01.02.01, doc01.02.04, doc01.02.05.01, doc01.02.06.00, doc01.02.06.01, doc01.03.01, doc01.03.03 |
| `background` | doc01.01.02 |
| `bevy` | doc01.03.03 |
| `cactus` | doc01.02.05.01, doc01.02.05.02, doc01.02.05.03 |
| `cactus-boundary` | doc01.02.08 |
| `canvas` | doc01.01.01, doc01.02.05.01, doc01.02.05.02 |
| `carta` | doc01.01.02 |
| `components` | doc01.02.05.02 |
| `concepts` | doc01.02.02, doc01.03.02 |
| `contract` | doc01.02.03 |
| `conventions` | doc00.03 |
| `crystallization` | doc01.02.01 |
| `data-model` | doc01.03.03 |
| `design` | doc01.02.00, doc01.02.02, doc01.02.08 |
| `discriminant` | doc01.02.06.02 |
| `docs` | doc00.01, doc00.02, doc00.03, doc00.04 |
| `dogfooding` | doc01.01.03.02 |
| `ecs` | doc01.03.01, doc01.03.03 |
| `edges` | doc01.02.08 |
| `engine` | doc01.02.05.01 |
| `exploration` | doc01.03.00 |
| `formalization` | doc01.02.02, doc01.03.02 |
| `history` | doc01.01.02 |
| `hooks` | doc01.02.05.02 |
| `http` | doc01.02.03 |
| `index` | doc00.00 |
| `jackson` | doc01.02.02 |
| `layout` | doc01.02.05.03 |
| `maintenance` | doc00.02 |
| `mcp` | doc01.02.04 |
| `meta` | doc00.00, doc00.01 |
| `milestone-1` | doc01.02.07 |
| `milestones` | doc01.01.03.01, doc01.01.03.02 |
| `modeling` | doc01.03.02 |
| `nodes` | doc01.03.03 |
| `notion` | doc01.03.03 |
| `overview` | doc01.02.05.01 |
| `pdr` | doc01.02.01 |
| `performance` | doc01.02.06.01 |
| `philosophy` | doc00.02 |
| `pipeline` | doc01.01.03.01, doc01.02.07 |
| `react` | doc01.02.06.01 |
| `reactive` | doc01.03.01 |
| `reactivity` | doc01.02.06.01 |
| `research` | doc01.03.00, doc01.03.01, doc01.03.02, doc01.03.03 |
| `retrieval` | doc00.04 |
| `roadmap` | doc01.01.03.01 |
| `schema` | doc01.02.06.02, doc01.03.03 |
| `schemas` | doc01.02.08 |
| `server` | doc01.02.03 |
| `software-design` | doc01.01.01 |
| `solid` | doc01.02.06.01, doc01.02.07, doc01.03.01 |
| `split` | doc01.01.02 |
| `static-analysis` | doc01.01.03.01, doc01.02.07 |
| `theory` | doc00.01 |
| `tinyforum` | doc01.01.03.02 |
| `tldraw` | doc01.03.03 |
| `tools` | doc01.02.04 |
| `types` | doc01.02.05.02, doc01.02.06.02 |
| `unfolding` | doc01.02.01, doc01.02.02 |
| `verification` | doc01.03.02 |
| `vision` | doc01.01.01, doc01.01.03.01 |
| `visualization` | doc01.01.01 |
| `vocabulary` | doc01.03.02 |
