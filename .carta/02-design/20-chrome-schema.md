---
title: Chrome schema
summary: Action records, menu and toolbar schemas, chrome slots; cactus owns chrome rendering, Luminous owns the schema producers, packs stay unchanged.
tags: [chrome, api, actions, menus, cactus, boundary]
deps: [doc02.14, doc02.19]
---

# Chrome schema

The component tree document ([doc02.19](19-canvas-component-tree.md)) establishes that cactus paints chrome from schemas the host produces. This document specifies the schema: the record types, the slot regions, the dispatch contract, and the rules for composing schemas from pack data.

The audience is the developer wiring `<Canvas chrome=…>` and the developer writing schema producers in `@luminous/core`.

## The data model

Four record types and one slot enum cover everything.

### `Action`

A single invokable thing. The fundamental record. Toolbars and menus are arrays of these (or refs to them).

```ts
interface Action {
  id: string;                          // stable id, dispatched on activation
  label: string;                       // human-readable
  icon?: string | (() => JSX.Element); // optional; named icon or component
  hotkey?: string;                     // e.g. "F2", "Cmd+K", "Esc"
  tone?: 'default' | 'accent' | 'danger';
  enabled?: boolean;                   // omit/true = enabled
  selected?: boolean;                  // for toggle-style affordances
  payload?: unknown;                   // passed through to onAction
}
```

Notes:

- `id` is a free string; convention is `DOMAIN.VERB` (e.g. `VIEW.SET`, `LAYER.TOGGLE`).
- `enabled` and `selected` are plain booleans, computed by the schema producer over current Solid state. No DSL.
- `hotkey` registers a global keybinding while the action is present in the schema and `enabled`. Conflicts (two actions claiming the same key) are resolved by document order; later declarations win.
- `payload` lets the producer attach context (`{ viewId: 'concept-map' }`) so the dispatcher does not need to parse the id.

### `MenuItem`

A menu entry — either an inline action, a submenu, or a divider.

```ts
type MenuItem =
  | { kind: 'action'; action: Action }
  | { kind: 'submenu'; label: string; icon?: string; items: MenuItem[] }
  | { kind: 'divider' };
```

### `MenuSchema`

A menu (top-level or context).

```ts
interface MenuSchema {
  id: string;                  // stable id for testing / dev tooling
  items: MenuItem[];
}
```

### `ToolbarSchema`

A toolbar — a horizontal strip of grouped controls.

```ts
type ToolbarControl =
  | { kind: 'button'; action: Action }
  | { kind: 'toggle-group'; label?: string; options: Action[] }      // radio (one selected)
  | { kind: 'toggle-set'; label?: string; options: Action[] }        // multi (any subset)
  | { kind: 'separator' }
  | { kind: 'spacer' };                                              // pushes following controls to the far edge

interface ToolbarSchema {
  id: string;
  controls: ToolbarControl[];
}
```

### `ChromeSlot` and `ChromeSchema`

The top-level shape passed to `<Canvas>`.

```ts
type ChromeSlot = 'top' | 'left' | 'right' | 'bottom';

interface ChromeSchema {
  top?: ToolbarSchema[];      // multiple toolbars stack horizontally; first is left-anchored
  left?: ToolbarSchema[];     // stack vertically
  right?: ToolbarSchema[];
  bottom?: ToolbarSchema[];
}
```

Per-node context menus are not part of `ChromeSchema`; cactus requests them on demand via the `nodeContextMenu` callback (see below). Background context menus are similar via `backgroundContextMenu`.

## Cactus API

The `<Canvas>` props that carry chrome:

```ts
interface CanvasProps {
  // ...existing props...
  chrome?: ChromeSchema;
  onAction?: (id: string, payload?: unknown) => void;
  nodeContextMenu?: (nodeId: string) => MenuSchema | undefined;
  backgroundContextMenu?: () => MenuSchema | undefined;
}
```

- `chrome` and the two `*ContextMenu` callbacks are independently optional. Passing none reproduces today's bare-viewport behaviour.
- `onAction` is the single dispatch sink. Every button click, menu activation, hotkey trigger, and toggle change calls it with the action's `id` and `payload`.
- Cactus renders chrome **outside the panned/zoomed inner div** — slot regions are positioned in screen space and resist pan/zoom.
- Context menus open at the cursor on right-click. Cactus handles positioning, click-outside dismissal, keyboard navigation, focus trap, and ARIA.

## Slot layout

Each slot region is a flex container along its own axis:

| Slot | Direction | Anchor | Position |
|---|---|---|---|
| `top` | row | top edge | `position: absolute; top: 0; left: 0; right: 0;` |
| `bottom` | row | bottom edge | analogous |
| `left` | column | left edge | analogous |
| `right` | column | right edge | analogous |

