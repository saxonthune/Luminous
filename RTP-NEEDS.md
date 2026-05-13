# RTP needs from Luminous

A consumer-perspective ask from **RankThePlanet** (RTP), a sibling project. Written so a Luminous session can scope what (if anything) needs to change in Luminous to support this use case. Nothing in here is a demand — RTP wants to know whether Luminous already does this, and where the gaps are.

## The use case

RTP designs its UI navigation as an **XState v5 statechart** stored as a JSON sidecar in its carta workspace (`.carta/02-design/02-interaction/01-navigation.statechart.json`). The chart is hierarchical (composite states with substates) and parallel (top-level `nav` + `overlay` regions). It carries metadata on every state and transition: `description`, `tags`, `meta.surface`, `meta.reads`, and `actions: ["Concept.action", ...]` arrays that name the concept-level effects each transition invokes.

RTP wants to **look at this chart visually** — pan/zoom, click a state and see its description + tags + concept actions in a side panel, click a transition and see what events trigger it and what concept actions it invokes. Today RTP has a Mermaid-based local viewer (`tools/statechart/viz.py` → `stateDiagram-v2` HTML page). It works but is constrained: Mermaid layout is opaque, edges aren't clickable, and the metadata side panel is bolted on with brittle DOM scraping (Mermaid's `click X call fn(...)` directive is not supported in stateDiagram-v2).

Luminous looks like a much better fit because the **canvas-with-typed-nodes-and-clickable-metadata** pattern is exactly what Luminous already does for the Solid.js project canvas.

## What RTP imagines doing

RTP would write its own pipeline script (analogous to `scripts/analyze-solidjs.ts`) that:

1. Reads `.carta/**/*.statechart.json`.
2. Walks the XState config tree.
3. Emits a `.canvas.json` with: a `state` node schema, a `transition` edge schema, geometry from an auto-layout pass.
4. Drops the canvas where the Luminous viewer can serve it.

The pipeline lives in **RTP's repo**, not Luminous'. Luminous is the renderer + (optionally) the schema vocabulary, not the source of statechart knowledge.

## What RTP needs from Luminous

In rough priority. For each, RTP doesn't know the current state — these are questions, not deficiencies.

### 1. A stable `.canvas.json` v2 schema RTP can target

RTP saw `version: 2` canvases under `.canvases/`. It needs:

- **A documented spec** for the v2 file format: `schemas` (node + edge), `structure` (id, schemaName, parent, order, geometry, content), edge records (source, target, label, schema). The existing canvases under `.canvases/` are an okay reference but reading source to reverse-engineer the contract is fragile.
- **Stability commitment**: if v3 lands, v2 keeps working in the viewer for at least one major version.

If the spec exists in `.carta/01-luminous/`, point RTP at the doc ref; that's enough.

### 2. Hierarchical / nested nodes

XState composite states (e.g. `CollectionDetail` containing `mapProjection`/`listProjection`) need to render as a parent box containing children. The existing `parent` field in `structure` looks like exactly this. RTP needs:

- Confirmation that a parent node *visually contains* its children (not just a logical pointer).
- Confirmation this works for arbitrary depth (RTP charts go ≥ 3 deep: machine → region → composite → leaf).

XState **parallel regions** need to be siblings inside a parent box, ideally with a visible divider or distinct layout. If Luminous doesn't have a "this parent's children should be laid out as parallel regions" affordance, RTP can fake it with two child container nodes side-by-side — that's fine.

### 3. Edge labels and per-edge metadata

Every transition in a statechart has:

- An **event name** (`TAP_PIN`, `BACK`, etc.) — wants to render as the edge label.
- A **description** — long-form text shown when selected.
- An **actions** array — list of `Concept.action` strings that should render as chips when selected.

RTP needs:

- Edge schemas can carry typed content beyond a single label (description + structured fields).
- Edges are **selectable** — clicking the edge populates the same side panel that state clicks do.

Today Mermaid does not let RTP click edges at all; this is the single biggest viewer-side win Luminous would unlock.

