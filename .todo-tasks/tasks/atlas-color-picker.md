# Atlas Color: the swatch picker

## Motivation

Phases 1 and 2 built the parts: cactus menus can render arbitrary JSX in a `custom`
item, and the Atlas Document carries `color?: AtlasColorToken` with themed CSS vars
behind each token. Nothing draws them yet.

This phase is the feature the user sees — doc01.07.04 R12-R19. Right click a Node or
Container, hover Color, get a grid of Swatches two rows tall; hovering a Swatch draws
the Node in that color and discards it on leave; selecting one commits it to the
Document. The Node and its Container share the Color, the Container drawn lighter.

## Do NOT

- Do NOT dispatch to the Document on hover. Preview is a local signal only. Writing on
  hover would round-trip through `writeDocument` → file write → WebSocket reload on
  every mouse move. Preview state must never reach `dispatchDoc`.
- Do NOT teach cactus what a color is. The swatch grid is an Atlas component passed
  into a `custom` menu item. Nothing color-shaped may be added to
  `packages/cactus/**` in this phase.
- Do NOT add a hex, a free color input, an alpha slider, or an eyedropper. Eight
  tokens, nothing else (R14).
- Do NOT hardcode the swatch list. Read `ATLAS_COLOR_TOKENS` from `@luminous/core` so
  adding a token needs no change here.
- Do NOT store a container color separately, and do NOT give `NodeContainer` a color
  prop. Override the `--cactus-container-tint` var from an Atlas-owned ancestor
  element instead. The Container's color derives from its Node's `color` field.
- Do NOT build an inspector panel or a sidebar. The picker lives in the context menu.

## Plan

### 1. Carry color into the projection

`packages/client/src/apps/atlas/projection.ts` builds `AtlasRenderNode { node; x; y; w;
h; hasChildren }`. `node` is the full `AtlasNode`, so `color` already rides along —
confirm this and read it as `rn.node.color` rather than adding a redundant field.

### 2. Color helper in mutations

In `packages/client/src/apps/atlas/mutations.ts`, alongside the existing
`buildContentEditPatch` / `buildModePatch`, add:

```ts
export function buildColorPatch(color: AtlasColorToken | undefined): { color?: AtlasColorToken }
```

Match the shape and purity of its neighbors — a pure patch builder, no dispatch. Note
`setNode`'s `'k' in patch` semantics: the patch must always carry the `color` key so
that `undefined` clears it.

### 3. The swatch grid component

New file `packages/client/src/apps/atlas/ColorSwatchGrid.tsx`:

```tsx
interface ColorSwatchGridProps {
  current: () => AtlasColorToken | undefined;
  onPreview: (token: AtlasColorToken | undefined) => void;
  onSelect: (token: AtlasColorToken) => void;
}
```

- Maps `ATLAS_COLOR_TOKENS` with `<For>` into a CSS grid laid out as **two rows**
  (R17) — `grid-template-rows: repeat(2, ...)` with `grid-auto-flow: column` so the
  column count follows the token count rather than being fixed at four. The doc fixes
  the row count, not the column count.
- Each swatch is a `<button>` filled with its token's color var, sized to be a
  comfortable click target, with an accessible name (the token name).
- The current token (`current()`) is marked as selected — follow how
  `AtlasNodeContent`'s selected state reads (`border-accent-subtle` + outline) so the
  affordance matches the app.
- `onMouseEnter` → `onPreview(token)`; `onMouseLeave` → `onPreview(undefined)`;
  `onClick` → `onSelect(token)`.
- Keyboard: each swatch is a real focusable button; `onFocus` previews and `onBlur`
  clears, so keyboard use matches mouse use.

### 4. Preview signal and menu wiring in AtlasCanvas

In `packages/client/src/apps/atlas/AtlasCanvas.tsx` (context menus live at ~lines
204-235):

- Add a local `previewColor` signal: `createSignal<{ nodeId: string; token: AtlasColorToken | undefined } | undefined>()`.
  It is scoped to the node being previewed so one node's preview cannot tint another.
  It is never passed to `dispatchDoc`.
- In the node context menu schema, add a `submenu` labelled `Color` whose `items` hold
  a single `{ type: 'custom', id: 'color-swatches', render: () => <ColorSwatchGrid … /> }`
  (the variant Phase 1 added).
- `onPreview` sets the signal; `onSelect` clears the signal and dispatches the color
  through `buildColorPatch` on the same path the existing content/mode edits take —
  follow how `buildModePatch` is dispatched, do not invent a second write path.
