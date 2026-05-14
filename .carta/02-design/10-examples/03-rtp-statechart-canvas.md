---
title: RTP statechart canvas
summary: Worked example: render RankThePlanet's XState navigation chart and concept inventory as a property-graph canvas. Two views (statechart, concept map) prove the role-based projection design end-to-end.
tags: [examples, statechart, xstate, concepts, rtp, property-graph]
deps: [doc02.11]
---

# RTP statechart canvas

A worked example driving the property-graph architecture ([doc02.11](../11-pdr-property-graph-architecture.md)). RankThePlanet (RTP) is a sibling project; its UI navigation is modeled as an XState statechart and its domain is a small set of Jackson-style concepts. Rendering both as one canvas — with two distinct views over the same graph — exercises the role-based projection mechanism end-to-end.

This is the second pipeline target ([doc02.11](../11-pdr-property-graph-architecture.md) §16 step 8) and the first one driven by a non-code domain. If the architecture can absorb statecharts + concepts cleanly, it absorbs any spec-class pipeline.

## Sidecar files

Two artifacts travel with this doc as sidecars. They are the inputs the RTP pipeline reads. They are *not* edited by Luminous; they are RTP's source of truth, copied here so task agents have full context.

- **`navigation.statechart.json`** — RTP's hierarchical + parallel XState v5 chart. Top-level parallel machine with two regions (`nav`, `overlay`); composite states with substates (e.g. `CollectionDetail` containing `mapProjection` / `listProjection`); transitions carry `description`, `actions[]`, and `meta` fields. Cross-region targets use absolute paths (`#rtp-navigation.overlay.AddToCollection`).
- **`concepts.markdown`** — RTP's concept inventory in Jackson's concept-driven design idiom. Four concepts (Collection, Location, Review, Map Overview), each with purpose, state, actions, operational principle, and composition notes. The pipeline uses this to enrich `concept.*` and `action.*` node content beyond what the statechart alone reveals.

## User story

An RTP author has a hierarchical statechart with 11 states across two parallel regions, ~30 transitions, and ~20 distinct concept-action invocations spread across the transitions. They want to:

1. **See the chart visually**, with state nesting and parallel regions rendered as containment, transitions as labeled edges, and action invocations visible as chips on transitions or in a side panel on click.
2. **Pan/zoom**, click a state and read its description, click a transition and read what action(s) it invokes.
3. **Switch readings.** Sometimes they ask "what surfaces does the user move through?" (statechart shape). Sometimes they ask "which concept actions are reachable from which surfaces?" (concept-coverage shape). Same underlying graph; entirely different layout, containment, and emphasis.
4. **Regenerate the chart on every save** without losing manual layout overrides or annotations.
5. **No install, no server, no login** to view a published chart. The artifact is a static bundle that opens via `file://`.

