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
| doc01.01.01 | `01-vision/01-vision.md` | Luminous bridges human visual thinking and AI context — a canvas tool for software design that serves both | vision, visualization, canvas, software-design, ai-context | — | doc01.03.01 |
| doc01.01.02 | `01-vision/02-background.md` | Why Luminous was split from Carta — separation of the docs system from the visualization tools | background, history, carta, split | doc01.02.01 | — |

### Design

| Ref | File | Summary | Tags | Deps | Refs |
|-----|------|---------|------|------|------|

| doc01.02.00 | `02-design/00-index.md` | Product and software design — architecture decisions, concept inventory, API contracts, engine internals | design | — | — |
| doc01.02.01 | `02-design/01-pdr-unfolding-architecture.md` | Product decision record for transforming Luminous from schema-first to unfolding-first | pdr, architecture, unfolding, crystallization | doc01.02.01 | doc01.01.02, doc01.02.01, doc01.02.02, doc01.02.05.01, doc01.02.06.01, doc01.03.01 |
| doc01.02.02 | `02-design/02-concept-inventory.md` | Luminous concepts (Jackson framework) — Workspace, Document, Note, Edge, Nesting, Canvas, Selection, Schema, Formalization, Schema-Pair, Verification | concepts, design, jackson, formalization, unfolding | doc01.02.01, doc01.02.01 | doc01.02.03, doc01.02.04 |
| doc01.02.03 | `02-design/03-api-contract.md` | Action-based HTTP API — concept actions as endpoints, not REST resources. POST /api/{concept}/{action} pattern. | api, http, actions, server, contract | doc01.02.02 | doc01.02.04 |
| doc01.02.04 | `02-design/04-mcp-design.md` | MCP architecture — config-driven, concept-grouped tools over HTTP. AI uses same action contract as browser client. | mcp, ai, api, tools, architecture | doc01.02.02, doc01.02.03 | — |
| doc01.02.05.00 | `02-design/05-cactus/00-index.md` |  |  | — | — |
| doc01.02.05.01 | `02-design/05-cactus/01-overview.md` | Architecture of the cactus canvas engine — layers, coordinate systems, DOM conventions, and design principles | cactus, canvas, engine, architecture, overview | doc01.02.01 | doc01.02.05.02 |
| doc01.02.05.02 | `02-design/05-cactus/02-api-contract.md` | Complete public API reference for the cactus canvas engine — components, hooks, types, and geometry utilities | cactus, canvas, api, components, hooks, types | doc01.02.05.01 | — |
| doc01.02.06.00 | `02-design/06-adr/00-index.md` | Significant architecture decisions with context, rationale, and consequences | adr, architecture | — | — |
| doc01.02.06.01 | `02-design/06-adr/01-solid-migration.md` | Architecture decision record for migrating Luminous client-next and cactus from React to Solid.js | adr, architecture, solid, react, performance, reactivity | doc01.02.01, doc01.02.05 | — |

### Research Sessions

| Ref | File | Summary | Tags | Deps | Refs |
|-----|------|---------|------|------|------|

| doc01.03.00 | `03-research-sessions/00-index.md` | Exploratory conversations and synthesis — technology evaluation, architectural thinking, cross-domain pattern recognition | research, exploration | — | — |
| doc01.03.01 | `03-research-sessions/01-declarative-paradigms-synthesis.md` | Research session on how declarative/structured software paradigms (Solid.js, ECS, Rust, SQL, etc.) align with the mission of making software artifacts legible to both humans and AI | research, solid, architecture, reactive, ecs | doc01.01.01, doc01.02.01 | — |

## Tag Index

Quick lookup for file-path→doc mapping:

| Tag | Relevant Docs |
|-----|---------------|
| `actions` | doc01.02.03 |
| `adr` | doc01.02.06.00, doc01.02.06.01 |
| `ai` | doc00.04, doc01.02.04 |
| `ai-context` | doc01.01.01 |
| `api` | doc01.02.03, doc01.02.04, doc01.02.05.02 |
| `architecture` | doc01.02.01, doc01.02.04, doc01.02.05.01, doc01.02.06.00, doc01.02.06.01, doc01.03.01 |
| `background` | doc01.01.02 |
| `cactus` | doc01.02.05.01, doc01.02.05.02 |
| `canvas` | doc01.01.01, doc01.02.05.01, doc01.02.05.02 |
| `carta` | doc01.01.02 |
| `components` | doc01.02.05.02 |
| `concepts` | doc01.02.02 |
| `contract` | doc01.02.03 |
| `conventions` | doc00.03 |
| `crystallization` | doc01.02.01 |
| `design` | doc01.02.00, doc01.02.02 |
| `docs` | doc00.01, doc00.02, doc00.03, doc00.04 |
| `ecs` | doc01.03.01 |
| `engine` | doc01.02.05.01 |
| `exploration` | doc01.03.00 |
| `formalization` | doc01.02.02 |
| `history` | doc01.01.02 |
| `hooks` | doc01.02.05.02 |
| `http` | doc01.02.03 |
| `index` | doc00.00 |
| `jackson` | doc01.02.02 |
| `maintenance` | doc00.02 |
| `mcp` | doc01.02.04 |
| `meta` | doc00.00, doc00.01 |
| `overview` | doc01.02.05.01 |
| `pdr` | doc01.02.01 |
| `performance` | doc01.02.06.01 |
| `philosophy` | doc00.02 |
| `react` | doc01.02.06.01 |
| `reactive` | doc01.03.01 |
| `reactivity` | doc01.02.06.01 |
| `research` | doc01.03.00, doc01.03.01 |
| `retrieval` | doc00.04 |
| `server` | doc01.02.03 |
| `software-design` | doc01.01.01 |
| `solid` | doc01.02.06.01, doc01.03.01 |
| `split` | doc01.01.02 |
| `theory` | doc00.01 |
| `tools` | doc01.02.04 |
| `types` | doc01.02.05.02 |
| `unfolding` | doc01.02.01, doc01.02.02 |
| `vision` | doc01.01.01 |
| `visualization` | doc01.01.01 |
