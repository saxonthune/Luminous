---
title: Pack Contract
summary: A pack is JSON data owned by the domain it describes, co-located with its graph as a sibling file. What a pack declares, how a graph names it, and how Luminous resolves it.
tags: [pack, contract, schema, data, co-location]
deps: [doc02.11, doc02.16]
---

# Pack Contract

A pack is the unit of domain vocabulary in Luminous. Every domain — a statechart, a Solid component tree, a Rust module graph — has one pack declaring its node and edge kinds, how they render, and what views project them.

**A pack is data, not code.** It is a JSON file. It declares kinds, renderer compositions, views, layers, and disclosure schemas as plain data; Luminous supplies the single interpreter that gives that data behaviour ([doc02.16](16-renderer-engine.md)). A pack ships no Solid components, no `package.json`, no build step. The one exception — custom rendering primitives for specialized domains — is the escape hatch described in [doc02.16](16-renderer-engine.md), not the common case.

This is a deliberate reversal of the earlier "packs are trusted code" model (PDR [doc02.11](11-pdr-property-graph-architecture.md) §5, D8). The reasons follow.

## A pack belongs to its domain

A pack is a conversion of *domain concerns* into data. The concerns belong to the domain — the repo being modeled — so the pack belongs there too, beside the domain's own source. A pack is not part of Luminous and is not contributed to the Luminous monorepo.

This is what lets an agent working in any repo produce a Luminous model of that repo with no change to Luminous: it writes a graph file and a pack file into the repo it already has. The repo owns both. Luminous owns only the runtime that interprets them.

| Owns | What |
|---|---|
| The domain repo | `*.graph.json` (the model) and `*.pack.json` (the vocabulary). Pure data. |
| Luminous | The runtime: primitive vocabulary, renderer interpreter, layout algorithms, projection, pack resolution, fallback rendering. |

## Co-location: a pack sits next to its graph

A pack file and the graph file it serves are **siblings in the same directory, sharing a basename**:

```
<domain-repo>/.canvases/
  navigation.graph.json     ← the model
  navigation.pack.json      ← its vocabulary
```

The pairing is **1:1 by default**. The data model assumes one pack per graph; nothing is built to optimize a pack shared across graphs. That case is reachable (see "Resolution" below) but it is not the default and carries no special support.

Because a pack and its graph live in the same directory, in the same repo, under the same git history, they are **co-versioned by construction** — they change together in one commit. There is therefore no semver negotiation between them: no version *range* on the graph side, and the pack's `version` field is human-facing metadata only. Nothing resolves against it.

## How a graph names its pack

A graph file declares the pack it needs with a single `pack` field — a name:

```jsonc
{
  "version": 3,
  "pack": "navigation",        // ← names navigation.pack.json
  "nodes": [ ... ],
  "edges": [ ... ],
  "defaultView": "overview"
}
```

This replaces the earlier `packs` field — a *map* of pack-id → semver range. The map assumed many packs per graph and independent versioning; neither holds. `packs` collapses to `pack` (a single string), and the semver range is dropped entirely.

The field is always written explicitly (a generated graph is self-documenting about what it needs), and by convention its value equals the graph's own basename — that is what "share the same name by default" means.

## Resolution

`pack` is a name, resolved by a rule, not a registry lookup:

> `"pack": "<name>"` resolves to `<name>.pack.json` in the **same directory as the graph file**.

The client already loads a graph by path; it derives the sibling pack path from that directory plus the `pack` value, fetches it, and registers it scoped to that graph. The server treats `.pack.json` files as opaque bytes, exactly as it does graph files — pack resolution is client-side domain logic.

Two consequences fall out of using an explicit name rather than pure filename convention:

- **Shared packs are reachable without special machinery.** If two graphs ever genuinely share a vocabulary, both set `"pack": "shared"` and both resolve to `shared.pack.json`. Not the default; not walled off.
- **Built-in packs are a reserved case.** A name with no sibling file (e.g. `"pack": "primitives"`) falls back to a Luminous-shipped built-in pack. This gives "generic boxes and arrows" with no pack authoring at all.

## Pack file shape

```jsonc
{
  "id": "navigation",          // must equal the filename basename
  "version": "0.1.0",          // informational only — never resolved against
  "description": "...",

  "nodeKinds": [
    {
      "id": "nav.screen",
      "label": "Screen",
      "props": { /* JSON Schema for this kind's node props */ },
      "render": { /* renderer JSON — see doc02.16 */ }
    }
  ],
  "edgeKinds": [
    {
      "id": "nav.transition",
      "label": "Transition",
      "directed": true,
      "props": { /* JSON Schema */ },
      "render": { /* renderer JSON */ }
    }
  ],

  "views": [ /* role assignments, layout, defaults — see doc02.11 §4 */ ],
  "layers": [ /* edge-kind layer declarations — see doc02.11 §7 */ ],
  "disclosure": [ /* per-kind, per-level field selection — see doc02.11 §6 */ ]
}
```

Every field is plain JSON. Notably absent versus the old code-pack `Pack` interface:

- **No `nodeRenderers` / `edgeRenderers` code maps.** Rendering is the `render` data field on each kind, interpreted by the engine ([doc02.16](16-renderer-engine.md)).
- **No `idDerivation` functions.** Deterministic node IDs are the *pipeline's* concern — the pipeline that emits the graph derives stable IDs from source content. The pack describes kinds; it does not mint IDs.
- **No `package.json`, no `dependsOn`, no semver ranges.** A pack is one self-contained JSON file.

### What a pack must declare

1. `id` (= filename basename), `version`, `description`.
2. Every `nodeKind` and `edgeKind` it introduces, each with `id`, `label`, and a `props` JSON Schema.
3. A `render` composition for every kind (or rely on fallback rendering — see below).
4. At least one `view` assigning a role to every declared kind.

### What is optional

`layers`, `disclosure` schemas, additional `views`, and custom primitives ([doc02.16](16-renderer-engine.md)). A pack with none of these still loads and renders.

## Fallback when a pack is missing or incomplete

Resolution never hard-fails. The rules are in [doc02.16](16-renderer-engine.md); in summary:

- Kind known, no `render` for the current disclosure level → walk `DISCLOSURE_ORDER` for a registered level.
- Kind known, no `render` at all → engine generates a default card from the kind's `props` schema.
- Pack missing, or `kind` referenced by no declared kind → default card over the literal `props` object.

A graph from an unknown source still produces a legible picture; authoring a pack is an opt-in upgrade, never a precondition for the graph to open.

## What this supersedes

The following from earlier docs no longer hold:

- Packs as npm packages under `packages/pack-*`, imported at compile time into `client-next` and registered via `registerPack` (the current `pack-primitives` / `pack-rtp-statechart` packages are legacy; they migrate to data packs or remain as Luminous-shipped built-ins).
- The `packs` map with semver ranges on the graph file.
- The "trusted components / explicit install" trust model (PDR [doc02.11](11-pdr-property-graph-architecture.md) D8, §5.6) — a data pack executes nothing, so there is nothing to trust beyond the JSON parser and the fixed primitive set Luminous ships.
