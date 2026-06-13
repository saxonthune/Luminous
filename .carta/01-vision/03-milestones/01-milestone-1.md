---
title: Milestones
status: completed
summary: Product milestones — what Luminous must do next, defined by what a user can do
tags: [milestones, vision, roadmap, pipeline, static-analysis]
deps: [doc01.01, doc02.01]
---

# Milestones

Luminous milestones are defined by what a user can *do* — not by internal architecture. Each milestone produces a usable tool.

## Milestone 1: Solid.js Project Summary Canvas

**Goal:** Given this Solid.js codebase, produce a single canvas that shows the component tree, reactive signals, and external data sources — color-coded and interactive.

**What the user sees:**

- **Component tree** (one color). Each component is a node. Nesting reflects the render tree — `App` contains `CanvasView`, `CanvasView` contains `NoteNode`, etc. Edges represent parent-child rendering relationships.
- **Signals** (another color). Each signal/store is a node, nested inside the component that creates it. Reactive dependency edges (signal → component that reads it) use a distinct edge color.
- **External data sources** (a third color). API calls (`fetch`, WebSocket connections) are nodes, colored distinctly. Edges connect them to the signals or components they feed.

**How it's built:**

A pipeline script performs static analysis of the Solid.js source and emits `.canvas.json` data. The script:
1. Parses the TypeScript/Solid source (AST analysis)
2. Extracts components (function components, their JSX children)
3. Extracts signals (`createSignal`, `createStore`, `createMemo`, `createEffect`)
4. Extracts external data sources (`fetch`, `WebSocket`, `onMount` with side effects)
5. Traces reactive dependencies (which components read which signals)
6. Emits a `.canvas.json` file with typed, color-coded, spatially-laid-out nodes and edges

The pipeline script is the artifact. It's reusable — run it against any Solid.js project and get a canvas. It's also the *seed* of a community pattern: shareable diagram pipelines.

**Why this milestone first:**

- It's concrete and testable — either the canvas accurately reflects the codebase or it doesn't.
- It exercises the full loop: source code → static analysis → canvas data → visual rendering.
- It produces a tool we actually want: a visual summary of the Luminous codebase itself.
- It establishes the pipeline *pattern* — future pipelines for other frameworks or domains follow the same shape but define their own types. We don't pre-build a universal schema; each pipeline grows its own vocabulary from the forces of its domain.
- It forces the polymorphic node model — components, signals, and data sources are different node types with different rendering.

**Done when:** Running the pipeline script against `packages/client-next` and `packages/cactus` produces a canvas that a developer can open in Luminous and use to understand the codebase's component architecture, reactive data flow, and external dependencies.
