# Luminous

## What This Is

Luminous bridges human visual thinking and AI structured context. Humans reason well with spatial canvas tools; AI performs well with high-quality structured context. Luminous is the interface between both — a canvas where humans see and arrange software artifacts, backed by structured data that AI agents can read, query, and act on. Work flows in both directions.

This is a *design* tool, not a diagramming tool. It was extracted from the Carta monorepo as the TypeScript/React visual layer. Carta remains the spec/docs system and Python CLI; Luminous is the visual companion.

## Project Structure

Monorepo (pnpm workspaces). Two tracks:

### Active development (new unfolding architecture)

```
server-next  (dumb storage + file-change notifications)
client-next  (Solid.js canvas, all domain logic)
```

- `@luminous/server` (`packages/server-next`) — filesystem serving, WebSocket file-change notifications, no domain logic
- `@luminous/canvas` (`packages/client-next`) — Solid.js + cactus canvas engine, notes, freeform edges, nesting

### Legacy (schema-first, being superseded)

```
geometry → schema → document → server
                  ↘ web-client
                  ↘ vscode
```

These still work but carry schema-first assumptions that contradict the unfolding direction. See PDR (doc02.01) for the migration plan.

## Current Milestone

**Milestone 1: Solid.js Project Summary Canvas.** A pipeline script that performs static analysis of this Solid.js codebase and emits a `.canvas.json` with the component tree (one color), reactive signals (another color, nested in their creating component), and external data sources (a third color). Signals point to their consumers via distinct edge colors. See `.carta/01-luminous/01-vision/03-milestones.md` for the full roadmap.

## Development Philosophy

- **Unfolding process**: start minimal, grow complexity only when forces demand it. Every change should be a structure-preserving transformation. Living software starts small and develops centers and ornamentation as feature complexity evolves.
- **Happy path first**: implement the minimal end-to-end path. Complex algorithms, guards, and elaborate systems come only when sufficient forces cross the threshold — change in quantity begets change in quality.
- **Two sources of truth**: only product expectations and source code are sources of truth. Specs and docs in carta bridge the gap between them — they don't replace either side.
- **Refactorability**: every part (specs, artifacts, code) must be refactorable. Avoid structures that resist change — they become degenerative over time and require massive investment to evolve.
- **Willing to delete**: no backward compatibility with features nobody uses. If something isn't earning its place, remove it.

## Architecture Direction

See `.carta/01-luminous/02-design/01-pdr-unfolding-architecture.md` for full details. Key decisions:

- **Polymorphic nodes.** Notes are the primary node type, but the data model is a discriminated union — portals, pipeline-generated nodes (components, signals), and future types share base properties (position, size, nesting) and differ by `type` field.
- **Freeform edges first, ports later.** Any node to any node, optional label. Three-polarity port system (in/out/neutral) available for typed constructs.
- **Server is storage, client is intelligence.** Server serves files and broadcasts file-change notifications over WebSocket. Client owns all domain logic.
- **Diagram pipelines.** Scripts that read source code via static analysis and emit `.canvas.json`. The pipeline is the reusable artifact — shareable across projects and communities. Each pipeline defines its own node types from the forces of its domain; we don't pre-build a universal schema of typed nodes.
- **Willing to delete.** No backward compatibility with features nobody uses.

### Graph vs pack: different update frequencies

A `.graph.json` and its `.pack.json` change at very different rates. Graphs churn — every pipeline run, every authored edit. Packs are stable libraries: kinds, schemas, render templates, view defaults. This asymmetry decides where settings live: anything that should *travel with the data* (per-canvas one-offs, pipeline-derived hints) belongs on the graph; anything that should *travel with the vocabulary* (layout defaults, disclosure, view definitions) belongs on the pack. When in doubt, ask "would another canvas using this pack want the same thing?" — yes → pack, no → graph.

## Canvas Engine

The canvas engine is called **cactus** (`packages/cactus/src/`). Custom, domain-agnostic — not React Flow. Uses d3-zoom, DOM data-attribute hit-testing, composable Solid primitives.

**Engine/domain boundary.** Luminous translates the intention of graph + pack declarations into a visual canvas; cactus *is* that visual API. So the split is not "engine supports everything, domain restricts" — it's by *kind of concern*:

- **Visual and interaction concerns belong in cactus** — how the canvas looks and behaves: layout, drag, snapping, collision-free placement, hit-testing. These are not domain logic and should not leak into the domain layer.
- **Meaning belongs in the domain layer** (`client-next`) — what nodes and edges *are*, the graph + pack declaration, what is semantically allowed.

cactus operates on the rendered projection (the DOM — `data-container-id` nesting, measured rects), not the abstract graph. The domain layer declares intent and persists results; it does not compute visual geometry.

This boundary is a first-class design principle under active test — see PDR D8 (doc02.01) for the rationale and the experimental hypothesis (does enforcing it yield more maintainable, faster-to-iterate software).

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
| `carta cat <ref>` | Quick-read a doc by cross-reference ID (e.g. `doc02.01`) | (none) |

### Pack/graph schema changes

When a change adds or modifies a field in the pack or graph schema — including optional nodeKind props that have engine-side behavior (e.g. `tier`) — update `.claude/skills/luminous-pipeline/SKILL.md` in the same change. A sibling-repo pipeline agent was blocked because it grep'd the skill for `tier`, found nothing, and couldn't act without asking a human.

## Tech Stack

Solid.js, TypeScript 5.9, Vite, Tailwind, d3-zoom, Playwright (E2E), Vitest

## Task Runner

Task commands live in the root `justfile`, not in package.json. package.json holds
only dependencies, metadata, exports, and bin entries. Run `just` (or `just --list`)
to see all recipes. Common ones: `just build`, `just test`, `just typecheck`,
`just lint`, `just dev`, `just mcp` (regenerate the MCP server bundle).

Per-package recipes exist too (e.g. `just test-mcp`, `just typecheck-core`).

## Type Checking

Use `tsgo` (TypeScript 7.0 Go-native beta, ~10× faster) for type checking. `tsc` is still used for emit (build).

- `just typecheck` — runs `tsgo --noEmit` across all packages
- `pnpm -C packages/<pkg> exec tsgo --noEmit -p <tsconfig>` — check a single package
- Build scripts (`tsc -b`, `tsc -p`) stay as-is — tsgo does not emit in the beta

## Searching and reading files

Shell hygiene rules — use the dedicated tools and avoid command forms that
trigger approval prompts — live in the user-level `~/.claude/CLAUDE.md`, shared
across all repos.
