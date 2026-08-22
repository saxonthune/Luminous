---
title: Canvas app statechart
summary: Statechart of the Canvas app's outer surface — boot, picker, canvas-mounted, error — and its ?src= projection. Canvas viewport internals are a black box; theme and app selection belong to the platform shell.
tags: [ui, statechart, canvas, shell]
deps: [doc02.01, doc01.08, doc02.22.01]
---

# Canvas app statechart

## Intent

This chart models the Canvas app (doc01.08) outer surface: it decides *which surface the user is looking at* — a picker of available canvases, or a mounted canvas — and hands off everything inside the canvas viewport. The viewport is a black box the app mounts when a document is loaded.

This separation matters because the outer surface and the viewport have different cadences, different inputs, and different reasons to change. Conflating them makes both harder to evolve. The statechart names the app's responsibilities and refuses everything else.

Above this chart sits the platform shell (doc02.22.01), which selects an app and owns the theme. Nothing here is aware of it.

The authoritative artifact is the sidecar `12-canvas-app.statechart.json`. The prose here exists to explain it. When the two disagree, the JSON wins; the prose is wrong.

## Boundary

| In scope (modeled here) | Out of scope |
|---|---|
| Listing available canvases | View switching (viewport) |
| Selecting a canvas | Layer toggling (viewport) |
| Loading a canvas document | Layout algorithm selection (viewport) |
| Returning to the picker | Pan / zoom (viewport) |
| The `?src=` projection | Selection, inspector, edge interaction (viewport) |
| Error recovery | Theme (platform shell — doc02.22.01) |
| | Which app is mounted (platform shell — doc02.22.01) |

The canvas mounts inside `canvasMounted`. The outer surface does not know what the viewport is doing, and the viewport does not know what the outer surface is doing.

The platform shell knows even less. `AppShell` selects an app from a registry and mounts it; the registry's contract is `{ id, label, component }` and an app receives **no props**. Picker state, `sourceId`, and the loaded graph are Canvas's own, not the shell's.

## Shell region

```
booting
  ├── SOURCES_LOADED  → picker
  └── SOURCES_FAILED  → fatalError

picker
  └── SELECT_DOC(id)  → loadingDoc

loadingDoc
  ├── GRAPH_LOADED(graph)  → canvasMounted
  └── GRAPH_FAILED(reason) → picker  (with toast: reason)

canvasMounted
  └── BACK  → picker  (clears graph, sourceId, ?src=)

fatalError
  └── RETRY  → booting
```

Two distinct error paths, by deliberate design:

- **`fatalError`** — source list failed; the user has no documents to choose from. Dead-end state, only `RETRY` exits it.
- **Picker toast** — a single document failed to load. Other documents are still listed; the user picks another or retries the same one. The shell remains in `picker`.

### Invariants

- **UI-INV-1** — `canvasMounted` requires non-null `graph` and `sourceId`.
- **UI-INV-2** — `BACK` from `canvasMounted` atomically clears `graph`, `sourceId`, and the `?src=` query parameter.
- **UI-INV-3** — The `?src=` query parameter is a *projection* of `(shell, sourceId)`, not an input. URL changes do not directly drive transitions; events do, and the URL is updated as a side effect.
- **UI-INV-4** — `picker` always has a non-empty source list (otherwise we would have entered `fatalError`). An empty list is a failure, not a success.

### URL projection

Deep-link semantics:

| Shell state | URL |
|---|---|
| `booting` | path only |
| `picker` | path only |
| `loadingDoc` | `?src=<id>` (written speculatively at SELECT_DOC) |
| `canvasMounted` | `?src=<id>` |
| `fatalError` | path only |

On initial load, if `?src=<id>` is present, the machine starts in `booting` and, after `SOURCES_LOADED`, auto-fires `SELECT_DOC(id)` if the id is in the loaded list. If it is not, the shell remains in `picker` and shows a toast.

## Event catalog

| Event | Source | Payload |
|---|---|---|
| `SOURCES_LOADED` | `fetchServerSources` resolve | `CanvasSource[]` |
| `SOURCES_FAILED` | `fetchServerSources` reject | `{reason}` |
| `SELECT_DOC` | PickerList click, or URL `?src=` on boot | `{id}` |
| `GRAPH_LOADED` | `source.load()` + `loadCanvasFileFromText` success | `{graph}` |
| `GRAPH_FAILED` | either load step rejects | `{reason}` |
| `BACK` | Header back button | — |
| `RETRY` | FatalError retry button | — |

Theme events belong to the platform shell (doc02.22.01) and are legal in every state here, because the two machines are independent.

## What the sidecar adds

`12-canvas-app.statechart.json` is XState v5-shaped and tool-agnostic (carries `"_placeholder": true` until the toolchain binds a runtime). It is the source of truth for: state names, event names, transitions, guards, and the `meta` fields on each state (surface tag, what props the rendered component reads). The TypeScript implementation in `CanvasApp.tsx` is a transliteration of this JSON. When the chart changes, the code is a mechanical follow-up.

Pack conformance with `rtp-statechart` is a later step. When Canvas is ready to dogfood — render its own app as a canvas — this sidecar conforms to the pack's schema. Plain XState v5 is enough until then.

## Why this doc exists

Reading `CanvasApp.tsx`, you cannot tell where the app's outer surface ends and the viewport begins. The component renders both, owns state for both, and reacts to events from both. This document draws the line and gives the line a name. Changes to back navigation, error recovery, and deep-linking start here, get expressed in the sidecar, and propagate to a small surface of code.

See [doc02.13](13-canvas-app-component-tree.md) for the component tree derived from this statechart, and doc02.22.01 for the platform shell above it.
