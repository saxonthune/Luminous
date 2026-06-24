# Luminous

A spatial canvas for [unfolding software design](https://computation.saxon.zone).

Luminous connects human visual thinking with AI structured context. You design on a canvas — components, signals, data flow, architecture — and the structured data behind it is legible to AI agents that can read, query, and build from it.

## Demo

[Live canvas](https://saxonthune.github.io/Luminous/) — auto-generated from static analysis of this codebase on every deploy.

## What it does

- **Diagram pipelines** — scripts that perform static analysis of source code and emit `.canvas.json` files. The pipeline is the shareable artifact. Each one defines its own node and edge types from the forces of its domain.
- **MCP-assisted design** — use Luminous as an MCP server to collaboratively diagram product requirements and architecture with an AI agent, then hand the structured canvas off to a coding agent to build.
- **Schema-driven nodes and edges** — every canvas declares its own schemas. Node types, edge types, containment rules, and layout roles are all data, not hardcoded categories.

## Running locally

```
just install
just dev
```

The dev server starts at `localhost:5200` with the canvas client, proxying to the storage server on `localhost:4080`.

## Generating the project canvas

```
just generate-canvas
```

Runs `scripts/analyze-solidjs.ts`, which reads the Solid.js source and emits `.canvases/solidjs-analysis.canvas.json`.

## Tech

Solid.js, TypeScript, Vite, Tailwind, Yjs, d3-zoom, Playwright

## License

[AGPL-3.0](LICENSE)
