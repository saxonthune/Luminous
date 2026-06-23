# Packs as data

Move Luminous from code packs (npm-style `@luminous/pack-*` packages imported at
compile time into `client-next`) to **data packs**: a pack is one JSON file, owned
by the domain repo and co-located with its graph as a sibling `<name>.pack.json`.
When the epic is done, an agent working in any repo can produce a Luminous model of
that repo — a `graph.json` plus its sibling `pack.json` — with no change to
Luminous itself.

Design of record: `.carta/02-design/14-pack-contract.md` (pack contract),
`16-renderer-engine.md` (renderers as data), `11-pdr-property-graph-architecture.md`
§5 (superseded banner), `18-pack-examples.md`.

## Scope

- Graph file format: `packs` map → single `pack` string; no semver (co-versioned).
- Pack resolution by name, with Luminous-shipped built-in packs.
- A renderer interpreter in `@luminous/core`: `render` JSON over a fixed primitive
  vocabulary, with fallback rendering.
- The `pack.json` on-disk format + sibling-file loading; server serves pack files.
- Migrate the existing `primitives` and `rtp-statechart` packs to data packs.
- MCP pack introspection/authoring; a skill teaching graph + pack authoring.

## Phases

Phase 00 (`graph-pack-field`, the `packs` → `pack` format flip) was triaged and
executed separately and is **not** part of this epic. Phases 01–06 are the epic.
Recommended order is the listed order; dependencies below.

| Phase | Subject | Blocked by |
|---|---|---|
| 01 | Pack resolution by name | 00 (graph-pack-field) |
| 02a | Renderer engine — JSON schema, interpreter, fallback generator | 01 |
| 02b | Atom primitive vocabulary | 02a |
| 02c | Wire rendering through the interpreter; migrate `pack-primitives` | 02b |
| 03 | `pack.json` format + sibling loading | 02c |
| 04 | Migrate rtp-statechart to a data pack; delete legacy renderer path | 03 |
| 05 | MCP tools for the data-pack world | 03 |
| 06 | Skill: authoring a graph + pack from a repo | 03 |

Phases 04, 05, 06 can run in parallel once 03 lands. Phase 02 was split at triage
into 02a/02b/02c (engine / vocabulary / integration).

## Triage-ahead contract

This epic is triaged as a chain *ahead of code* — every phase's spec is written
before its predecessor has merged. To make that safe, each spec ends with a
**`## Surface after this phase`** section: the symbols, files, and behaviours that
phase promises to produce. A downstream phase triages against its predecessor's
*declared Surface*, not against merged code. The executing agent is held to the
Surface by its verification gate; if it deviates, the `.result.md` must flag the
deviation loudly and the affected downstream specs are re-checked before launch.

### Cross-cutting contract decisions (settled at chain triage)

- **`RenderNode`** — renderer JSON is a permissive tree: `{ type: string; children?:
  RenderNode[]; [prop: string]: unknown }`. The interpreter and primitive components
  do per-`type` interpretation; there is no exhaustive discriminated union.
- **Two render paths coexist through 02c and 03.** Interpreted `render` JSON is
  preferred; the legacy code `NodeRenderer`/`EdgeRenderer` path remains as a
  fallback for kinds with no `render`. Phase 04 deletes the legacy path once
  `pack-rtp-statechart` (its last user) is migrated.
- **`content`** in renderer JSON (`{content.field}`) binds to a node's / edge's
  `props` object.
- Built-in packs as a first-class concept were **dropped** at Phase 01 triage; any
  registered pack is resolvable by name. Phase 03 reintroduces only what sibling
  loading strictly needs (a name with no sibling file falls back to a
  Luminous-shipped pack).

## Validation (epic done when)

A graph file placed in a non-Luminous repo (e.g. `RankThePlanet/.canvases/`), with
its own sibling `*.pack.json`, opens in Luminous and renders correctly — the pack
is loaded from disk as data, with zero Luminous code change. An agent given the
pipeline-authoring skill can produce that graph + pack pair for a fresh repo.
