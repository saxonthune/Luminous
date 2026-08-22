---
title: Visual Perception Research for Canvas Design
status: draft
summary: Research synthesis on cognitive load theory, Gestalt principles, node-link diagram effectiveness, and information visualization best practices — applied to Luminous canvas pipelines
tags: [research, visualization, perception, cognitive-load, gestalt, pipelines]
deps: [doc02.05]
---

# Visual Perception Research for Canvas Design

Research session, 2026-04-10. Triggered by the question: if we wrote pipelines to visualize REST APIs (or any system) on a Luminous canvas, what does research say about making those visualizations actually useful? Surveyed cognitive load theory, Gestalt perception, node-link diagram empirics, and Shneiderman's information-seeking mantra.

## Shneiderman's Visual Information-Seeking Mantra

The most cited principle in information visualization (~8,000 citations): **"Overview first, zoom and filter, then details-on-demand."** (Shneiderman, 1996)

- **Overview**: the full graph at a glance — shape and clustering, not labels. The viewer orients to the *structure* before any details.
- **Zoom & filter**: drill into a cluster, hide unrelated regions. The viewer narrows to what's relevant.
- **Details on demand**: click/hover for properties, parameters, examples. Information appears only when requested.

For pipeline-generated canvases, this means the layout must *have* a legible overview — the coarse structure (resource clusters, schema regions, component groups) should be visible at minimum zoom. Cactus already supports zoom; the pipeline's job is generating layout that rewards it.

**Source**: [Shneiderman — The Eyes Have It (1996)](https://www.cs.umd.edu/~ben/papers/Shneiderman1996eyes.pdf)

## Gestalt Principles — Perceptual Backbone

These are hardwired in human visual processing. They operate pre-attentively — the brain applies them before conscious thought.

| Principle | What it does | Canvas application |
|---|---|---|
| **Proximity** | Objects near each other are perceived as a group | Group endpoints under their resource spatially. Schemas near their primary consumers. Distance alone communicates relatedness. |
| **Similarity** | Objects that look alike are perceived as the same category | HTTP method → color. Schema nodes share a distinct shape/color from endpoints. Same visual = same category, no legend needed. |
| **Enclosure** | A boundary around elements creates the strongest grouping | Nesting (which cactus supports) is the most powerful grouping signal. A resource container with its endpoints inside it is immediately parsed as hierarchy. |
| **Continuity** | The eye follows smooth paths | Edge routing should follow smooth curves. Crossing edges break continuity and measurably degrade comprehension. |
| **Common fate** | Elements that change together are perceived as related | Highlighting a request flow (animate or color the path from endpoint through schemas) leverages this — elements that light up together are read as a unit. |

The key insight: these aren't aesthetic preferences, they're perceptual invariants. A canvas that violates them *fights the viewer's visual system*. A canvas that aligns with them gets comprehension "for free."

**Source**: [Gestalt Principles for Data Visualization](https://emeeks.github.io/gestaltdataviz/section1.html)

## Node-Link vs. Matrix — Know the Crossover

Empirical studies (Ghoniem et al., Okoe et al.) found a consistent pattern:

- **Node-link diagrams win** for path-tracing tasks ("where does this schema flow?") and sparse graphs
- **Adjacency matrices win** for dense graphs (>20 nodes at density >0.4) and cluster/connectivity tasks ("which schemas reference each other?")

Most system graphs (REST APIs, component trees, module dependencies) are **sparse and path-oriented** — node-link is the right default. But heavily cross-referenced schema graphs or dense dependency matrices could benefit from a complementary matrix view.

**Practical threshold**: if a subgraph has >20 nodes and >40% possible edges filled, consider a matrix representation for that region. Below that, node-link is strictly better for all tasks except adjacency lookup.

**Sources**:
- [Okoe et al. — Node-Link or Adjacency Matrices: Old Question, New Insights (2018)](https://www2.cs.arizona.edu/~kobourov/NL-AM-TVCG18.pdf)
- [Ghoniem et al. — Matrix vs Node-Link (HAL)](https://hal.science/hal-01189106/document)

## Edge Crossings — the #1 Readability Killer

Eye-tracking studies consistently find that **edge crossings degrade comprehension more than any other visual factor**. This is the strongest empirical result in graph readability research.

Implications for pipeline layout:
- Layout algorithms should minimize crossings, even at the cost of longer edges
- Grouping related nodes spatially (resources near their schemas) naturally reduces crossings
- For dense subgraphs, consider edge bundling or curved routing rather than straight lines
- A layout with zero crossings but longer edges outperforms a compact layout with many crossings

**Source**: [Huang, Eades & Hong — Measuring Effectiveness of Graph Visualizations (2009)](https://nschwartz.yourweb.csuchico.edu/huang%20eades%20&%20hong%202009.pdf)

## Cognitive Load Theory

Cognitive load theory (Sweller et al.) distinguishes three types of mental load:

- **Intrinsic**: complexity inherent in the domain (the actual API complexity — can't reduce this)
- **Extraneous**: complexity from poor presentation (our job to minimize)
- **Germane**: mental effort toward building understanding (our job to maximize)

Techniques that reduce extraneous load and increase germane load:

- **Progressive disclosure**: don't show all schema properties by default. Show name + type count; expand on interaction. This directly implements Shneiderman's details-on-demand.
- **Reduce split attention**: encode meaning in the nodes themselves (color, shape) so the viewer never has to look away to a legend or documentation. When the explanation is *in* the visual, attention stays unified.
- **Avoid redundancy**: if nesting already communicates hierarchy, hierarchy edges are redundant. Redundant encoding wastes cognitive budget — the viewer processes the same information twice without benefit.
- **Spatial contiguity**: related information should be spatially close. A schema referenced only by one endpoint should be near that endpoint, not in a distant "schemas" region.

**Source**: [Cognitive Architecture and Instructional Design: 20 Years Later (Sweller et al., 2019)](https://link.springer.com/article/10.1007/s10648-019-09465-5)

## Synthesis: Design Principles for Canvas Pipelines

Combining all of the above into actionable principles for Luminous pipeline output:

1. **Cluster by semantic relationship** (proximity + enclosure). Nesting handles hierarchy; spatial proximity handles association. Resources contain their endpoints; schemas sit near their primary consumers.

2. **Color-code by category** (similarity). Method colors for endpoints, distinct hue for schemas, another for external sources. The viewer classifies nodes pre-attentively — before reading any label.

3. **Minimize edge crossings above all else**. This is the single highest-impact layout decision. Place schemas near the endpoints that reference them. A schema referenced by only one endpoint should be adjacent; shared schemas naturally migrate to the center of their consumer cluster.

4. **Support progressive detail** (Shneiderman + cognitive load). Compact nodes at overview zoom (name + icon), expandable on interaction (properties, parameters, examples). The pipeline should emit both the summary and detail data; the canvas controls disclosure.

5. **Generate at multiple granularities**. Resource-only (coarse), endpoint-level (medium), full schema graph (fine). Each level is a valid overview for different questions. This isn't just zoom — it's semantic abstraction.

6. **Eliminate redundant encoding**. If nesting shows hierarchy, don't also draw hierarchy edges. If color shows type, don't also add type labels. Every encoding should carry *new* information.

7. **Tension: conceptual grouping vs. crossing minimization**. Grouping all schemas together provides conceptual clarity ("here are the data models"). But it creates long edges with many crossings. Research favors **crossing minimization** — scatter schemas near their consumers, and rely on color similarity to maintain categorical identity across distance.
