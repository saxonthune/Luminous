---
title: Solid.js reference graph
status: draft
summary: Static analysis of a Solid.js codebase rendered as a canvas — components, signals, and their consumer edges (milestone 1)
tags: [examples, milestone-1, static-analysis, solid, pipeline]
deps: [doc01.01.03.01, doc01.02.07]
---

# Example: Solid.js reference graph

A pipeline script reads a Solid.js project's source, performs AST-level static analysis, and emits a `.canvas.json` the user opens in Luminous to understand the shape of the codebase.

## User story

A developer inherits or onboards into a Solid.js codebase and needs to build a mental model fast. Reading file by file is slow and assembles the wrong shape — the filesystem tree is not the runtime render tree, and reactive data flow isn't visible from imports alone. The developer runs the pipeline once, opens the resulting canvas, and sees which components render which, which signals exist and where they live, and which external data sources feed what.

## Artifacts on the canvas

- **Component nodes** (one color). One per function component. Nested by render relationship: `App` contains `CanvasView`, `CanvasView` contains `NoteNode`. Nesting reflects the render tree, not the file tree.
- **Signal nodes** (second color). One per `createSignal` / `createStore` / `createMemo` / `createEffect`. Nested inside the component that creates it — a signal's scope is visually obvious.
- **External data source nodes** (third color). `fetch` calls, WebSocket connections, `onMount` side effects. Free-floating or grouped by service.
- **Reactive dependency edges** (distinct color). `signal → component that reads it`. Crosses nesting boundaries freely.
- **Data-flow edges**. `external source → signal it feeds`.

## The value

Answers three questions that are hard to answer from source alone:

1. *Where does this signal get read?* — trace outbound reactive edges.
2. *What data does this component depend on?* — trace inbound reactive and data-flow edges.
3. *What external systems does this app actually talk to?* — filter to data-source nodes.

Also serves as a living diff artifact: regenerate after a refactor and visually confirm that dependencies changed the way the refactor intended.

## Features demanded

- **Pipeline execution model** — scripts that read source, emit `.canvas.json`, run via `pnpm generate:*`
- **Per-canvas schemas** — component, signal, data-source node types declared inline in the generated file
- **Polymorphic nodes with distinct rendering** — color and shape vary per schema
- **Arbitrary-depth nesting** — render trees can be deep
- **Freeform cross-nesting edges** — reactive dependencies ignore the containment hierarchy
- **Layered edge schemas** — reactive vs. render-tree vs. data-flow are visually distinct
- **Auto-layout** — the pipeline cannot hand-place dozens of nodes; `dagLayout` or equivalent must position components
- **Stable node IDs across re-generation** — derived from source location, so the canvas survives code changes
- **Color-coded legend** — the user must be able to read the canvas without the source

## Status

Implemented in milestone 1. See `doc01.01.03.01` and the pipeline spec `doc01.02.07`.
