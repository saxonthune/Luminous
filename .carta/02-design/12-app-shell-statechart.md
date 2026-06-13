---
title: App-shell UI statechart
summary: Statechart of Luminous's app shell — boot, picker, canvas-mounted, error, theme region. Boundary: app-shell only, canvas internals are a black box.
tags: [ui, statechart, app-shell, shell]
deps: [doc02.01, doc01.01]
---

# App-shell UI statechart

## Intent

The Luminous app shell is the outer layer that decides *which surface the user is looking at* and *which theme they are looking at it in*. It does not decide anything about the canvas. The canvas is a black box the shell mounts when a document is loaded.

This separation matters because the shell and the canvas have different cadences, different inputs, and different reasons to change. Conflating them — as the current `AppShell.tsx` does — makes both harder to evolve. The statechart names the shell's responsibilities and refuses everything else.

The authoritative artifact is the sidecar `12-app-shell.statechart.json`. The prose here exists to explain it. When the two disagree, the JSON wins; the prose is wrong.

## Boundary

| In scope (modeled here) | Out of scope (canvas concern) |
|---|---|
| Listing available canvases | View switching (statechart / concept-map / etc.) |
| Selecting a canvas | Layer toggling |
| Loading a canvas document | Layout algorithm selection |
| Returning to the picker | Pan / zoom |
| Theme (light / dusk / ground) | Selection, inspector, edge interaction |
| Global keymap (F2 = cycle theme) | Anything else inside the canvas viewport |
| Error recovery | |

The canvas mounts inside `canvasMounted`. The shell does not know what the canvas is doing. The canvas does not know what the shell is doing. The contract is a single prop: `{ graph, sourceId }` in, an opaque component out.

## Regions

The chart is a top-level **parallel** machine with two orthogonal regions:

- **`shell`** — what the user is looking at.
- **`theme`** — which palette the UI uses.

The regions are independent: `CYCLE_THEME` is legal in every shell state. This is the formal expression of *"change theme anywhere."*

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

## Theme region

```
light → dusk → ground → light   (CYCLE_THEME, wraps)
```

A flat ring of three states. `CYCLE_THEME` is dispatched by:

- the visible theme toggle button (in the app header)
- the global key binding **F2**

Both sources dispatch the same event. There is exactly one way to change the theme — `CYCLE_THEME` — and exactly two ways to trigger it. Theme persists to `localStorage` as a side effect of entering each state; on `booting`, the initial state is read from `localStorage` (default `light`).

## Global keymap

| Key | Event | Region | Notes |
|---|---|---|---|
| `F2` | `CYCLE_THEME` | theme | Active in every shell state. |

The keymap is intentionally tiny. Document-specific keys (e.g. `?` for help, `Esc` for back) are deferred until forced.

## Event catalog

| Event | Source | Payload | Target region |
|---|---|---|---|
| `SOURCES_LOADED` | `fetchServerSources` resolve | `CanvasSource[]` | shell |
| `SOURCES_FAILED` | `fetchServerSources` reject | `{reason}` | shell |
| `SELECT_DOC` | PickerList click, or URL `?src=` on boot | `{id}` | shell |
| `GRAPH_LOADED` | `source.load()` + `loadCanvasFileFromText` success | `{graph}` | shell |
| `GRAPH_FAILED` | either load step rejects | `{reason}` | shell |
| `BACK` | Header back button | — | shell |
| `RETRY` | FatalError retry button | — | shell |
| `CYCLE_THEME` | Header theme button, F2 keybinding | — | theme |

## What the sidecar adds

`12-app-shell.statechart.json` is XState v5-shaped and tool-agnostic (carries `"_placeholder": true` until the toolchain binds a runtime). It is the source of truth for: state names, event names, transitions, guards, and the `meta` fields on each state (surface tag, what props the rendered component reads). The TypeScript implementation in `AppShell.tsx` is a transliteration of this JSON. When the chart changes, the code is a mechanical follow-up.

Pack conformance with `rtp-statechart` is deferred. When Luminous is ready to dogfood — render its own app shell as a canvas — this sidecar will need to conform to the pack's schema. Until then, plain XState v5 is enough.

## Why this doc exists

Reading `AppShell.tsx` today, you cannot tell where the app shell ends and the canvas begins. The component renders both, owns state for both, and reacts to events from both. This document draws the line and gives the line a name. Future changes — back navigation, theme toggle, error recovery, deep-linking — start here, get expressed in the sidecar, and propagate to a small surface of code.

See [doc02.13](13-app-shell-component-tree.md) for the component tree derived from this statechart.
