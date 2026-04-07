# Luminous

## What This Is

Luminous bridges human visual thinking and AI structured context. Humans reason well with spatial canvas tools; AI performs well with high-quality structured context. Luminous is the interface between both — a canvas where humans see and arrange software artifacts, backed by structured data that AI agents can read, query, and act on. Work flows in both directions.

This is a *design* tool, not a diagramming tool. It was extracted from the Carta monorepo as the TypeScript/React visual layer. Carta remains the spec/docs system and Python CLI; Luminous is the visual companion.

## Project Structure

Monorepo (pnpm workspaces). Two tracks:

### Active development (new unfolding architecture)

```
server-next  (dumb storage + Yjs sync)
client-next  (Solid.js canvas, all domain logic)
```

- `@luminous/server` (`packages/server-next`) — filesystem serving, WebSocket Yjs sync, no domain logic
- `@luminous/canvas` (`packages/client-next`) — Solid.js + cactus canvas engine, notes, freeform edges, nesting

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

The canvas engine is called **cactus** (`packages/cactus/src/`). Custom, domain-agnostic — not React Flow. Uses d3-zoom, DOM data-attribute hit-testing, composable Solid primitives. The engine supports everything we need; restrictions are in the domain layer above it.

## Docs / Specs

The `.carta/` directory contains structured specifications managed by the `carta` CLI.

- **Content edits** to existing docs: direct file editing is fine, then `carta regenerate`
- **Structural changes**: use `carta` commands (see below)
- If confused about usage, run `carta ai-skill` for the full CLI reference with examples

### Carta Commands Quick Reference

All paths are relative to the workspace root, **without** the `.carta/` prefix (e.g., `01-luminous/02-design`, not `.carta/01-luminous/02-design`).

**After any structural change**, run `carta regenerate` to rebuild MANIFEST.md. Most commands do this automatically; use `--no-regen` to skip (useful during batch operations).

| Command | Use case | Flags |
|---|---|---|
| `carta regenerate` | After editing frontmatter, or to fix a stale MANIFEST | (none) |
| `carta create <dest> <slug>` | Add a new doc to an existing section | `--title`, `--summary`, `--tags` (comma-sep), `--deps` (comma-sep), `--order`, `--dry-run` |
| `carta group <target>` | Create a new section (directory + 00-index.md) | `--title`, `--no-regen` |
| `carta delete <path> [paths...]` | Remove docs; siblings renumber to close gaps | `--dry-run`, `--output-mapping` |
| `carta move <src> <dest>` | Reorder docs or move between sections | `--order`, `--mkdir`, `--rename`, `--no-gap-close` (for batch moves), `--dry-run` |
| `carta punch <path>` | A leaf doc outgrew one file — expand into a directory | `--as-child` (put content in 01-slug.md, generate skeleton index), `--dry-run` |
| `carta flatten <path>` | A section collapsed to one doc — dissolve back to leaf | `--keep-index`, `--force`, `--at`, `--dry-run` |
| `carta rename <path> <new-slug>` | Change a doc/dir slug without moving it | `--no-regen` |
| `carta cat <ref>` | Quick-read a doc by cross-reference ID (e.g. `doc01.02.01`) | (none) |

## Tech Stack

Solid.js, TypeScript 5.9, Vite, Tailwind, Yjs (CRDT), d3-zoom, Playwright (E2E), Vitest
