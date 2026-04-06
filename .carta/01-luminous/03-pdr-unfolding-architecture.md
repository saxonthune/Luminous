---
title: PDR: Unfolding Architecture
status: draft
summary: Product decision record for transforming Luminous from schema-first to unfolding-first
tags: [pdr, architecture, unfolding, crystallization]
deps: [doc01.01]
---

# PDR: Unfolding Architecture

## Status

Draft — under active development.

## Context

Luminous is a visual canvas for software design. Its core thesis: humans reason well with spatial tools, AI performs well with structured context, and Luminous bridges this gap. The canvas is simultaneously a visual workspace for humans and a source of structured context for AI agents.

The tool was extracted from the Carta monorepo as the TypeScript/React visual layer. It currently has a functional canvas editor with typed nodes (constructs), typed edges (via port schemas with polarity), organizer containers, multi-page documents, Yjs CRDT sync, and MCP tools for AI agents.

## Problem

### Luminous is anti-unfolding

The current architecture requires schemas and ports to be defined before any nodes or edges can be created. This is the fundamental tension with unfolding design:

1. **You must commit to vocabulary before understanding the domain.** `createConstruct()` throws if the schema type doesn't exist. You literally cannot put a thing on the canvas without first formalizing what kind of thing it is.

2. **You must define connection semantics before understanding relationships.** The port system requires polarity (source/sink/bidirectional/relay/intercept) and compatibility rules before any edge can be drawn. But early in design, you just want to say "these two things are related."

3. **Freeform exploration is impossible.** You can't put an index card on the canvas and draw a line to another index card. Everything must be a typed construct connected via typed ports.

4. **The schema system front-loads complexity.** Even for "four screens with bullet points," you'd need a Screen schema, fields, ports, and compilation config. This is speculative abstraction — the thing unfolding design rejects.

### The canvas engine is capable but underexploited

The cactus canvas engine is a custom, domain-agnostic primitive system (not React Flow). It supports free-form node placement, containment via `parentId` with relative positioning, handle-based edge drawing, and multi-select drag. But the domain layer on top restricts it:

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

## Roadmap

*In progress — being developed alongside this PDR.*

### Milestone 1: The Seed

TBD — notes, freeform edges, universal nesting.

### Milestone 2: Mixed Maturity Canvas

TBD — typed and untyped coexistence.

### Milestone 3: Crystallization

TBD — promote notes to schemas.

### Milestone 4: Schema-Pair Descriptions

TBD — edge meaning from endpoint types.

### Milestone 5: Verification

TBD — audit tools for design gaps.

## References

- FEEDBACK.md — full design session notes and proposal details
- Christopher Alexander, *The Nature of Order: The Process of Creating Life* — structure-preserving transformations, generative sequences
- Christopher Alexander, *The Luminous Ground* — relationships between parts as the source of quality
- Daniel Jackson, *The Essence of Software* — concept-driven design methodology
