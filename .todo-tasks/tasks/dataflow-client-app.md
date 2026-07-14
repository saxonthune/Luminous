# Dataflow Designer client app

## Motivation

The Dataflow Designer app (doc02.23 — read it via `rhidoc cat doc02.23`): a
read-only viewer for `*.dataflow.json` documents as a sibling app to Luminous
Canvas, with live reload while an agent edits over MCP. Phase 4 of the
dataflow-designer chain, building on the phase-1 core module and phase-2
server surface.

## Do NOT

- Do NOT add editing interactions (no drag, resize, connect, rename in the
  canvas) — the app is read-only; the agent writes via MCP.
- Do NOT use the pack/render-template machinery (`registry`, `loader`,
  `render/`, `siblingLoader`) — project the document with hand-written Solid
  components on the cactus API.
- Do NOT add `@solidjs/router` or any routing library — use the existing
  `urlState.ts` query-param helpers.
- Do NOT restructure `CanvasApp` or move its files; the only Canvas-side
  change is the extension filter in the sources helper.
- Do NOT store layout in the document.
- Do NOT break the existing e2e smoke test (`e2e/smoke.spec.ts` — picker h1
  "Canvases", `sample-primitives` flow).

## Plan

### 1. Shared document plumbing — `packages/client/src/sources/`

Generalize listing by extension: `fetchServerSources()` in
`serverSources.ts` currently maps every entry of `GET /api/documents`. Give it
an extension parameter (e.g. `fetchServerSources(suffix: string)`) that
filters `doc.path` by suffix — CanvasApp passes `.graph.json`, the new app
passes `.dataflow.json`. Keep the `CanvasSource` shape unchanged. Update
`fetchStaticSources` callers only as needed to compile; static mode serves
canvases only.

### 2. Shared change subscription — `packages/client/src/ws/watchClient.ts` (new)

A small helper: `watchDocuments(onChange: (path: string) => void): () => void`
— opens a WebSocket to `/ws/watch` (the Vite dev proxy already forwards
`/ws`), parses `{ event: 'changed', path }`, calls back; returns a dispose
function; reconnects with a short delay on close; never constructed when
`__GITHUB_PAGES__` (no server in static mode). Unit-test the message parsing
in isolation if practical; do not over-engineer.

### 3. The app — `packages/client/src/apps/dataflow/DataflowApp.tsx` (new)

Follow `CanvasApp.tsx` as the pattern: a small state machine
(booting/picker/loading/mounted/error), sources via
`fetchServerSources('.dataflow.json')`, `?src=` param via
`readParam`/`writeParam`, picker → load → mounted. Loading a document:
fetch text via the source's `load()`, `parseDataflowDocument` from
`@luminous/core/dataflow`, show parse issues as the error state. While
mounted, subscribe via `watchClient`; when the changed path equals the open
document's id, reload it. Reuse `DocumentPicker` if its props allow a custom
heading (picker heading: "Dataflows"); if it hardcodes "Canvases", add an
optional heading prop defaulting to "Canvases" so the smoke test stays green.
In `__GITHUB_PAGES__` static mode the app shows an empty picker with a short
note that dataflow documents come from the local server.

### 4. Projection — `packages/client/src/apps/dataflow/DataflowCanvas.tsx` (new)

Hand-written projection onto cactus:

- Map each Box to a cactus `NodeContainer` whose content shows the `name`
  prominently, the `description` as prose, and — when present — the
  `contract.text` in a `<pre>`-style block with the `format` as a small
  caption.
- Map each Flow to an `EdgeDeclaration` (`sourceId`/`targetId` = box ids).
- Positions: compute with `dagLayout` from `@luminous/cactus` (boxes as flat
  `TidyNode`s — no `parentId` — flows as `LayoutEdge`s); measured/estimated
  sizes are fine (fixed width, height estimated from content length like
  other consumers do; look at how `PgCanvasView` sizes nodes and imitate the
  simplest workable approach).
- `fitView` on mount via `CanvasRef`.
- No pointer-down/drag wiring — read-only.
- Extract the pure mapping (document → nodes/edges/layout input) into a small
  module (e.g. `projection.ts`) and unit-test it.

### 5. Registration — `packages/client/src/apps/registry.ts`

Append `{ id: 'dataflow', label: 'Dataflow', component: DataflowApp }` to
`APPS`.

### 6. Fixture and e2e

- Commit a minimal example `.canvases/sample.dataflow.json` (two boxes, one
  flow — the Part I shape from doc01.05.01: a "Json w/ standings" source box
  with a short description, a "Bracket w/ teams" box, one flow between them).
- New `packages/client/e2e/dataflow.spec.ts`: goto `/?app=dataflow`, expect
  the "Dataflows" heading, click `sample`, expect the text "Bracket w/ teams"
  visible on the canvas.
- The existing `e2e/smoke.spec.ts` must still pass unchanged.

## Files to Modify

- `packages/client/src/sources/serverSources.ts` — suffix filter
- `packages/client/src/apps/canvas/CanvasApp.tsx` — pass `.graph.json` to the
  sources helper (minimal diff)
- `packages/client/src/ws/watchClient.ts` — new
- `packages/client/src/apps/dataflow/DataflowApp.tsx` — new
- `packages/client/src/apps/dataflow/DataflowCanvas.tsx` — new
- `packages/client/src/apps/dataflow/projection.ts` — new, with unit test
- `packages/client/src/apps/registry.ts` — one entry
- `packages/client/src/DocumentPicker.tsx` — optional heading prop only if
  needed
- `.canvases/sample.dataflow.json` — new fixture
- `packages/client/e2e/dataflow.spec.ts` — new

## Verification

```bash
just test-client
just typecheck-client
just build
just test-e2e
just lint
```

## Out of Scope

- Editing on the canvas; layout persistence; contract syntax highlighting;
  semantic zoom.
- Static-site (GitHub Pages) dataflow document serving.
- The fifa example documents beyond the single minimal fixture (phase 5).

## Notes

- `dagLayout` signature: `dagLayout(nodes: TidyNode[], edges: LayoutEdge[],
  options?) → LayoutResult` (`{ positions: Map, sizes: Map }`); defaults
  `horizontalGap 40`, `verticalGap 80`.
- The release-web workflow builds with `GITHUB_PAGES=true`; the app must
  compile and render its empty state in that mode.
- Phase 2 guarantees the WS broadcast fires on `POST /api/document/write` and
  on external file edits — no server work needed here.

## Surface after this phase

- `APPS` contains `{ id: 'dataflow', label: 'Dataflow' }`; the header tab
  switches to the app; `?app=dataflow&src=<path>` deep-links a document.
- The app lists `*.dataflow.json` documents, renders Boxes (name,
  description, contract) and Flows read-only with `dagLayout`, and reloads
  the open document on a `/ws/watch` change event for its path.
- Shared helpers exist: `fetchServerSources(suffix)` and
  `watchDocuments(onChange)` in `src/ws/watchClient.ts`.
- `.canvases/sample.dataflow.json` exists (two boxes, one flow).
- Negative space: Luminous Canvas behavior is unchanged; both e2e specs pass;
  no editing surface exists in the dataflow app.
