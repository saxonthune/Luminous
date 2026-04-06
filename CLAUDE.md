# Luminous

## What This Is

Luminous bridges human visual thinking and AI structured context. Humans reason well with spatial canvas tools; AI performs well with high-quality structured context. Luminous is the interface between both — a canvas where humans see and arrange software artifacts, backed by structured data that AI agents can read, query, and act on. Work flows in both directions.

This is a *design* tool, not a diagramming tool. It was extracted from the Carta monorepo as the TypeScript/React visual layer. Carta remains the spec/docs system and Python CLI; Luminous is the visual companion.

## Project Structure

Monorepo (pnpm workspaces). 6 packages with a layered dependency graph:

```
geometry → schema → document → server
                  ↘ web-client
                  ↘ vscode
```

- `@carta/geometry` — layout primitives, constraint solver
- `@carta/schema` — core data model (nodes, edges, ports, types), platform-agnostic
- `@carta/document` — Yjs CRDT document operations, compiler, formatters
- `@carta/server` — WebSocket sync, MongoDB persistence, MCP tools
- `@carta/web-client` — React canvas editor (React Flow, Zustand, Yjs)
- `carta-vscode` — VS Code extension for `.canvas.json` files

## Docs / Specs

The `.carta/` directory contains structured specifications managed by the `carta` CLI.

- **Structural changes** (create, move, delete, punch, flatten): use `carta` commands
- **Content edits** to existing docs: direct file editing is fine, then `carta regenerate`
- Run `carta ai-skill` for the full CLI reference

## Tech Stack

React 19, React Flow, TypeScript 5.9, Vite, Tailwind, Zustand, Yjs (CRDT), CodeMirror 6, Playwright (E2E), Vitest
