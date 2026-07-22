# Atlas Data File — serve, watch, load, and draw

## Motivation

Phase 1 gave `@luminous/core/atlas` a sidecar schema and a pure resolver, but
nothing reads a `.atlasdata.json` from disk. This phase carries the file from the
filesystem to the screen: the server serves and watches it, the client loads it
beside the Document, and a Node whose Content names a provided key draws the
sidecar's text.

This satisfies R75 (draw the Data File's text, else the authored fallback), R79
(redraw on change without moving the camera), R80 (a Data File change discards the
undo history), and R81 (the Data File is not offered in the file selector). The
visual distinction between filled and authored Content is deliberately left to the
next phase — here, filled text simply appears.

## Do NOT

- Do NOT write resolved text into the `doc` signal, and do NOT pass resolved
  content to `dispatchDoc`. `AtlasApp.tsx:92-103` serializes `doc()` to disk on
  every edit, so a resolved document would bake generated text into the authored
  file the first time a user drags a Node. Resolution happens at render.
- Do NOT add the Data File to `scanDocuments` in
  `packages/server/src/workspace.ts:99` or to any `/api/documents` result. It is
  not a Document; the picker must never list it (R81).
- Do NOT make a missing Data File an error. Most Atlas documents will not have
  one, and a missing sidecar is the normal case, not a failure.
- Do NOT let the client write a Data File. It is script-owned and read-only here.
- Do NOT change the visual treatment of Content in this phase beyond drawing the
  resolved text — no badge, no tint, no read-only edit behavior.
- Do NOT touch `packages/core/src/atlas/` — the resolver is already correct.

## Plan

### 1. Serve the sidecar (`packages/server/src`)

Packs already have exactly the route shape needed, so mirror them rather than
extending the document API:

- `store.ts:310` has `readPackFile`, returning raw text and signalling a missing
  file. Add a sibling function for a `.atlasdata.json` path, resolving through the
  same `resolveDocPath` (`store.ts:48`) so root namespacing is identical.
- `index.ts:360` has `GET /api/pack/:encodedPath`, where the whole sibling path
  travels as one encoded segment. Add `GET /api/atlasdata/:encodedPath` in the
  same shape, answering 404 when the file is absent.

Leave `POST /api/document/write` and the raw-document read path alone; a Data
File is never written through the API.

### 2. Watch the sidecar (`packages/server/src/store.ts`)

`watchDocuments` filters filesystem events to the three document suffixes at
lines 326-330 before broadcasting. Add `.atlasdata.json` to that filter so a
script rewriting the file reaches the client over the existing `/ws/watch`
socket. The `recentWrites` self-write suppression just below (lines 334-337)
needs no change: the client never writes this file, so no echo exists.

Note that this path also invalidates `rawCache`; make sure a Data File change
does not evict or corrupt a cached Document entry.

### 3. Client loader (`packages/client/src/apps/atlas/dataLoader.ts`, new)

Two functions:

- `atlasDataPathFor(sourceId: string): string` — the Document's own path with the
  trailing `.atlas.json` replaced by `.atlasdata.json`. Source ids are namespaced
  `<rootName>/<rel>` (`sources/serverSources.ts:36`), and the substitution
  preserves that prefix, so no directory arithmetic is needed.
- `loadAtlasData(sourceId: string): Promise<AtlasData | undefined>` — fetch
  `/api/atlasdata/<encoded path>`, parse with `parseAtlasData`, return the data.
  Follow the tolerant fallback chain of `pack/siblingLoader.ts:50-93` closely: a
  404 is a silent miss, another non-ok status warns to the console, a thrown
  fetch is caught, and a 200 body that fails to parse is treated as absent rather
  than fatal — static hosts answer a missing sibling with SPA HTML at status 200.
  This function never throws and never rejects.

### 4. Hold and refresh the data (`AtlasApp.tsx`)

- Add `const [data, setData] = createSignal<AtlasData | undefined>(undefined)`
  beside the `doc` signal at line 25.
- In `loadDoc` (lines 60-81), after a successful parse and `setDoc`, call
  `loadAtlasData(id)` and `setData` with the result. A failure to load data must
  not route to `handleDocFailed` — the Document is fine without it.
- Clear the data signal wherever `setDoc(null)` already happens: `onSelect`
  (line 105) and `onBack` (line 113).
- In the `watchDocuments` callback (lines 156-163), the guard at line 157 returns
  early unless the changed path is the open Document. Extend it so a path equal
  to `atlasDataPathFor(sourceId())` reloads only the data — call `loadAtlasData`
  and `setData`, and do not call `loadDoc`, which would refetch and reparse the
  Document for no reason and cost the camera nothing but the history everything.
  Leave the `ownWritesInFlight` accounting untouched and outside this branch.
- Pass `data={data()}` down to `AtlasCanvas` beside the existing `doc` prop at
  line 214.

### 5. Discard undo on a Data File change (`AtlasCanvas.tsx`)

`AtlasCanvas` owns the history (line 61) and already clears it on a genuine
external Document reload through the `isEcho`-guarded effect at lines 110-118.
Add `data` to `AtlasCanvasProps` and a second `createEffect(on(() => props.data, ...))`
that calls `history.clear()` when the data changes (R80). No echo guard is needed
— the client never writes the Data File, so every change is external. Skip the
clear on the effect's first run so opening a Document with a sidecar does not
immediately clear an empty history.

### 6. Draw the resolved text (`AtlasNodeLayer.tsx`, `AtlasNodeContent.tsx`)

Thread the data from `AtlasCanvas` through `AtlasNodeLayer` (which instantiates
`AtlasNodeContent` at lines 247-262) into `AtlasNodeContent`. Follow the existing
accessor-style prop convention — every prop on `AtlasNodeContentProps` (lines
16-54) is a function.

In `AtlasNodeContent`, call `resolveContent(props.node().content, props.data())`
and render the resolved `text` in both the markdown branch (lines 246-257) and
the code branch (lines 258-264), instead of reading `content().text` directly.
The `mode` still comes from the authored Content, as the resolver already
guarantees. A Node with no Content keeps its existing "+ Add content" branch
(lines 265-277).

### 7. Tests

Add a unit test for `atlasDataPathFor` covering a namespaced id with directories.
Add a server test beside `packages/server/tests/atlas-documents.test.ts` asserting
the new route serves an existing sidecar and 404s on a missing one, and that
`/api/documents` does not list `.atlasdata.json` files (R81).

## Files to Modify

- `packages/server/src/store.ts` — sidecar read function; watcher suffix filter
- `packages/server/src/index.ts` — `GET /api/atlasdata/:encodedPath`
- `packages/client/src/apps/atlas/dataLoader.ts` — new: path derivation, tolerant load
- `packages/client/src/apps/atlas/AtlasApp.tsx` — data signal, load, watch branch, prop
- `packages/client/src/apps/atlas/AtlasCanvas.tsx` — `data` prop, history clear on change
- `packages/client/src/apps/atlas/AtlasNodeLayer.tsx` — thread data to content
- `packages/client/src/apps/atlas/AtlasNodeContent.tsx` — render resolved text
- `packages/server/tests/atlas-documents.test.ts` — route and listing assertions
- `packages/client/src/apps/atlas/__tests__/dataLoader.test.ts` — new: path derivation

## Verification

```bash
just test-client
just test-server
just typecheck-client
```

## Out of Scope

- Drawing filled Content differently from authored Content, indicating a missing
  key, refusing edits to filled Content, and showing the source location — all
  R76, R77, R78, and the third phase.
- Fitting a Node to resolved rather than authored text (R82, third phase).
- Escaping filled text before markdown rendering (third phase). Until then a
  filled Node renders through the same unsanitized path an authored Node already
  uses, which is why this phase must not ship on its own.
- Any generating script or `just` recipe.

## Surface after this phase

- `packages/client/src/apps/atlas/dataLoader.ts` exports `atlasDataPathFor(sourceId)`
  and `loadAtlasData(sourceId)`, the latter resolving to `AtlasData | undefined`
  and never rejecting.
- The server serves `GET /api/atlasdata/:encodedPath` (404 when absent) and
  broadcasts `.atlasdata.json` changes over `/ws/watch` as a namespaced path.
- `AtlasApp` holds a `data` signal, refreshes it on a sidecar change without
  reloading the Document, and passes `data` to `AtlasCanvas`.
- `AtlasCanvasProps` and `AtlasNodeContentProps` both carry `data`, the latter as
  an accessor like every other prop on that interface.
- `AtlasNodeContent` renders `resolveContent(...).text` in both the markdown and
  the code branch.
- `AtlasCanvas` clears the undo history when `data` changes.
- Negative space, relied on by the next phase: filled and authored Content are
  still drawn identically; a missing key is silent; a filled Node is still fully
  editable; `mutations.ts` still rebuilds `content` wholesale; `fitContent.ts`
  still measures the authored `text`; the markdown branch still passes text to
  `marked.parse` and `innerHTML` unescaped.
