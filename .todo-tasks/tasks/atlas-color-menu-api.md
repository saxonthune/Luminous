# Atlas Color: custom menu item variant in cactus

## Motivation

Atlas needs a Color submenu that draws a grid of swatches (doc01.07.04 R16, R17).
cactus's menu is data-only today: `MenuItem` is a closed union of `action`,
`submenu`, and `divider`, and `MenuItemRenderer` draws an action as a text label
plus an optional hotkey. A swatch grid is not expressible.

Submenus themselves already work — Kobalte `DropdownMenu.Sub`, portalled, opened on
hover. Only the leaf rendering is missing. This phase adds one union variant so a
menu item can render arbitrary JSX, keeping the engine/domain split of CLAUDE.md:
cactus owns the popover mechanics, the domain layer owns what the content means.

This phase is cactus-only. It adds no color, no swatch, no Atlas code.

## Do NOT

- Do NOT add anything color-, swatch-, or palette-related to cactus. cactus does not
  know what a color token is. This phase adds a *generic* custom-render escape hatch
  and nothing more.
- Do NOT touch `packages/client/src/apps/atlas/**` — a later phase consumes this.
- Do NOT change or reorder the existing `action`/`submenu`/`divider` variants, or
  alter how they render. This is additive only.
- Do NOT try to make `Action.icon` render. It is unused dead weight in the type; it
  is out of scope and must stay untouched.
- Do NOT rewrite `MenuRoot`'s anchoring, the 1px invisible trigger, or the Portal.
  They work; leave them alone.

## Plan

### 1. Add the `custom` variant to the MenuItem union

In `packages/cactus/src/chrome/types.ts`, extend the `MenuItem` union:

```ts
export type MenuItem =
  | { type: 'action'; action: Action }
  | { type: 'submenu'; label: string; items: MenuItem[] }
  | { type: 'custom'; id: string; render: () => JSX.Element }
  | { type: 'divider' };
```

`id` is required so the variant is keyable and testable. `render` is a thunk, not a
JSX value, so Solid does not eagerly evaluate content for a menu that never opens.
Import `JSX` from `solid-js` as a type-only import.

### 2. Render it

In `packages/cactus/src/chrome/ChromePrimitives.tsx`, add one `Match` arm to
`MenuItemRenderer`'s existing `Switch` (near line 116), alongside the current arms:

```tsx
<Match when={item().type === 'custom'}>
  {(() => {
    const it = item() as Extract<MenuItem, { type: 'custom' }>;
    return <div class="..." data-menu-custom={it.id}>{it.render()}</div>;
  })()}
</Match>
```

Requirements for the wrapper:
- It must NOT be a `DropdownMenu.Item`. An Item takes keyboard focus and closes the
  menu on click, which would fight a grid of interactive swatches inside it.
- It must not impose padding, layout, or color on the rendered content — the content
  owns its own presentation. A bare positioning wrapper only.
- Set `data-menu-custom={id}` so tests and hit-testing can find it.

Follow the file's existing style for the other arms.

### 3. Test

Add tests to the cactus chrome test file (find it near
`packages/cactus/src/chrome/`; follow the existing framework and assertion style —
Vitest). Cover:
- A `custom` item's `render` output appears in the DOM when the menu is open.
- `render` is NOT called when the menu is closed (assert with a spy thunk) — this is
  the reason `render` is a thunk and is worth locking down.
- A `custom` item nested inside a `submenu`'s `items` renders — this is exactly how
  Atlas will use it, so it must be proven here.
- The existing `action`/`submenu`/`divider` arms still render unchanged.

## Files to Modify

- `packages/cactus/src/chrome/types.ts` — add the `custom` variant to `MenuItem`
- `packages/cactus/src/chrome/ChromePrimitives.tsx` — one `Match` arm in `MenuItemRenderer`
- cactus chrome test file — the four cases above
- `packages/cactus/src/index.ts` — only if `MenuItem`'s export needs no change (it is
  exported as a union already, so likely nothing to do; verify)

## Verification

```bash
just typecheck
just test
```

## Out of Scope

- Color tokens, swatches, the Atlas document model — later phases.
- `--cactus-container-tint` mapping — Phase 2.
- Making `Action.icon` render.

## Notes

- `MenuItem` is a recursive union; adding a variant means every exhaustive `switch`
  over it must handle the new case. Grep for other consumers of `MenuItem` before
  finishing — `packages/core/src/chrome/producers.ts` builds schemas and
  `packages/client/src/apps/dataflow/DataflowCanvas.tsx` builds a submenu; neither
  should need changing, but confirm nothing switches exhaustively and now breaks.
- Reference consumer of submenus, for style: `DataflowCanvas.tsx` lines ~233-260.

## Surface after this phase

- `MenuItem` in `packages/cactus/src/chrome/types.ts` includes the variant
  `{ type: 'custom'; id: string; render: () => JSX.Element }`, exported from
  `packages/cactus/src/index.ts` as part of the `MenuItem` union.
- `MenuItemRenderer` renders a `custom` item by calling `render()` and placing the
  result in a non-`DropdownMenu.Item` wrapper carrying `data-menu-custom={id}`,
  applying no padding, layout, or color of its own.
- `render()` is called only while the menu (or submenu) holding it is open.
- A `custom` item works inside a `submenu`'s `items` array.
- Negative space, relied on by later phases:
  - The `action`, `submenu`, and `divider` variants are unchanged and still render as
    before. `Action` has no new fields.
  - cactus still has no knowledge of color, tokens, or swatches.
  - `NodeContainer` still hardcodes `var(--cactus-container-tint, rgba(0,0,0,0.04))`
    and still has no per-container color prop. Phase 2 changes this.
  - `Canvas.tsx`'s `nodeContextMenu` / `backgroundContextMenu` / `edgeContextMenu` /
    `onAction` props are unchanged.
