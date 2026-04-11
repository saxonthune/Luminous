---
title: PDR: Unfolding Architecture
summary: Product decision record for transforming Luminous from schema-first to unfolding-first
tags: [pdr, architecture, unfolding, crystallization]
deps: [doc01.02.01]
---

# PDR: Unfolding Architecture

## Context

Luminous is a visual canvas for software design. Its core thesis: humans reason well with spatial tools, AI performs well with structured context, and Luminous bridges this gap. The canvas is simultaneously a visual workspace for humans and a source of structured context for AI agents.

The tool was extracted from the Carta monorepo as the TypeScript visual layer. It currently has a functional canvas editor with typed nodes (constructs), typed edges (via port schemas with polarity), organizer containers, multi-page documents, Yjs CRDT sync, and MCP tools for AI agents.

## Problem

### Luminous is anti-unfolding

The current architecture requires schemas and ports to be defined before any nodes or edges can be created. This is the fundamental tension with unfolding design:

1. **You must commit to vocabulary before understanding the domain.** `createConstruct()` throws if the schema type doesn't exist. You literally cannot put a thing on the canvas without first formalizing what kind of thing it is.

2. **You must define connection semantics before understanding relationships.** The port system requires polarity (source/sink/bidirectional/relay/intercept) and compatibility rules before any edge can be drawn. But early in design, you just want to say "these two things are related."

3. **Freeform exploration is impossible.** You can't put an index card on the canvas and draw a line to another index card. Everything must be a typed construct connected via typed ports.

4. **The schema system front-loads complexity.** Even for "four screens with bullet points," you'd need a Screen schema, fields, ports, and compilation config. This is speculative abstraction — the thing unfolding design rejects.

### The canvas engine is capable but underexploited

The cactus canvas engine is a custom, domain-agnostic primitive system. It supports free-form node placement, containment via `parentId` with relative positioning, handle-based edge drawing, and multi-select drag. But the domain layer on top restricts it:

- Only organizers can be parents (the engine supports any node as container)
- Edges require port handles (the engine's hit-testing is data-attribute based and could support node-level targets)
- Only two node types exist: construct (schema-required) and organizer (no semantic content)

The engine can support the unfolding model. The restrictions are in the domain layer, not the canvas primitives.

### The port system is overbuilt for most use cases

Five polarity types (source/sink/bidirectional/relay/intercept), compatibility rules, port configs per schema, and a validation registry. This serves database-modeling precision but blocks the common case: "these two things are related, and the direction matters."

## Decisions

### D1: Reduce polarity to three types

Replace the five-polarity system with three: **in**, **out**, **neutral**. This covers the vast majority of relationships (directional flow and undirected association) without the cognitive overhead of relay/intercept/bidirectional distinctions. The full polarity system can be reconsidered after testing with real design workflows.

### D2: Notes as the fundamental node type

The core loop: an actor (human or AI) creates markdown notes on the canvas, and an actor can later promote those notes into formalized schema instances. A note has a title and a markdown body. It can contain children. It can have edges. It compiles to structured output.

A typed construct is a note that has been crystallized — it gained a schema, and its freeform content was mapped to structured fields. The promotion is a structure-preserving transformation: position, edges, children, and content are all preserved.

Open question: what happens to nesting during promotion? If a note contains child notes, and the parent is promoted to a schema, do the children become instances of some type? Do they stay as notes inside a typed construct? This needs design work.

### D3: Schema-pair descriptions replace ports as the default

Edge meaning is determined by a (fromSchema, toSchema, direction) lookup table, not by per-construct port definitions. The table itself unfolds — starts empty, grows as schemas are crystallized. Untyped edges gain meaning retroactively when their endpoints are promoted.

Ports remain available as an advanced feature for domains that need fine-grained connection typing.

### D4: Willing to delete

We are willing to delete code that serves the old schema-first-only model, rather than maintaining backward compatibility with features that contradict the unfolding direction. The codebase is pre-release (v0.1.0-alpha.3) with no external users. Carrying dead weight to avoid breaking changes that affect nobody is itself anti-unfolding — it's empty scaffolding.

Specific deletion candidates:
- Schema wizard as a top-level creation path (replace with crystallization)
- Port compatibility registry (`canConnect` with `compatibleWith` rules)
- Relay and intercept polarity types
- `groupId`/`packageId` on schemas
- Any UI that implies schemas must exist before work can begin

### D5: Fresh packages as seeds

Rather than surgically removing schema-first assumptions from the existing packages (`@carta/document` is 146KB of operations that all require `constructType`), we create two new packages that embody the unfolding architecture from day one:

- `packages/server-next` (`@luminous/server`)
- `packages/client-next` (`@luminous/canvas`)

These have **zero dependency** on `@carta/schema` or `@carta/document`. The existing packages continue to work — old and new coexist until the new packages mature enough to replace them.

This also practices the methodology: start with a seed, not a blueprint.

### D6: Server is storage, client is intelligence

The server is dumb: serve files, sync Yjs docs, write back to filesystem. No schema awareness, no document operations, no domain logic.

The client owns everything else: rendering, note creation, freeform edges, nesting, crystallization, schema management, compilation. All domain logic runs client-side, stored in the Yjs doc.

This split is deliberate. The server should be replaceable (filesystem today, database tomorrow, peer-to-peer later) without touching domain logic. And domain logic should be testable without a server.

### D7: Nesting survives promotion unchanged

When a note containing children is promoted to a typed construct, the children stay as they are — notes remain notes, typed children remain typed. Promotion is always one node at a time, and children are unaffected. The parent gains a schema; its containment relationships are preserved exactly.

Batch crystallization (promote parent + children together) and deep promotion (children become structured fields) are compound operations that can be built later from this primitive. The default is the simplest structure-preserving transformation.

## Cactus Engine Assessment

The cactus canvas engine (`packages/cactus/src/`) is a custom, domain-agnostic primitive system. It uses d3-zoom for viewport, DOM data-attribute hit-testing, and composable Solid primitives. The engine itself supports everything we need. The three gaps for the unfolding model are all in the **domain layer** above cactus, not in the engine primitives:

| Need | Engine Status | Gap Location |
|------|--------------|--------------|
| Note nodes | Engine is type-agnostic | MapV2 node type registry (domain) |
| Handle-less edges | Hit-testing is data-attribute based | `useConnectionDrag` needs node-level targets (small engine change) |
| Universal nesting | `findContainerAt` + relative positioning works on any node | `canNestInOrganizer` policy check (domain) |

This means the canvas work is small relative to the data model and document operation changes.

## Roadmap

### Milestone 0: Infrastructure

Create the two new packages as seeds. No domain logic yet — just the wiring.

**`packages/server-next`** — Minimal Node.js server:
- HTTP: serve a directory of `.canvas.json` files, directory listing endpoint, health endpoint
- WebSocket: Yjs sync (one room per file, using y-websocket)
- Filesystem: debounced write-back on Yjs updates, file watching for external changes
- Dependencies: `yjs`, `y-websocket`, `y-protocols`, `ws`, `lib0` (nothing else)

**`packages/client-next`** — Minimal Solid.js canvas app:
- Vite + Solid.js + Tailwind
- Cactus engine (copied/inlined from web-client)
- Yjs document as source of truth
- Connects to server-next via WebSocket, falls back to local IndexedDB
- Empty canvas — no node types yet

**Done when:** `pnpm dev:next` starts both packages, client connects to server, opening a `.canvas.json` file loads an empty Yjs doc that syncs and persists.

### Milestone 1: The Seed

The minimal unfolding canvas. Three primitives: notes, freeform edges, universal nesting.

**NoteNode:** Title + markdown body. Rendered as an index card. Created via context menu or MCP. Compiles to `{ title, body }` in structured output.

**Freeform edge:** Connects any two nodes by dragging node-to-node (no port selection). Optional text label. Rendered as a simple line/bezier. No handle IDs — edges reference node IDs directly.

**Universal nesting:** Any node can contain children. Drag-to-nest gesture (Ctrl+drag, matching existing organizer UX). Children positioned relative to parent. Parent auto-fits to contain children.

**Yjs operations:** `createNote`, `updateNote`, `connectFreeform`, `nestNode`, `unnestNode`. All client-side, persisted via Yjs sync to server.

**Done when:** A user can create notes, connect them, nest them, and the result persists to a `.canvas.json` file on disk that an AI agent could read and understand.

### Milestone 2: Mixed Maturity

Introduce typed constructs alongside notes. The canvas holds both, and edges work between them.

**Schema definition:** Construct schemas defined in the Yjs doc (same as today's model, but with the simplified three-polarity port system: in/out/neutral).

**Construct creation:** From schema (the existing path), or via crystallization from notes (the new path). Both produce the same kind of node.

**Cross-type edges:** Freeform edges connect notes to constructs, constructs to constructs, notes to notes — all the same way. Port-based edges remain available for construct-to-construct connections where precision matters.

**Visual coherence:** Notes (index cards) and constructs (structured field display) share the same canvas without looking like two different tools. Subtle visual gradient from informal to formal.

**Done when:** A canvas can hold notes and typed constructs simultaneously, connected by freeform edges, and the whole thing compiles to structured output.

### Milestone 3: Crystallization

Promote notes into typed constructs. The central structure-preserving transformation.

**Basic crystallization:** Select multiple notes with similar structure → "Crystallize" → system infers schema fields from their content → creates ConstructSchema → upgrades notes to instances. All edges, positions, and children preserved.

**Field mapping:** Freeform body content (bullet points, sections) maps to structured fields. The mapping can be inferred (AI) or specified (human).

**Edge crystallization:** When multiple freeform edges share the same label and connect the same schema pair, suggest promoting them to a schema-pair description (see Milestone 4).

**MCP operation:** `crystallize(nodeIds[], schemaName, fieldMapping?)` — so AI agents can perform crystallization programmatically.

**Done when:** A user can create four screen notes, flesh them out, then crystallize them into a Screen schema in one action, with all edges and nesting preserved.

### Milestone 4: Schema-Pair Descriptions

Edge meaning determined by endpoint types, not port definitions.

**Lookup table:** `(fromSchema, toSchema, direction) → description`. Starts empty, grows as schemas are crystallized.

**Retroactive meaning:** When an untyped edge's endpoints are both crystallized, the edge gains meaning from the schema-pair table without anyone touching the edge.

**UI:** Small table accessible from document settings or edge inspector. Each entry is one sentence describing what the connection means.

**Coexistence with ports:** Ports remain available. If a construct schema defines explicit ports, those take precedence. Schema-pair descriptions are the default for constructs without port configs.

**Done when:** Edges between typed constructs display their schema-pair description as a tooltip/label, and new entries are suggested when patterns emerge.

### Milestone 5: Verification

Audit tools that surface design gaps. MCP tools first, UI later.

**Coverage diff:** Given a screen node and a list of concept definitions, report which concept actions have no corresponding component in the screen's subtree.

**Bare edge audit:** Find edges with no label or schema-pair description — relationships that haven't been examined.

**Constraint audit:** Given concept invariants (numeric limits, conditional guards), report which constraints have no corresponding annotation in any component.

**MCP operations:** `audit_coverage`, `audit_interactions`, `audit_constraints`. Each returns a list of gaps — prompts for the next unfolding step. The human decides whether a gap is real or intentional.

**Done when:** An AI agent can run audits against a design canvas and produce actionable gap reports.

## References

- FEEDBACK.md — full design session notes and proposal details
- Christopher Alexander, *The Nature of Order: The Process of Creating Life* — structure-preserving transformations, generative sequences
- Christopher Alexander, *The Luminous Ground* — relationships between parts as the source of quality
- Daniel Jackson, *The Essence of Software* — concept-driven design methodology