Within a slot, individual `ToolbarSchema`s render in array order. A `spacer` control in any toolbar pushes subsequent controls to the far end of that toolbar (useful for "left-anchored buttons + right-anchored zoom controls" in one strip).

Slots are non-interfering: the viewport extends edge-to-edge underneath chrome; chrome overlays it. Pan/zoom gestures that begin inside a chrome region do not pan the canvas (the existing `[data-no-pan]` convention).

## Schema producers in `@luminous/core`

Luminous exports pure functions that derive schemas from pack data and current state. They are signals-free; the host wraps them in `createMemo`.

```ts
// Translate pack.views into a tab-style toolbar
export function viewSwitcherSchema(
  views: View[],
  activeViewId: string,
): ToolbarSchema;

// Translate active view's layers into a toggle set
export function layerToolbarSchema(
  view: View,
  layers: Layer[],
  enabledLayers: Record<LayerId, boolean>,
): ToolbarSchema;

// Static schema for layout/zoom controls
export function layoutToolbarSchema(
  algorithm: LayoutAlgorithm,
  availableAlgorithms: LayoutAlgorithm[],
): ToolbarSchema;

// Per-node menu — empty when no items apply
export function nodeContextMenuSchema(
  node: Node,
  selection: ReadonlySet<NodeId>,
): MenuSchema | undefined;

export function backgroundContextMenuSchema(): MenuSchema | undefined;
```

These functions emit `Action` records with canonical ids (`VIEW.SET`, `LAYER.TOGGLE`, `LAYOUT.ALGO_SET`, `LAYOUT.ZOOM_IN`, `LAYOUT.ZOOM_OUT`, `LAYOUT.FIT`, `NODE.INSPECT`). The host's `onAction` dispatcher maps these ids to Solid signal mutations.

The producers do not own dispatch — they emit data. The host owns dispatch. This keeps the producers easy to test (input data → output schema, no side effects) and keeps action routing in one place.

## Composition in `client-next`

`CanvasHost` becomes a thin composer:

```tsx
function CanvasHost(props: { graph: Graph; sourceId: string }) {
  const [algorithm, setAlgorithm] = createSignal<LayoutAlgorithm>('grid');
  const [activeViewId, setActiveViewId] = createSignal('');
  const [enabledLayers, setEnabledLayers] = createSignal<Record<LayerId, boolean>>({});
  // ... (existing memos: declaredPacks, availableViews, activeView, activeLayers)

  const chrome = createMemo<ChromeSchema>(() => ({
    top: [
      viewSwitcherSchema(availableViews(), activeView()?.id ?? ''),
      layerToolbarSchema(activeView()!, activeLayers(), enabledLayers()),
    ],
    right: [layoutToolbarSchema(algorithm(), ['grid', 'elk'])],
  }));

  const dispatch = (id: string, payload?: unknown) => {
    switch (id) {
      case 'VIEW.SET':        return setActiveViewId((payload as any).viewId);
      case 'LAYER.TOGGLE':    return toggleLayer((payload as any).layerId);
      case 'LAYOUT.ALGO_SET': return setAlgorithm((payload as any).algorithm);
      case 'LAYOUT.ZOOM_IN':  return viewerHandle()?.zoomIn();
      case 'LAYOUT.ZOOM_OUT': return viewerHandle()?.zoomOut();
      case 'LAYOUT.FIT':      return viewerHandle()?.fitView();
      case 'NODE.INSPECT':    return inspector.open((payload as any).nodeId);
    }
  };

  return (
    <Canvas
      chrome={chrome()}
      onAction={dispatch}
      nodeContextMenu={(id) => nodeContextMenuSchema(props.graph.nodes.get(id)!, selection())}
      backgroundContextMenu={() => backgroundContextMenuSchema()}
    >
      <CanvasInner ... />
    </Canvas>
  );
}
```

`ViewSwitcher.tsx`, `LayerToolbar.tsx`, `LayoutToolbar.tsx` cease to exist. The shapes they used to render are now schemas; the rendering is cactus's.

## Chrome primitives in cactus

Cactus implements one component per `ToolbarControl` kind and one per `MenuItem` kind, plus the slot containers. Implementation uses **Kobalte** (`@kobalte/core`) for headless behavior — focus management, keyboard navigation, ARIA, submenu hover timing, escape-to-close, click-outside dismissal.

The full primitive set:

| Primitive | Renders | Built on |
|---|---|---|
| `ToolbarButton` | `Action` as a clickable button | `<button>` + Kobalte tooltip |
| `ToggleGroup` (radio) | `options` as a radio strip | Kobalte `ToggleGroup` |
| `ToggleSet` (multi) | `options` as independent toggles | Kobalte `Toggle` |
| `Separator`, `Spacer` | inline visual gap | plain `<div>` |
| `Menu` | `MenuSchema` as a popover menu | Kobalte `Menu` |
| `MenuItem` | inline action row | Kobalte `Menu.Item` |
| `Submenu` | nested menu | Kobalte `Menu.Sub` |
| `Divider` | horizontal rule in a menu | plain `<hr>` |

Theme tokens (CSS variables defined in `client-next/index.css`) drive all styling. Cactus does not hardcode colors. Theme switching ([doc02.12](12-app-shell-statechart.md)) cascades through chrome the same way it cascades through the viewport.

## Hotkeys

The hotkey field on an `Action` registers a global `keydown` listener for the action's lifetime. Cactus does the registration; the host does not write `addEventListener`.

Rules:

- A hotkey fires `onAction(id, payload)` exactly as a click would.
- Hotkeys do not fire when an `<input>` or `[contenteditable]` element has focus, unless the action declares `allowInForm: true` (future extension; not in v1).
- Modifier syntax: `Cmd+K` on macOS, `Ctrl+K` on Windows/Linux, written as `Mod+K` for "either." `Shift+`, `Alt+`, `Cmd+`, `Ctrl+` accepted explicitly.
- Single keys with no modifiers (`F2`, `Esc`) work but are reserved for unambiguous global actions.

The F2 theme toggle ([doc02.12](12-app-shell-statechart.md)) is a shell-level binding outside this surface, but uses the same conventions; the two systems may merge if a global hotkey registry emerges.

## Dispatch protocol

Cactus calls `onAction(id, payload)` on every activation. The protocol is intentionally narrow:

- `id` is the action's declared id, unchanged.
- `payload` is whatever the producer attached, unchanged. Cactus does not inspect it.
- Cactus never returns a value; dispatch is fire-and-forget.

The host's dispatcher routes ids to mutations. A switch is fine at small scale; for larger surfaces, the same statechart pattern used by the app shell ([doc02.12](12-app-shell-statechart.md)) applies — actions become statechart events and dispatch is a single `send(id, payload)` call.

## Testing surface

The schema producers and the chrome renderer test independently:

- **Producers** — pure functions; assert `(input data, state) → schema` per case. No DOM, no Solid context.
- **Cactus chrome rendering** — assert `(schema) → DOM` per primitive kind. Use the existing DOM-test setup (`jsdom`).
- **Hotkey routing** — assert that a dispatched `keydown` fires `onAction` with the right id when the matching action is present and `enabled`.
- **Context menu open/close** — assert that right-click on a node calls `nodeContextMenu(id)` and renders the returned schema at the cursor.

Migration drops the existing tests for `ViewSwitcher.test`, `LayerToolbar.test`, `LayoutToolbar.test` and rewrites them as producer tests against the new schema shapes.

## Open questions deferred

- **Multi-pack chrome conflicts.** Two packs declaring overlapping view ids or layer ids. Decision: producers consume already-resolved view and layer arrays from Luminous; pack-level dedup happens upstream. The chrome layer never sees conflicts.
- **User-defined hotkeys.** A user-state sidecar may rebind action hotkeys per user. Out of scope for v1; the action `id` is the stable handle that makes rebinding cheap when it comes.
- **Command palette.** A fuzzy-search overlay over all registered actions. Falls out of this design for free once the action records exist; deferred to a separate doc.
- **Drag affordances as chrome.** Drag handles, resize handles, connection ports are part of the per-node decoration layer, not chrome. They live in [doc02.17](17-projection-and-identity.md)'s decoration model.

## Relationship to the renderer engine

The renderer engine ([doc02.16](16-renderer-engine.md)) and the chrome schema are parallel JSON-driven systems with disjoint primitive sets. They are not unified because:

- Renderer JSON is **content** — node bodies that live in canvas space, theme-aware, no hotkeys, no global focus, written by pack authors as data.
- Chrome schema is **structure** — toolbars and menus that live in screen space, with hotkeys, focus management, accessibility, written by host TypeScript as records.

The shared idiom is "declarations on one side, interpretation on the other." The disjoint vocabularies reflect disjoint concerns — and trying to unify them buys nothing.

## The contract, in one sentence

**Packs declare data; Luminous produces chrome schemas from data; cactus paints chrome from schemas and dispatches action ids back.**

Mirror of the node-rendering contract, applied to the screen-space surface.