The current implementation (`tools/statechart/viz.py` → Mermaid HTML in RTP's repo) handles (1) and (5) but cannot do (2), (3), or (4). Luminous is the target replacement.

## Artifacts on the canvas

Five node kinds, four edge kinds. The pipeline emits these from `navigation.statechart.json` + `concepts.markdown`.

### Node kinds

| Kind | Source | Content |
|---|---|---|
| `statechart.state` | Leaf state in the chart | `description`, `tags[]`, `meta.surface`, `meta.reads[]` |
| `statechart.composite` | Non-leaf state (contains substates) | `description`, `tags[]`, `initial` (which child is default), parallel-region flag |
| `statechart.region` | A parallel region (`nav`, `overlay`) | `description`, `initial` |
| `rtp.concept` | A concept from `concepts.markdown` | `purpose`, `state` (markdown), `operationalPrinciple` (markdown) |
| `rtp.action` | A concept action (e.g. `Collection.create`) | `signature`, `description`, `conceptId` |

### Edge kinds

| Kind | From → To | Props | Role in Statechart view | Role in Concept map view |
|---|---|---|---|---|
| `statechart.substate-of` | child state → parent composite/region | — | `contain` | `hidden` |
| `statechart.transition` | state → state | `event`, `description`, `actions[]` (refs to `rtp.action`) | `arrow` | `hidden` |
| `statechart.invokes-action` | transition → action | — | `summary` (chip) | `hidden` |
| `rtp.belongs-to-concept` | action → concept | — | `hidden` | `contain` |

Note that `statechart.invokes-action` has a transition as its source, not a state. Treating transitions as first-class nodes for the purpose of "what does it invoke" is the cleanest way to model "this transition fires these N actions" without inventing a hyperedge primitive. PDR §3.1 commits to no hyperedges; this is how to live within that constraint.

## The two views

### View A — "Statechart"

```
nodeRoles: { 'statechart.state': spatial,
             'statechart.composite': spatial,
             'statechart.region': spatial,
             'rtp.concept': hidden,
             'rtp.action': latent }
edgeRoles: { 'statechart.substate-of': contain,
             'statechart.transition': arrow,
             'statechart.invokes-action': summary,
             'rtp.belongs-to-concept': hidden }
layers:    { transitions: on,
             action-chips: on,
             tag-decorations: peek }
layout:    { algorithm: 'elk', direction: 'LR-per-region' }
```

What the user sees: the chart in its Mermaid shape, but with clickable transitions whose action chips populate the inspector. Tag pills on states dimmed but visible.

### View B — "Concept map"

```
nodeRoles: { 'statechart.state': hidden,
             'statechart.composite': hidden,
             'statechart.region': hidden,
             'rtp.concept': spatial,
             'rtp.action': spatial }
edgeRoles: { 'rtp.belongs-to-concept': contain,
             'statechart.substate-of': hidden,
             'statechart.transition': hidden,
             'statechart.invokes-action': hidden }
layers:    { concept-membership: on,
             orphan-action-highlight: on }
layout:    { algorithm: 'force' }
```

What the user sees: four concept boxes (Collection, Location, Review, MapOverview), each containing its actions. Actions documented but unreferenced by any transition (`Collection.addEntry`, `Location.merge`, `Review.start`, `MapOverview.open/pan/zoom`) render with the `orphan-action-highlight` layer turned on — visually distinct so the author notices "I wrote this action down but no UI invokes it."

The two views share **one graph and one set of files**. Switching is a camera animation + relayout; positions are stored per view.

## The value

Three things the current Mermaid-based viewer cannot do:

1. **Edges are first-class clickable objects.** Mermaid's `stateDiagram-v2` does not expose transitions to click handlers. In Luminous, a click on a `statechart.transition` arrow opens its inspector content: event name, description, list of `rtp.action` chips with their concept context.
2. **The same graph supports the concept-coverage reading.** Today the only way to ask "which concepts are exercised, which actions are orphans" is to grep the JSON. View B answers it visually with no additional data.
3. **Regenerate without clobbering.** When the statechart JSON changes, the pipeline re-emits the substrate. User annotations and manual position overrides live in separate documents and survive ([doc02.11](../11-pdr-property-graph-architecture.md) §3.4). *(Deferred for v0 — single-doc canvas for now; this property lands when multi-doc composition is implemented.)*

## Features demanded

Mapping to PDR commitments and the implementation sequence in [doc02.11](../11-pdr-property-graph-architecture.md) §16.

| Feature | PDR § | Implementation phase |
|---|---|---|
| Property-graph data model with kinds | §3.1 | T0.1 contract, T1.1 graph store |
| Pack registration (kinds + renderers + views) | §5 | T1.3 pack registry, T1.5 statechart pack |
| `evaluateContainment(graph, view)` producing a per-view nesting tree | §4.3 | T1.1 |
| Role-based view runtime | §4.1 | T2.1 view evaluator |
| Containment renderer with parent-relative coords | §9.2 #6 | T2.2 |
| Clickable edges with inspector content | §6.3 | T2.4 inspector, T2.5 edge selection |
| Layer toolbar with on/peek/off states | §7 | T2.3 |
| Two saved views over the same graph | §4.8 | T3.2 |
| Hierarchical layout supporting nested containers | §4.4 | T3.3 (elkjs integration) |
| Disclosure levels driving in-canvas vs inspector content | §6 | T3.4 |

## Pipeline obligations (v0)

A single script (`scripts/build-rtp-canvas.ts` or equivalent in RTP's repo, eventually) that:

1. Reads `navigation.statechart.json` and `concepts.markdown` (the sidecars).
2. Walks the statechart tree; emits one node per state/composite/region with `substate-of` edges to its parent.
3. Walks transitions; emits one `transition` node per `(source state, event)` pair with `transition` edges from source to target. Cross-region absolute paths (`#rtp-navigation.overlay.X`) are resolved to node ids.
4. Parses `concepts.markdown` section by section; emits one `concept.*` node per concept with its purpose/state/operationalPrinciple content.
5. Parses each concept's "Actions" subsection; emits one `action.*` node per documented action with its signature and description.
6. For every action string referenced by a transition (`MapOverview.selectPin`, `Collection.create`, etc.), looks up the canonical action node (normalizing `MapOverview` ↔ `Map Overview`, stripping `(args)` from signatures). Emits a `belongs-to-concept` edge from action to concept (if not already present) and an `invokes-action` edge from the transition node to the action.
7. Writes the result as a single `.canvas.json` v3 file.

Pipeline is pure: same input → byte-identical output (modulo iteration order normalization). Errors emit `pipeline-error` nodes ([doc02.11](../11-pdr-property-graph-architecture.md) §11.1) — visible in the canvas, not buried in a console.

## Out of scope for v0

- **Multi-doc composition.** The pipeline writes one file. Annotations, position overrides, agent layers — deferred ([doc02.11](../11-pdr-property-graph-architecture.md) §3.4 lands later).
- **Rename detector / `prev_ids`.** Ids are derived from state paths + concept-action strings; refactor survival is a later concern.
- **Live file watching.** Run the pipeline manually for v0.
- **Editor mode.** Read-only ([doc02.11](../11-pdr-property-graph-architecture.md) §14).
- **MCP surface.** Verbs land in a later phase; the contract is forward-compatible.

## Validation criteria

Luminous can render this example when:

1. Opening the canvas in the static viewer shows the statechart with nested composites and parallel regions, with no manual placement of any node.
2. Clicking a transition opens an inspector showing event, description, and a list of action chips. Clicking an action chip navigates the inspector to the action node and shows its concept context.
3. Switching to the Concept map view animates to a layout where concept boxes contain their actions. Orphan actions are visually distinct.
4. Toggling the `tag-decorations` layer between `peek` / `on` / `off` in the Statechart view changes opacity without re-laying out the canvas.
5. The static bundle works via `file://` with no server.

When all five hold for this example, the property-graph architecture is load-bearing and the third pipeline (Rust) is ready to start.
