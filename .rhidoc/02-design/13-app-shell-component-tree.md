---
title: App-shell component tree (derived)
summary: Component tree of the app shell, derived from the statechart and six inventories. Canvas internals are not modeled here.
tags: [components, derivation, app-shell]
deps: [doc02.12]
---

# App-shell component tree (derived)

## Intent

The component tree below is not designed — it is **derived** from the app-shell statechart ([doc02.12](12-app-shell-statechart.md)) by walking six inventories. The derivation procedure is mechanical: two contributors following it should reach the same tree. Where the procedure leaves a degree of freedom, this doc records the chosen tie-breaker explicitly.

The scope is the **app shell only**. The canvas is a single black-box component (`CanvasHost`) the shell mounts. What lives inside the canvas — viewport, view switcher, layer toolbar, layout toolbar, inspector — is the canvas's own concern and is governed by a separate (future) document.

## The six inventories

### 1. State shape

From the statechart's `context`:

| Field | Type | Mutation rate | Reader regions (candidate) |
|---|---|---|---|
| `sources` | `CanvasSource[] \| null` | Once per boot | Picker |
| `sourceId` | `string \| null` | On SELECT_DOC / BACK | Header, Picker, CanvasHost |
| `graph` | `Graph \| null` | On GRAPH_LOADED / BACK | CanvasHost |
| `error` | `string \| null` | On SOURCES_FAILED / RETRY | FatalErrorView |
| `toasts` | `Toast[]` | On GRAPH_FAILED, on dismiss | ToastTray |
| `theme` | `"light" \| "dusk" \| "ground"` | On CYCLE_THEME | (document root — CSS attr) |

### 2. Action catalog

| Event | Trigger | DOM region (candidate) | Payload | Guards |
|---|---|---|---|---|
| `SELECT_DOC` | click on a picker row | Picker | `{id}` | shell is `picker` |
| `BACK` | click back button, or Esc (future) | Header | — | shell is `canvasMounted` |
| `RETRY` | click retry button | FatalErrorView | — | shell is `fatalError` |
| `CYCLE_THEME` | click theme button **or** F2 keypress | Header (button) + global (key) | — | always legal |
| `DISMISS_TOAST` | click dismiss, or auto-timeout | ToastTray | `{toastId}` | toast exists |

`CYCLE_THEME` is the only event with two triggers. Both dispatch the same event; this is why theme is an orthogonal region, not a Header-local state.

### 3. Mutation-rate map

No app-shell field is written above human-interaction frequency (~1 Hz peak). There is no >30 Hz field, so the FOC-style "must be its own component" forcing rule does not fire for any shell region. The canvas internals contain the high-frequency writers (pan/zoom), which is one of several reasons they sit behind a stable component boundary.

### 4. Read set per region

| Region | Reads | Writes (events it dispatches) |
|---|---|---|
| Header | `shell`, `sourceId`, `theme` | `BACK`, `CYCLE_THEME` |
| Picker | `sources`, `sourceId` (for highlight) | `SELECT_DOC` |
| CanvasHost | `graph`, `sourceId` | — (canvas-internal events do not leak) |
| FatalErrorView | `error` | `RETRY` |
| ToastTray | `toasts` | `DISMISS_TOAST` |
| (root) | `theme` | applies `data-theme` to `<html>` |

Read sets are disjoint except for `sourceId` (Header + Picker + CanvasHost) and `shell` (Header reads it to decide whether to show BACK). Both are read-only fan-outs, not shared mutation; no shared memo is required.

### 5. Affordance rules

Each region owns its feedback as a pure function of state:

- **Header back button** — visible iff `shell === "canvasMounted"`.
- **Header theme button** — always visible; icon reflects current theme (☀ / ☾ / ◐).
- **Picker rows** — selected row highlighted iff `source.id === sourceId` (used during `loadingDoc` to show which doc is loading).
- **Picker spinner** — visible iff `shell === "loadingDoc"`.
- **FatalErrorView** — rendered iff `shell === "fatalError"`.
- **ToastTray** — visible iff `toasts.length > 0`.

