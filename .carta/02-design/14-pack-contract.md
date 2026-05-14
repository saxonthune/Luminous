---
title: Pack Contract
summary: What a pack must provide, what it may provide, how registration works, and the current enforcement gap between the contract and CanvasHost's hard-wired references.
tags: [pack, contract, schema, registry, gap]
deps: [doc02.11]
---

# Pack Contract

A pack is the unit of extension in Luminous. Every domain — statechart, Solid component tree, Rust module graph — ships one pack. The pack bundles kinds, renderers, views, layers, and disclosure schemas into a single import. The runtime registers it once; from that point on, all consumers query the registry.

This document defines the contract a pack author must satisfy, and calls out the current enforcement gap between the stated contract and what `CanvasHost` actually does.

## What a pack must provide

The `Pack` interface (`packages/core/src/types.ts`) requires:

| Field | Type | Purpose |
|---|---|---|
| `id` | `PackId` | Globally unique identifier (e.g. `"rtp.statechart"`). Duplicate registration throws. |
| `version` | `string` | Semver string. Matched against the `packs` field in `.graph.json`. |
| `nodeKinds` | `NodeKind[]` | Every node kind the pack introduces. Each kind declares a props schema, label, and id-derivation function. |
| `edgeKinds` | `EdgeKind[]` | Every edge kind the pack introduces. Each kind declares a props schema, directedness, and optional endpoint constraints. |
| `views` | `View[]` | At least one saved view that assigns roles to this pack's node and edge kinds. |
| `layers` | `Layer[]` | The layer set for toggling edge subsets in the viewer. May be empty. |
| `disclosureSchemas` | `DisclosureSchema[]` | Per-kind field-path selections for each disclosure level (`peek`, `card`, `open`, `deep`). |
| `nodeRenderers` | `Record<KindId, Partial<Record<DisclosureLevel, NodeRenderer>>>` | Solid component factories for each node kind, keyed by disclosure level. |
| `edgeRenderers` | `Record<KindId, Partial<Record<DisclosureLevel, EdgeRenderer>>>` | Solid component factories for each edge kind. |

## What a pack may provide

| Field | Type | Purpose |
|---|---|---|
| `description` | `string` | Human-readable summary shown in pack discovery tools. |
| `dependsOn` | `Record<PackId, string>` | Other packs this pack extends (semver ranges). Loader can verify presence. |
| `namedQueries` | `NamedQuery[]` | MCP-callable graph queries the pack exposes. Each query is a pure function over the graph. |

## Registration model

`registerPack(pack)` (`packages/core/src/registry.ts:19`) unpacks the `Pack` object into module-level `Map` globals:

- `nodeKinds: Map<KindId, NodeKind>`
- `edgeKinds: Map<KindId, EdgeKind>`
- `nodeRenderers: Map<KindId, Partial<Record<DisclosureLevel, NodeRenderer>>>`
- `edgeRenderers: Map<KindId, Partial<Record<DisclosureLevel, EdgeRenderer>>>`
- `views: Map<ViewId, View>`
- `layers: Map<LayerId, Layer>`
- `disclosureSchemas: Map<KindId, DisclosureSchema>`
- `packs: Map<PackId, Pack>`

**Duplicate-kind rejection.** If any kind id, view id, layer id, or disclosure schema kind is already registered, `registerPack` throws immediately with a message naming both the duplicate id and the pack that first claimed it. This makes collisions loud at startup rather than silent at render time.

The renderer getter (`packages/core/src/registry.ts:138`) implements level fallback: if a pack registers a renderer only at `card` level, requests for `peek` level walk up the `DISCLOSURE_ORDER` array until they find a registered level or return `undefined`.

Packs are registered at module load time (call `registerPack` at the top level of the pack's `index.ts`, or call `ensurePacksRegistered()` in the app shell before the first load). There is no deferred or lazy registration mechanism.

## The enforcement gap

Luminous **defines** the pack contract but does not yet **enforce** it as a runtime seam.

`CanvasHost` (`packages/client-next/src/CanvasHost.tsx`) hard-wires the RTP statechart pack directly:

```ts
// CanvasHost.tsx:15
const [activeViewId, setActiveViewId] = createSignal<string>(rtpStatechartPack.views[0].id);

// CanvasHost.tsx:24
const activeView = createMemo<View>(
  () => rtpStatechartPack.views.find((v) => v.id === activeViewId()) ?? rtpStatechartPack.views[0],
);

// CanvasHost.tsx:28
const activeLayers = createMemo(() =>
  rtpStatechartPack.layers.filter((l) => l.id in activeView().layers),
);
```

The correct architecture would have `CanvasHost` read the loaded graph's `packs` declaration, look up each pack in the registry, and resolve views and layers from there. Until that indirection is added, loading a `.graph.json` that references a different pack will render with the RTP pack's views regardless.

This is a known deferred follow-up (see `doc02.15` for where MCP tool design intersects with this gap). The gap does not affect correctness for the current single-pack workflow; it becomes a defect when a second pack ships.

## Third-party pack checklist

A future pack author must:

1. Assign a unique `id` (reverse-domain style recommended: `"acme.rust"`, `"myco.quint"`).
2. Declare all node and edge kinds with Zod (or equivalent) props schemas.
3. Provide at least one `View` that gives every declared node kind a role (`spatial`, `latent`, or `hidden`) and every declared edge kind a role (`contain`, `arrow`, `summary`, or `hidden`).
4. Provide a `DisclosureSchema` for every node kind that will be rendered spatially.
5. Provide node renderers for at least the `card` disclosure level for every spatial node kind.
6. Call `registerPack(myPack)` at module load time (before any graph is loaded).
7. Declare the pack in the `.graph.json` file's `packs` field with a semver range that matches `version`.
