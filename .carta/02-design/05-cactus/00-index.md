---
title: Cactus Canvas Engine
summary: 
tags: []
deps: []
---

# Cactus Canvas Engine

Documentation for the cactus canvas engine — the domain-agnostic primitive system that powers Luminous's visual layer.

**Purpose:** Reference material for anyone building on or modifying the canvas. Covers architecture, public API, coordinate systems, and integration patterns.

**Audience:** Developers extending the canvas (adding node types, custom interactions, new tools) and AI agents that need to understand the rendering pipeline.

**What belongs here:**
- Engine architecture and design rationale
- Public API contracts (components, hooks, types)
- Coordinate system and hit-testing documentation
- Integration patterns and DOM attribute conventions

**What doesn't belong here:**
- Domain-layer documentation (notes, edges, nesting semantics) — that's in 02-design
- Server or API documentation — see doc02.03
- Implementation details that change frequently — read the source

**Contents:**
- `01-overview.md` — Architecture, layers, coordinate systems, design principles
- `02-api-contract.md` — Complete public API reference (components, hooks, types, utilities)