No region's affordance depends on state another region owns.

### 6. Orthogonal regions

| Region | Concurrent with | Notes |
|---|---|---|
| Header | Picker / CanvasHost / FatalErrorView | Always rendered (except possibly during `booting`). |
| ToastTray | All shell surfaces | Cross-cuts shell states. |
| Theme | All shell states | Orthogonal in the machine; applies as a CSS attribute on `<html>`. |
| Shell-body (Picker / CanvasHost / FatalErrorView) | — | Mutually exclusive — `shell` region's substate picks one. |

Orthogonal regions are siblings under `AppShell`, never nested.

## The derived tree

```
AppShell                             // mounts machine, applies theme to <html>
├── AppHeader                        // [orthogonal — always mounted after booting]
│   ├── BackButton                   //   visible iff shell === canvasMounted
│   ├── Title                        //   "Luminous" + (sourceId? · sourceId)
│   └── ThemeToggleButton            //   dispatches CYCLE_THEME
├── ShellBody                        // [mutually exclusive switch on `shell`]
│   ├── BootingSplash                //   shell === booting
│   ├── DocumentPicker               //   shell ∈ {picker, loadingDoc}
│   │   └── PickerList
│   │       └── PickerRow*           //     selected iff id === sourceId
│   ├── CanvasHost                   //   shell === canvasMounted
│   │   └── <opaque canvas subtree>  //     not modeled in this doc
│   └── FatalErrorView               //   shell === fatalError
└── ToastTray                        // [orthogonal — overlays all shell states]
    └── ToastItem*
```

Plus one *non-component* concern wired in `AppShell`:

- A global `keydown` listener that maps `F2` → `CYCLE_THEME`. Implemented as an effect in `AppShell`, not a component.

## Notes on the boundary with the canvas

`CanvasHost` is the contract. Its props are `{ graph, sourceId }`. It does not receive `theme` — theming flows through CSS custom properties on `<html>`, set by `AppShell`. It does not dispatch shell events; the only way out of the canvas is the Header's BACK button. The canvas owns its toolbars, viewport, selection, and inspector internally and is free to evolve without touching this document.

If a future canvas feature needs to communicate with the shell (e.g. "open this other document"), the contract grows by adding a typed callback to `CanvasHost`'s props and a new event to the shell statechart. The shell never reaches into the canvas; the canvas never reaches into the shell.

## Tie-breakers recorded

The derivation leaves a few degrees of freedom; choices made here so future contributors don't re-litigate:

- **`DocumentPicker` spans `picker` and `loadingDoc`.** A separate `LoadingDocOverlay` was considered. Rejected because the only visible delta is a spinner on the loading row — splitting the component would duplicate the list code.
- **`BootingSplash` is its own component, not part of `DocumentPicker`.** The picker requires non-null `sources`; the splash shows while `sources` is null. Different read sets → different components.
- **`ToastTray` is a sibling of `ShellBody`, not nested inside `DocumentPicker`.** Toasts must outlive a shell transition (a GRAPH_FAILED toast shown while bouncing back to picker would unmount mid-flight if nested).
- **Theme applies at `<html>` via `data-theme`, not via component props.** Cascades cheaply through every component without prop drilling; matches the existing CSS structure in `index.css`.

## What this gives us

- A definitive answer to "should there be a header?" — yes, it owns BACK and CYCLE_THEME.
- A definitive answer to "where does theme cycling live?" — orthogonal region, dispatched from a header button and a global F2 key. Both go through the same event.
- A definitive answer to "where does the canvas end?" — `CanvasHost`'s props. One contract, two fields.
- A reusable derivation procedure: the same six inventories applied to the canvas (in a future doc) will produce the canvas's own component tree without contention.
