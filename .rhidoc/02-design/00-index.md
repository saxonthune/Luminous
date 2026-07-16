---
title: Design
summary: 
tags: []
deps: []
---

# Design


| Ref | Item | Kind | Summary | Tags |
|-----|------|------|---------|------|

| doc02.01 | PDR: Unfolding Architecture | doc | Product decision record for transforming Luminous Canvas from schema-first to unfolding-first. Governs Canvas only — Dataflow and Atlas are sibling apps with their own formats. | pdr, architecture, unfolding, crystallization, canvas |
| doc02.02 | Concept Inventory | doc | Luminous concepts (Jackson framework) — Workspace, Document, Note, Edge, Nesting, Canvas, Selection, Schema, Formalization, Schema-Pair, Verification | concepts, design, jackson, formalization, unfolding |
| doc02.03 | API Contract | doc | HTTP + WebSocket API for @luminous/server — document listing, reading, mutation actions, diagnostics, and change notifications | api, http, server, contract |
| doc02.04 | MCP Design | doc | MCP architecture — config-driven, concept-grouped tools over HTTP. AI uses same action contract as browser client. | mcp, ai, api, tools, architecture |
| doc02.05 | Cactus Canvas Engine | group (6) | — | — |
| doc02.06 | Architecture Decision Records | group (2) | — | — |
| doc02.07 | Solid.js Pipeline Specification | doc | Node types, nesting rules, and edge semantics for the Solid.js static analysis pipeline | pipeline, solid, static-analysis, milestone-1 |
| doc02.08 | Edge Schemas | doc | Edge schema system — discriminated union, layoutRole, connection constraints, declarative routing (exitSide/enterSide), ancestor edge suppression, and the runtime filter pattern | edges, schemas, design, cactus-boundary |
| doc02.09 | Node primitive reference | doc | Enumerated reference for node primitives (drag-bar, title, markdown, container) with bind semantics and examples | primitives, schemas, reference, node |
| doc02.10 | Examples | group (6) | — | — |
| doc02.11 | PDR: Property Graph Architecture | doc | Successor PDR committing Luminous Canvas to a property-graph contract, multi-document composition, per-view role semantics, packs, and a cactus-class Solid.js canvas engine. Supersedes parts of the unfolding PDR that assumed a single uniform node/edge list. Governs Canvas only — Dataflow and Atlas are not property graphs. | pdr, architecture, property-graph, packs, views, disclosure, canvas-engine |
| doc02.12 | Canvas app statechart | doc | Statechart of the Canvas app's outer surface — boot, picker, canvas-mounted, error — and its ?src= projection. Canvas viewport internals are a black box; theme and app selection belong to the platform shell. | ui, statechart, canvas, shell |
| doc02.13 | Canvas app component tree (derived) | doc | Component tree of the Canvas app's outer surface, derived from its statechart and six inventories. Canvas viewport internals are not modeled here. | components, derivation, canvas |
| doc02.14 | Canvas pack contract | doc | A pack is JSON data owned by the domain it describes, co-located with its graph as a sibling file. What a pack declares, how a graph names it, and how Canvas resolves it. Packs are Canvas's alone — Dataflow and Atlas have none. | pack, contract, schema, data, co-location, canvas |
| doc02.15 | MCP Iterative Graph Building | doc | Tool surface for AI agents to build and query property graphs iteratively — six tiers from CRUD to pack authoring, with layout policy and sync strategy. | mcp, ai, tools, graph, iteration |
| doc02.16 | Canvas renderer engine | doc | Renderers are JSON over a primitive vocabulary; the engine interprets them; custom primitives are the code escape hatch. Pack-driven, so Canvas's alone — Dataflow and Atlas draw their nodes with hand-written components. | renderer, primitives, pack, rendering, canvas |
| doc02.17 | Canvas projection and identity | doc | Node identity persists across projections; decoration layers above projection; contain-per-view; animation between views falls out of identity stability. Views and roles are pack machinery, so Canvas's alone. | projection, identity, view, animation, decoration, canvas |
| doc02.18 | Canvas pack examples | doc | RTP, flowchart, Solid app, React app, Rust app — what each pack declares, what views each wants, and what falls out as the universal contract Canvas holds for all packs. | pack, examples, reference, contract, canvas |
| doc02.19 | Canvas viewport component tree | doc | What lives inside the Canvas app's viewport — toolbars, view switcher, layer toolbar, context menus — derived from inventories of state, mutation rate, and ownership boundary. The black box doc02.13 mounts. | canvas, chrome, component-tree, boundaries |
| doc02.20 | Chrome schema | doc | Action records, menu and toolbar schemas, chrome slots; cactus owns chrome rendering, the host app owns the schema producers, packs stay unchanged. The record types are an engine contract; the pack-fed producers are Canvas's. | chrome, api, actions, menus, cactus, boundary |
| doc02.21 | Dataflow | group (4) | — | — |
| doc02.22 | Platform | group (2) | — | — |

Topics: actions, ai, animation, api, architecture, boundaries, boundary, cactus, cactus-boundary, canvas, canvas-engine, chrome, co-location, component-tree, components, concepts, contract, crystallization, data, decoration, derivation, design, disclosure, edges, examples, formalization, graph, http, identity, iteration, jackson, mcp, menus, milestone-1, node, pack, packs, pdr, pipeline, primitives, projection, property-graph, reference, renderer, rendering, schema, schemas, server, shell, solid, statechart, static-analysis, tools, ui, unfolding, view, views
