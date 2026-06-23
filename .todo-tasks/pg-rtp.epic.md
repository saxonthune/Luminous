# Property-graph architecture, driven by the RTP canvas

Implement the property-graph design (doc02.11) end-to-end, with the RankThePlanet statechart + concept canvas (doc02.10.03) as the validation gauge. When all 14 phases are done, opening the RTP canvas in Luminous proves the architecture is load-bearing: same graph, two views, clickable edges, nested containment, layer toggles, static-bundle viewer.

## Scope

- New `@luminous/canvas-core` package owns the typed contract (already drafted in `packages/canvas-core/src/types.ts`).
- Extend cactus for nested containment, edge selection, layer states.
- Pack registry pattern, with one combined `rtp-statechart` pack as the first concrete pack.
- Single-file `.canvas.json` v3 loader (multi-doc composition deferred).
- Pipeline script that emits the RTP canvas from the two sidecars at `.carta/02-design/10-examples/`.
- Two views over the same graph (Statechart, Concept map) with elkjs auto-layout and disclosure levels.

## Phases

The 14 phases below have dependencies wired in the in-memory task tracker. Critical path: 01 → 06 → 07 → 13. Parallelism opens up after 01 lands.

| Phase | Subject | Blocked by |
|---|---|---|
| 01 | Graph store + evaluateContainment | — |
| 02 | Single-file canvas v3 loader | 01, 03 |
| 03 | Pack registry | 01 |
| 04 | RTP pipeline script | 05 |
| 05 | Statechart pack v0 | 03 |
| 06 | View evaluator: graph + view → scene | 01 |
| 07 | Containment renderer with parent-relative coords | 06 |
| 08 | Layer system + toolbar | 06 |
| 09 | Inspector panel skeleton | 10 |
| 10 | Edge selection | 06 |
| 11 | Statechart-specific card renderers | 05 |
| 12 | Concept map view | 05, 06 |
| 13 | Elk auto-layout with nested containers | 07 |
| 14 | Disclosure levels (peek, open) | 09, 11 |

## Validation (epic done when)

Opening `rtp-statechart.canvas.json` in the static viewer:
1. Renders the statechart with nested composites and parallel regions, no manual placement.
2. Clicking a transition opens an inspector showing event, description, and action-chip list with concept context.
3. Switching to "Concept map" view animates to a layout where concept boxes contain their actions; orphan actions visually distinct.
4. Toggling `tag-decorations` layer between on/peek/off changes opacity without re-laying out.
5. Static bundle works via `file://` — no server, no install on the consumer side.
