# Fix Atlas color picker — colors never render (missing CSS vars)

## Motivation

The Atlas color picker is visually inert: swatches render blank, hovering a swatch
previews nothing, and selecting a swatch produces no visible change on the node.

Root cause (confirmed by building the real `packages/client/src/index.css` with
`@tailwindcss/cli` v4.3.3 and grepping the output): the `--color-atlas-<token>` and
`--color-atlas-<token>-container` custom properties are declared **only inside the
`@theme inline { … }` block** (`packages/client/src/index.css:242-257`). Tailwind v4
only materializes a `@theme` variable when a static utility class referencing it
(e.g. `bg-atlas-slate`) appears in scanned source. No such class exists — the Atlas
code deliberately builds `var(--color-atlas-${token})` dynamically in inline styles,
which Tailwind's scan cannot see (the author's own comment at
`AtlasNodeContent.tsx:79-82` explains why they avoid `bg-atlas-${token}`). So Tailwind
treats these theme keys as unused and emits **none** of them. At runtime every
`var(--color-atlas-<token>)` resolves to nothing.

This single missing-variable fact explains all three symptoms, at three call sites:
- `ColorSwatchGrid.tsx:46` — swatch `background-color: var(--color-atlas-<token>)` → unset (blank swatches).
- `AtlasNodeContent.tsx:86` — node fill/border → unset (hover preview and applied color invisible).
- `AtlasCanvas.tsx:86` — container tint `--cactus-container-tint: var(--color-atlas-<token>-container)` → unset.

The data/selection path is fine and already persists the chosen color
(`AtlasCanvas.tsx:293-297` `selectColor` → `mutations.ts` `buildColorPatch` →
`packages/core/src/atlas/operations.ts`). Only rendering is broken. This is a
CSS-only fix.

The base `--color-token-*` tokens these atlas vars reference are declared in ordinary
`:root` / `[data-theme]` blocks (`index.css:57-65, 110-118, 182-190`) and DO survive
the build (verified: present in all three theme variants). Because the atlas vars only
reference lazily-resolved vars (`--color-token-*`, `--color-token-container-mix`,
`--surface`), they can be declared **once** in an ordinary `:root` block and will pick
up per-theme values automatically at use time — no per-`[data-theme]` repetition needed.

## Do NOT

- Do NOT change any `.tsx` file. The call sites (`ColorSwatchGrid.tsx`,
  `AtlasNodeContent.tsx`, `AtlasCanvas.tsx`) already reference the vars correctly; the
  only defect is that the vars aren't emitted. This is a CSS-only change.
- Do NOT switch the Atlas code to static Tailwind utility classes (`bg-atlas-slate`
  etc.). The token is chosen at runtime, so a static class can't work — that is exactly
  why inline `var()` was used.
- Do NOT duplicate the atlas var declarations into each `[data-theme]` block. One
  `:root` declaration suffices because the referenced vars resolve lazily per theme.
- Do NOT alter the `--color-token-*` definitions or any `[data-theme]` block.
- Do NOT touch the Kobalte/context-menu wiring — the selection path works.

## Plan

### 1. Move the atlas var block out of `@theme inline` into `:root`

In `packages/client/src/index.css`:

- Delete the 16 atlas lines currently inside the `@theme inline { … }` block
  (`index.css:242-257`): the `--color-atlas-<token>` and
  `--color-atlas-<token>-container` pairs for all 8 tokens
  (slate, moss, deep-moss, ochre, violet, indigo, oxide, rose). Leave the rest of the
  `@theme inline` block (the `--color-canvas`, `--color-surface`, … utility-generating
  entries) untouched.
- Add the identical 16 declarations to an ordinary `:root` block so they emit as real
  custom properties. The existing `:root` at `index.css:197-218` (the cactus contract
  mapping) is a natural home, or add a dedicated `:root { /* Atlas color vars */ … }`
  block near it. Keep the exact same right-hand-side values, e.g.:
  ```css
  --color-atlas-slate: var(--color-token-slate);
  --color-atlas-slate-container:
    color-mix(in oklch, var(--color-token-slate) var(--color-token-container-mix), var(--surface));
  ```
  (repeat for all 8 tokens).

## Files to Modify

- `packages/client/src/index.css` — relocate the 16 `--color-atlas-*` declarations from
  the `@theme inline` block into a plain `:root` block.

## Verification

```bash
# Build the real client CSS with the actual Tailwind toolchain and confirm the atlas
# vars now survive as :root custom properties (they were absent before the fix).
npx --prefix packages/client @tailwindcss/cli -i packages/client/src/index.css -o /tmp/atlas-css-check.out.css
grep -q -- '--color-atlas-slate:' /tmp/atlas-css-check.out.css && echo "OK: --color-atlas-slate emitted"
grep -q -- '--color-atlas-slate-container:' /tmp/atlas-css-check.out.css && echo "OK: --color-atlas-slate-container emitted"
grep -q -- '--color-atlas-rose:' /tmp/atlas-css-check.out.css && echo "OK: --color-atlas-rose emitted"
grep -c -- '--color-atlas-' /tmp/atlas-css-check.out.css   # expect 16
rm -f /tmp/atlas-css-check.out.css
just typecheck-client 2>/dev/null || pnpm -C packages/client exec tsgo --noEmit -p tsconfig.json
```

## Out of Scope

- Any redesign of the color picker UX or the swatch palette.
- The secondary theory that Kobalte's dropdown dismiss swallows the swatch click — the
  selection path was confirmed to work at the data layer, so it is not part of this fix.
  If, after the CSS fix, clicking a swatch still fails to persist (verify at runtime),
  file a separate task.

## Notes

- Verify at runtime after the fix: open an Atlas canvas, open a node's color menu, and
  confirm (a) swatches show their colors, (b) hovering previews the node color, (c)
  clicking persists and renders the color. The build-time grep proves the vars emit; a
  quick manual pass proves the full loop.
- The `-container` mixes depend on `--surface`, which changes per theme; because they're
  declared once in `:root` and resolve lazily, they will correctly re-tint per active
  `[data-theme]`. Spot-check in more than one theme (e.g. default and `dusk`).