### 4. Auto-layout

The XState JSON has zero geometry. RTP cannot ship a viewer that requires manual placement of every node — the chart will grow.

RTP saw `packages/cactus/src/dagLayout.js` referenced by `analyze-solidjs.ts`. Questions:

- Is `dagLayout` re-usable as a public export from a Luminous package, or pipeline-private?
- Does it understand parent/child nesting (so that children get laid out **inside** their parent's bounds)?
- Are there other layout strategies (e.g. force-directed, ELK)? For a statechart specifically, a hierarchical L→R layout per region is ideal.

If layout is "your pipeline figures out positions and writes them in," that's still acceptable — RTP can write the layout pass — but a shared `dagLayout` would save reinventing it.

### 5. A shareable, no-install viewer

RTP's current Mermaid viewer is a **single static HTML file** (`tools/statechart/viz/01-navigation.html`) that works via `file://` with no server. The user runs `python3 viz.py` once, then double-clicks the HTML.

RTP would want to keep that property: **publish a canvas, get a static HTML file (or a one-line `python3 -m http.server` flow) that renders it with click-to-side-panel interactivity**. No login, no Yjs sync server, no npm install on the consumer side.

Questions:

- Can the Luminous client be built as a static bundle that takes `?canvas=path/to/file.canvas.json` and renders read-only?
- If so, how does a downstream project (RTP) consume it? Copy bundle into its repo? Reference a CDN URL? An npm-installed `dist/`?

If today the viewer requires `pnpm dev:next` and a Yjs server, that's the gating constraint for RTP adoption. A static read-only export mode is worth more to RTP than every other item on this list combined.

### 6. Canvas-side schemas RTP would declare

For reference, here's what RTP's pipeline would emit (sketch — final shapes TBD):

```jsonc
{
  "version": 2,
  "schemas": {
    "state": {
      "kind": "node",
      "name": "state", "label": "State",
      "primitives": [
        { "type": "title", "bind": "title" },
        { "type": "markdown", "bind": "description" },
        { "type": "chips", "bind": "tags" }       // <-- does this primitive exist?
      ]
    },
    "composite": { /* parent state with children */ },
    "parallel-region": { /* container for parallel siblings */ },
    "transition": {
      "kind": "edge", "directed": true,
      "primitives": [
        { "type": "title", "bind": "event" },
        { "type": "markdown", "bind": "description" },
        { "type": "chips", "bind": "actions" }
      ]
    }
  },
  "structure": { /* nodes with geometry + parent */ },
  "edges":     [ /* transitions */ ]
}
```

The unknowns inline (`chips` primitive existence, edge primitive support, where `edges` actually go in v2) are the contract questions that need answering.

## What RTP does NOT need

- Real-time collaboration / Yjs sync. The chart is single-author.
- Authoring on the canvas. The XState JSON is the source of truth; the canvas is read-only / regenerated on every build.
- An MCP server. RTP's coding agent reads the JSON, not the canvas.
- A storage backend. The canvas is a file in RTP's repo, committed alongside the sidecar.

## Suggested next step (Luminous side)

Whoever picks this up: read the four questions above (especially **#1 spec** and **#5 static viewer**), and reply with a short doc / PR plan that says:

- "Already done — here's where: ..."
- "Possible — would take roughly this much work: ..."
- "Out of scope — RTP should do X instead: ..."

RTP will then either write the pipeline (if Luminous covers ≥ #1, #2, #3, #5) or stay on Mermaid for now.

## Pointers back to RTP

- Source statechart: `RankThePlanet/.carta/02-design/02-interaction/01-navigation.statechart.json`
- Current viewer (the thing being replaced): `RankThePlanet/tools/statechart/viz.py` (Python stdlib only, emits Mermaid HTML)
- Design rationale for the chart: `RankThePlanet/.carta/02-design/02-interaction/01-navigation.md` (carta `doc02.02.01`)
- Concepts the `actions` arrays reference: `RankThePlanet/.carta/01-product/03-concepts.md` (carta `doc01.03`)
