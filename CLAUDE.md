# Luminous

## What This Is

Luminous bridges human visual thinking and AI structured context. Humans reason well with spatial canvas tools; AI performs well with high-quality structured context. Luminous is the interface between both — a canvas where humans see and arrange software artifacts, backed by structured data that AI agents can read, query, and act on. Work flows in both directions.

This is a *design* tool, not a diagramming tool. It was extracted from the Carta monorepo as the TypeScript/React visual layer. Carta remains the spec/docs system and Python CLI; Luminous is the visual companion.

## Project Structure

Monorepo (pnpm workspaces). Two tracks:

### Active development (new unfolding architecture)

```
server-next  (dumb storage + Yjs sync)
client-next  (React canvas, all domain logic)
```

- `@luminous/server` (`packages/server-next`) — filesystem serving, WebSocket Yjs sync, no domain logic
- `@luminous/canvas` (`packages/client-next`) — React + cactus canvas engine, notes, freeform edges, nesting

### Legacy (schema-first, being superseded)

```
geometry → schema → document → server
                  ↘ web-client
                  ↘ vscode
```

These still work but carry schema-first assumptions that contradict the unfolding direction. See PDR (doc01.02.01) for the migration plan.

## Architecture Direction

See `.carta/01-luminous/03-pdr-unfolding-architecture.md` for full details. Key decisions:

- **Notes are the fundamental node type.** Markdown title + body. Schemas come from crystallization, not upfront definition.
- **Freeform edges first, ports later.** Any node to any node, optional label. Three-polarity port system (in/out/neutral) available for typed constructs.
- **Server is storage, client is intelligence.** Server serves files and syncs Yjs. Client owns all domain logic.
- **Willing to delete.** No backward compatibility with features nobody uses.

## Canvas Engine

The canvas engine is called **cactus** (`packages/web-client/src/cactus/`). Custom, domain-agnostic — not React Flow. Uses d3-zoom, DOM data-attribute hit-testing, composable hooks. The engine supports everything we need; restrictions are in the domain layer above it.

## Docs / Specs

The `.carta/` directory contains structured specifications managed by the `carta` CLI.

- **Structural changes** (create, move, delete, punch, flatten): use `carta` commands
- **Content edits** to existing docs: direct file editing is fine, then `carta regenerate`
- Run `carta ai-skill` for the full CLI reference

## Tech Stack

React 19, TypeScript 5.9, Vite, Tailwind, Zustand, Yjs (CRDT), d3-zoom, Playwright (E2E), Vitest
