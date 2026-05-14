---
title: RTP statechart canvas
summary: Worked example. RankThePlanet (RTP) hands Luminous a navigation statechart and a concept inventory; Luminous renders both as one property graph with two views (statechart shape, concept-coverage shape).
tags: [examples, statechart, xstate, concepts, rtp, property-graph]
deps: [doc02.11]
---

# RTP statechart canvas

## Intent

This example exercises the property-graph architecture ([doc02.11](../11-pdr-property-graph-architecture.md)) end-to-end against a non-code domain. RankThePlanet (RTP) is a sibling project whose UI navigation is modeled as an [XState](https://stately.ai/docs/xstate) statechart and whose domain is a small set of [Jackson-style concepts](https://essenceofsoftware.com/). Both artifacts already exist as RTP's source of truth — Luminous receives them, never edits them.

The example tests three claims of the property-graph design:

1. **One graph, many views.** The statechart shape ("which surfaces does the user move through?") and the concept-coverage shape ("which concept actions are reachable from which surfaces?") read from the same underlying nodes and edges. The only thing that differs is which edge kind plays the `contain` role and which nodes are `spatial` vs `latent` vs `hidden` per view.
2. **Edges as first-class objects.** Mermaid's `stateDiagram-v2` renders transitions as ornaments — un-clickable, un-inspectable. The property-graph model promotes transitions to nodes (so they can carry props, invoke actions, and open inspector panels) and uses edge kinds to express the relationships between them.
3. **Bridging spec domains.** The statechart and concept inventory are independent artifacts authored in different idioms. The pipeline that emits the canvas links them by resolving action strings on transitions (`Collection.create`, `MapOverview.selectPin`) to the canonical action nodes from the concept inventory. The bridge is data, not code.

RTP's current Mermaid-based visualization renders the statechart shape but cannot click transitions, cannot switch readings, and gives no visual answer to "which documented actions are orphaned by the UI." This example is a forcing function for those capabilities.

## Input artifacts

Two files travel with this doc as sidecars. They are RTP's authoritative source; the canvas pipeline reads them, parses them, and emits a property graph.

- **`03-navigation.statechart.json`** — the XState v5 navigation chart.
- **`03-concepts.markdown`** — the concept inventory in Jackson's idiom.

### `navigation.statechart.json`

A hierarchical, parallel XState v5 machine with [predictableActionArguments](https://stately.ai/docs/migration#predictable-action-arguments) semantics. Top-level shape:

```jsonc
{
  "id": "rtp-navigation",
  "type": "parallel",
  "states": {
    "nav":     { /* region: top-level surfaces */ },
    "overlay": { /* region: modals and pickers layered over nav */ }
  }
}
```

The chart has the following structural elements:

| Element | XState construct | Examples in RTP |
|---|---|---|
| Region | `type: "parallel"` child of root | `nav`, `overlay` |
| Composite state | `states: { … }` non-empty | `CollectionDetail` (contains `mapProjection` / `listProjection`) |
| Leaf state | `states` absent | `MapOverview`, `ReviewForm.editing` |
| Transition | entry in a state's `on: { EVENT: target }` | `OPEN_REVIEW_FORM` from `CollectionDetail.listProjection` → `overlay.ReviewForm` |
| Cross-region target | absolute path with `#machineId` prefix | `#rtp-navigation.overlay.AddToCollection` |
| `meta.surface` | string on a leaf state | `"list-projection"` |
| `meta.reads` | string array on a leaf state | `["Collection.state", "Review.state"]` |
| `actions` on transition | string array of `Concept.action` references | `["Collection.addEntry", "Map.recenter"]` |
| `description` on transition | freeform string | "user submits the review form; the entry is appended to the active collection" |

The chart's two regions are orthogonal: at any moment the user is in exactly one `nav` state and one `overlay` state simultaneously. Transitions in one region don't affect the other. Cross-region targets express *triggered* navigation across the orthogonal product (e.g. tapping a list row opens a `ReviewForm` overlay without leaving the underlying `CollectionDetail`).

Counts in the current RTP chart: 2 regions, 11 leaf or composite states, ~30 transitions, ~20 distinct action invocations.

### `concepts.markdown`

A Jackson-style concept inventory. Each top-level section defines one concept; the document also defines a small synchronization section describing how concepts compose. Each concept section follows a fixed sub-structure:

```markdown
## Collection

**Purpose:** a curated list of locations the user has reviewed.

**State:**
- entries: List<{ location: Location, review: Review }>
- name: string

**Actions:**
- create(name) — start an empty Collection.
- addEntry(location, review) — append an entry. Same Location across Collections = multiple entries.
- export(format) — produce a shareable artifact.

**Operational principle:**
After create(name), addEntry(location, review) appends; export(format) produces a stable view of the entries in insertion order.
```

| Section | Form | Carries |
|---|---|---|
| Purpose | one-line declarative sentence | what this concept is *for* (Jackson's "operationalisable goal") |
| State | bulleted list with type annotations | the data the concept owns |
| Actions | bulleted list, each `name(signature) — description` | every operation the concept admits |
| Operational principle | a short narrative of action sequences | how the concept *behaves* when its actions compose |
| Composition notes (optional) | freeform | how this concept interacts with others |

The four concepts in the current RTP inventory: **Collection**, **Location**, **Review**, **Map Overview**. Some actions documented here have no transition that invokes them — those are the orphans the concept-map view exists to surface.

## What the pipeline produces

The canvas pipeline derives a property graph from the two inputs. Node and edge kinds are defined by the `rtp-statechart` pack ([doc02.11](../11-pdr-property-graph-architecture.md) §5).

### Node kinds

| Kind | Source | Content |
|---|---|---|
| `statechart.region` | A parallel region of the chart | `description`, `initial` |
| `statechart.composite` | A non-leaf state containing substates | `description`, `tags[]`, `initial`, `parallel` |
| `statechart.state` | A leaf state | `description`, `tags[]`, `surface`, `reads[]` |
| `statechart.transition` | A `(source state, event)` pair | `event`, `description`, `actions[]` |
| `rtp.concept` | A concept section | `name`, `purpose`, `state`, `operationalPrinciple` |
| `rtp.action` | An action under a concept | `name`, `signature`, `description`, `conceptId` |

Transitions are nodes, not edges. Promoting them lets a transition own its description and its list of invoked actions without inventing a hyperedge primitive ([doc02.11](../11-pdr-property-graph-architecture.md) §3.1 forbids hyperedges).

### Edge kinds

| Kind | From → To | Statechart view | Concept-map view |
|---|---|---|---|
| `statechart.substate-of` | child state → parent composite or region | `contain` | hidden |
| `statechart.transition` | source state → target state | `arrow` | hidden |
| `statechart.invokes-action` | transition → action | `summary` (chip on the transition) | hidden |
| `rtp.belongs-to-concept` | action → concept | hidden | `contain` |

A view assigns one role per edge kind. `contain` produces the nesting tree the renderer reads ([doc02.11](../11-pdr-property-graph-architecture.md) §4.3). `arrow` draws a line. `summary` collapses to a chip on its source. `hidden` removes the edge from the view's projection.

### The two views

**Statechart view.** `region` / `composite` / `state` are spatial; `concept` is hidden; `action` is latent (rendered only as chips via `summary` edges). `substate-of` is `contain`, transitions are `arrow`, action invocations are `summary`. Layout is hierarchical (ELK) with left-to-right flow per region.

**Concept-map view.** `concept` and `action` are spatial; statechart kinds are hidden. `belongs-to-concept` is `contain` — concepts box their actions. Layout is force-directed or grid. Orphan actions (no incoming `invokes-action` edge) carry a layer flag the renderer uses to mark them visually distinct.

Both views read the same property graph file. Switching views changes the projection, not the data.

## Why this example

A statechart-plus-concepts pipeline is the smallest realistic case that demands every load-bearing piece of the property-graph design: containment that varies per view, edge promotion to nodes, role-based projection, layered visibility, and a non-code source domain. A pipeline that can absorb XState and a Jackson concept document cleanly absorbs any spec-class input — protocol definitions, API surfaces, organizational charts. The shape of the input changes; the substrate does not.