- Clear the preview signal when the menu closes, or a preview will stick after the
  user dismisses the menu without choosing. This is the most likely bug in the phase;
  make sure the dismiss path clears it.
- R15 requires right click on a **Container** to open the menu too. In Atlas a
  Container belongs to a Node (`softContainer={() => rn.hasChildren}`), so a right
  click on the container region resolves to that Node's menu. Verify cactus's
  `handleContextMenu` `[data-container-id]` hit-test already yields the owning node id;
  if it does, R15 needs no new code — say so in the result rather than adding any.

### 5. Draw the color

In `packages/client/src/apps/atlas/AtlasNodeContent.tsx`, the root div (~line 77)
hardcodes `bg-surface` and `border-border-subtle`. Give it an effective color —
`previewColor` for this node if set, else `rn.node.color`, else the existing
`bg-surface` / `border-border-subtle` look unchanged for an uncolored node.

For the Container: from an Atlas-owned element wrapping the container region, set
`--cactus-container-tint` inline to the effective token's container shade, so
`NodeContainer`'s existing `var(--cactus-container-tint, …)` picks it up with no
change to cactus. The container reads lighter than the node (R13) because Phase 2
derived that shade with `color-mix`.

Selection state must stay legible on every token — check that the selected outline is
still visible against the colored background in all three themes.

### 6. Test

Follow the existing framework and assertion style near the Atlas client code (Vitest;
Playwright exists for E2E — prefer unit tests unless the surrounding code establishes
otherwise). Cover:
- `buildColorPatch` includes the `color` key for both a token and `undefined`.
- `ColorSwatchGrid` renders one swatch per `ATLAS_COLOR_TOKENS` entry, in two rows.
- Hovering a swatch calls `onPreview` with its token; leaving calls it with `undefined`.
- Clicking a swatch calls `onSelect` and not `dispatchDoc`-shaped writes on hover —
  assert preview never dispatches, since that is the explicit Do NOT.
- Selecting a swatch produces a document whose node carries the token.

## Files to Modify

- `packages/client/src/apps/atlas/ColorSwatchGrid.tsx` — NEW: the 2×N grid
- `packages/client/src/apps/atlas/mutations.ts` — `buildColorPatch`
- `packages/client/src/apps/atlas/AtlasCanvas.tsx` — preview signal, Color submenu, dispatch
- `packages/client/src/apps/atlas/AtlasNodeContent.tsx` — draw node color + container tint override
- `packages/client/src/apps/atlas/projection.ts` — only if color does not already ride on `node`
- Atlas client test file(s) — the cases above

## Verification

```bash
just typecheck
just test
just lint
```

## Out of Scope

- Coloring an edge, or a color-derived edge.
- Multi-select recolor. One node at a time.
- Persisting a per-user default or a recently-used list.
- Color for Canvas or Dataflow nodes.
- A ninth token.

## Notes

- The preview-sticks-after-dismiss bug is the one to watch: the menu can close by
  Escape, by an outside click, or by selection, and every path must clear the signal.
- Scoping the preview signal by `nodeId` matters because the schema is produced per
  node id via `nodeContextMenu?: (nodeId: string) => MenuSchema | undefined`.
- R18 says a hovered color is discarded if the swatch is not selected — that is
  exactly `onMouseLeave → onPreview(undefined)` plus the dismiss-path clear.
- Check contrast of node text against every token in light, dusk, and ground. A token
  that makes text unreadable in one theme is a Phase 2 CSS value to flag in the
  result, not something to work around here with a per-node text color.

## Surface after this phase

- `packages/client/src/apps/atlas/ColorSwatchGrid.tsx` exports `ColorSwatchGrid` with
  props `{ current: () => AtlasColorToken | undefined; onPreview: (t: AtlasColorToken | undefined) => void; onSelect: (t: AtlasColorToken) => void }`,
  rendering one swatch per `ATLAS_COLOR_TOKENS` entry in two rows.
- `buildColorPatch(color)` is exported from `packages/client/src/apps/atlas/mutations.ts`.
- Right clicking an Atlas Node or its Container opens a context menu with a `Color`
  submenu holding the swatch grid; hovering a swatch previews it without writing the
  Document; selecting one writes `color` to the Document; the preview clears on every
  menu-dismiss path.
- An Atlas Node is drawn in its Color, and its Container in the same Color but lighter.
  A Node with no Color is drawn exactly as before.
- Negative space:
  - `packages/cactus/**` gained nothing color-related. `NodeContainer` still has no
    color prop and still reads `var(--cactus-container-tint, …)`.
  - The Atlas Document schema is unchanged from Phase 2 — this phase adds no fields.
  - Canvas and Dataflow are untouched.
