---
title: Declarative Paradigms and Carta+Luminous
summary: Research session on how declarative/structured software paradigms (Solid.js, ECS, Rust, SQL, etc.) align with the mission of making software artifacts legible to both humans and AI
tags: [research, solid, architecture, reactive, ecs]
deps: [doc01.01.01, doc01.02.01]
date: 2026-04-06
---

# Declarative Paradigms and Carta+Luminous

Research session exploring the connection between declarative software paradigms and the Carta+Luminous mission of bridging human spatial reasoning and AI structured context.

## The Core Observation

There is a class of software tools and languages that require explicit, upfront declaration of structure and relationships. In exchange, the runtime can exploit that structure for performance, correctness, and — critically — introspectability.

The opposite class lets developers be sloppy and compensates at runtime (re-rendering everything, garbage collecting, duck typing). These are easier to start with but opaque to automated reasoning.

**Thesis:** Luminous should align with the first class, because its mission requires the runtime data model to be legible to machines — not just renderable for humans.

## The Spectrum

```
Sloppy/forgiving ←————————————————————→ Structured/rewarding

JavaScript          TypeScript          Rust
React               Solid               Bevy
Unity (old)         Godot               Unity DOTS / Bevy
MongoDB             PostgreSQL          TLA+
Python              Haskell
REST (ad hoc)       GraphQL             Datalog
```

Everything on the right asks more upfront. Everything on the right gives back more at runtime: performance, correctness, introspectability, or all three.

## Cross-Domain Examples

### Solid.js (UI)

Solid compiles JSX into direct DOM creation calls at build time. Component functions run once and set up a reactive graph — signals, memos, and effects — that persists as the live data model. Updates flow through the graph directly to specific DOM nodes. No virtual DOM, no diffing, no re-rendering.

The reactive graph is a real, inspectable structure at runtime. An AI agent could walk it to understand what depends on what, what changed, and why.

Contrast with React: the virtual DOM is an internal implementation detail. Data flow is hidden inside closures and hook call order. Reconstructing "what depends on what" requires source code analysis — there's no runtime graph to inspect.

### Rust (systems programming)

Ownership and borrowing force upfront thinking about memory lifetimes. The compiler enforces it. Reward: no garbage collector, no data races, no use-after-free. The type system is the enforcer, not a runtime safety net.

### ECS in Game Engines (Bevy, Flecs, Unity DOTS)

Entities are IDs. Components are plain data. Systems are functions that query components by type. The ECS runtime exploits this structure for cache-coherent memory layout, automatic parallelism (non-overlapping component access runs concurrently), and queryability.

Bevy (Rust + ECS) reads system function signatures to determine data access patterns and parallelizes automatically. Flecs exposes the ECS as a queryable database.

Contrast with Unity's old MonoBehaviour model: scatter logic anywhere, call anything from anything. Easy to start, opaque to optimization and inspection.

### SQL / Relational Databases

Declare what you want, not how to get it. The query planner exploits schema structure, indexes, and statistics. Good schema design compounds over time.

### Erlang/OTP (distributed systems)

Declare supervision trees upfront — which processes supervise which, and how failures propagate. OTP exploits this for automatic fault tolerance. The structure IS the error handling.

### TLA+ / Formal Methods

Declare invariants and state transitions before writing code. The model checker exhaustively explores every reachable state. Upfront thinking IS the tool — there is no runtime.

## Implications for Luminous

### The reactive graph as the document model

In a Solid-based Luminous, a note's title, body, position, and edges would be signals. Derived state (layout, groupings, computed properties) would be memos. The reactive graph IS the document structure, not a separate representation maintained alongside a UI framework's internal state.

This means:
- An AI agent reading the canvas reads the same graph the renderer reads
- Changes propagate through a single, traceable mechanism
- Dependency tracing is native — "what does this note depend on?" is a graph query, not source code analysis

### The component tree vs. the data graph

React entangles the component tree (UI concern) with the data model (hooks live inside components). Understanding the data means understanding the component tree.

Solid separates them. Signals and memos exist independently of components. The component tree is a rendering concern. The data graph is the semantic concern. Two consumers (human renderer, AI reader) can access the data graph without navigating UI structure.

### Alignment with the Carta+Luminous mission

Luminous wants to be the interface where:
- Humans see a spatial canvas
- AI reads structured context
- Work flows in both directions

A framework whose runtime model is an explicit, walkable, queryable graph aligns with this mission structurally. The visual representation and the structured representation become two views of the same underlying graph, rather than two separate systems kept in sync.

## Connection to Existing ADRs

See `doc01.02.06.01` (Solid Migration ADR) for the concrete migration plan. This research session provides the strategic rationale: Solid is not just a performance upgrade — it's an architectural alignment with Luminous's core mission of making software artifacts legible to both humans and machines.

## Open Questions

- How to instrument Solid's reactive graph for AI consumption without coupling to Solid internals
- Whether the Yjs CRDT layer should also be refactored to expose reactive primitives (Yjs observeDeep → Solid signals)
- How Bevy/ECS thinking might inform the canvas engine (entities = canvas objects, components = visual/semantic data, systems = layout/rendering/AI-reading)
- Whether carta's spec structure could itself be modeled as a reactive graph rather than static files
