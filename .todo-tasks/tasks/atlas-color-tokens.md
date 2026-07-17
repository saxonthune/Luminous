# Atlas Color: Color Tokens and the document field

## Motivation

Atlas nodes are all one color today — `AtlasNodeContent.tsx` hardcodes `bg-surface`
and `border-border-subtle`, and there is no color field anywhere in the Atlas model.
doc01.07.04 R12-R14 require a Node to carry a Color, drawn from a fixed set of Color
Tokens rather than an arbitrary color, with the Node's Container drawn in the same
Color but lighter.

This phase builds the vocabulary and the data path: the Color Token set in CSS, the
`color` field on `AtlasNode` threaded through parse/serialize/operations, and the
`--cactus-container-tint` mapping cactus needs. It draws nothing and adds no UI —
Phase 3 consumes all of it.

Glossary (doc01.07.03): a **Color Token** names a color and is not itself a color;
each theme decides what color a token is drawn as. That is the whole point of the
design — the Document stores a token name, never a hex.

## Do NOT

- Do NOT store a hex, rgb, or any literal color in the Atlas Document. The document
  stores a Color Token *name* (e.g. `"moss"`). `PgCanvasView.tsx`'s hardcoded
  `PALETTE` of six hex literals is the anti-pattern here — it is theme-blind. Do not
  copy it, do not import it, do not extend it.
- Do NOT define a separate container color per token. The container shade is derived
  with `color-mix`; one token, one stored value.
- Do NOT reuse or rename the existing `--color-kind-{component,signal,store,memo,
  effect,hook,datasource}-*` vars. Those are Canvas pipeline semantics. Leave them
  exactly as they are.
- Do NOT touch `packages/client/src/apps/atlas/AtlasNodeContent.tsx`, `AtlasCanvas.tsx`,
  or build any swatch/menu UI. Phase 3 owns all rendering.
- Do NOT make `color` required on `AtlasNode`. Existing documents have no color and
  must keep parsing.

## Plan

### 1. Define the Color Token set

In `packages/core/src/atlas/`, add a new module `colors.ts` exporting the token
vocabulary as the single source of truth:

```ts
export const ATLAS_COLOR_TOKENS = [
  'slate', 'moss', 'deep-moss', 'ochre', 'violet', 'indigo', 'oxide', 'rose',
] as const;
export type AtlasColorToken = (typeof ATLAS_COLOR_TOKENS)[number];
export function isAtlasColorToken(v: unknown): v is AtlasColorToken;
```

Eight tokens. Seven names come from the `ground` theme's existing `--hue-*` palette
in `packages/client/src/index.css` (slate, moss, deep-moss, ochre, violet, indigo,
oxide); `rose` is the eighth. Export from `packages/core/src/atlas/index.ts`.

The count is deliberately not fixed by the docs — keep it a property of this array,
so adding a ninth token is a one-line change here plus its CSS.

### 2. Add the `color` field to the model

In `packages/core/src/atlas/types.ts`, add to `AtlasNode`:
```ts
color?: AtlasColorToken;
```
Then thread it through every gate — the model has strict allow-lists, so missing one
silently drops the field:

- `packages/core/src/atlas/document.ts`
  - `NODE_FIELDS` (line ~12) — add `'color'`, or the field is rejected as unknown.
  - Parse: validate with `isAtlasColorToken`. An unrecognized token is an issue
    reported through the existing issue mechanism — follow how the file reports other
    invalid fields. Do not throw, and do not silently coerce.
  - `serializeNode` (line ~214) — write `color` when present, omit when absent.
- `packages/core/src/atlas/operations.ts`
  - `setNode`'s patch type — add `color?: AtlasColorToken`. The function uses
    `'k' in patch` semantics, so passing `color: undefined` deletes the field. That
    is how a node is reset to no color; preserve it.
  - `SetNodeAction` and `applyAtlasBatch`'s `set` case — carry `color` through.

### 3. Define the token colors per theme

In `packages/client/src/index.css`, add a `--color-token-{name}` var for all eight
tokens under each of the three theme blocks: `:root, [data-theme="light"]` (~line 15),
`[data-theme="dusk"]` (~59), `[data-theme="ground"]` (~102).

Define ONE var per token — the node color. The container shade is derived at use
site, not stored:

```css
[data-theme="ground"] {
  --color-token-moss: var(--hue-moss);
  /* ...one per token... */
}
```

`ground` maps straight onto its existing `--hue-*` vars. `light` and `dusk` have no
hue layer — pick colors that read against each theme's own `--surface`, following how
those blocks already define `--color-kind-*`.

Then expose the pair Tailwind/consumers need via the existing `@theme inline` block
(~line 190), following its established pattern, so Phase 3 can apply a token without
knowing the derivation. The container shade is:

```css
color-mix(in oklch, var(--color-token-moss) 40%, var(--surface))
```

Mix percentage is a judgment call — pick one value, use it uniformly for all eight
tokens in all three themes, and name it once as a var (e.g. `--color-token-container-mix`)
rather than repeating a magic number. R13 only requires the container read lighter
than the node and be told apart from it.

### 4. Map the container tint contract

`packages/cactus/src/NodeContainer.tsx` draws its soft-container tint from
`var(--cactus-container-tint, rgba(0,0,0,0.04))`. Luminous's `:root { --cactus-*: ... }`
block (`index.css` ~line 167-187) maps its tokens onto cactus's contract but does NOT
map `--cactus-container-tint`, so every container currently falls back to that flat
`rgba(0,0,0,0.04)`.

Add the mapping to that block, pointing at a sensible theme default. This makes the
variable overridable per-container by an ancestor element's inline style, which is how
Phase 3 will color a container without cactus learning what a color is.

Verify against `packages/cactus/src/cactus-tokens.ts` (`CACTUS_TOKENS`) that
`container-tint` is spelled as that contract expects.

### 5. Test

Add to the existing Atlas core tests (find them near `packages/core/src/atlas/`;
follow the existing framework and assertion style — Vitest):
- A document with a valid `color` round-trips: parse → serialize → identical.
- A node with no `color` still parses, and serializes without a `color` key.
- An invalid token (e.g. `"chartreuse"`) reports an issue rather than throwing or
  being silently accepted.
- `setNode(doc, id, { color: 'moss' })` sets it; `setNode(doc, id, { color: undefined })`
  removes it.
- `applyAtlasBatch` carries a `set` action's `color` through.
- `isAtlasColorToken` accepts every member of `ATLAS_COLOR_TOKENS` and rejects a
  non-member.

## Files to Modify

- `packages/core/src/atlas/colors.ts` — NEW: token vocabulary + type guard
- `packages/core/src/atlas/index.ts` — export the above
- `packages/core/src/atlas/types.ts` — `color?: AtlasColorToken` on `AtlasNode`
- `packages/core/src/atlas/document.ts` — `NODE_FIELDS`, parse validation, `serializeNode`
- `packages/core/src/atlas/operations.ts` — `setNode` patch, `SetNodeAction`, `applyAtlasBatch`
- `packages/client/src/index.css` — token vars in 3 theme blocks, `@theme inline`, `--cactus-container-tint` mapping
- Atlas core test file — the cases above

## Verification

```bash
just typecheck
just test
```

## Out of Scope

- Drawing a node or container in its color — Phase 3.
- The swatch grid, the context menu, hover preview — Phase 3.
- Colors for Canvas or Dataflow nodes.
- Any change to `--color-kind-*`.

## Notes

- The strict allow-list in `document.ts` is the trap here: `NODE_FIELDS` gates parsing
  and `serializeNode` gates writing, independently. Miss either and `color` vanishes
  on round-trip with no error. The round-trip test above is what catches it.
- CLAUDE.md requires that a change to a schema update its skill doc in the same change.
  This is the Atlas document, not the Canvas pack/graph and not the dataflow document,
  so neither `.claude/skills/luminous-pipeline/SKILL.md` nor
  `.claude/skills/luminous-dataflow/SKILL.md` applies. If a skill doc describing the
  Atlas document shape exists, update it; otherwise there is nothing to sync.

## Surface after this phase

- `packages/core/src/atlas/colors.ts` exports `ATLAS_COLOR_TOKENS` (a readonly tuple of
  8 token names: `slate`, `moss`, `deep-moss`, `ochre`, `violet`, `indigo`, `oxide`,
  `rose`), the type `AtlasColorToken`, and `isAtlasColorToken(v: unknown): v is AtlasColorToken`.
  All are re-exported from `packages/core/src/atlas/index.ts`.
- `AtlasNode` has `color?: AtlasColorToken`. It parses, validates, and round-trips
  through `parseAtlasDocument` / `serializeAtlasDocument`. An invalid token reports an
  issue rather than throwing.
- `setNode(doc, id, { color })` sets the color; `{ color: undefined }` removes it.
  `SetNodeAction` carries `color`, and `applyAtlasBatch` applies it.
- `packages/client/src/index.css` defines `--color-token-{name}` for all 8 tokens under
  each of `:root, [data-theme="light"]`, `[data-theme="dusk"]`, and `[data-theme="ground"]`,
  and exposes node + container shades through `@theme inline`. The container shade is
  derived from the node token with `color-mix(in oklch, …)` at a single shared mix
  percentage.
- `--cactus-container-tint` is mapped in the `:root { --cactus-*: … }` block, so an
  ancestor element can override it per-container via inline style.
- Negative space, relied on by Phase 3:
  - Nothing draws a node or container in its color yet. `AtlasNodeContent.tsx` still
    hardcodes `bg-surface` / `border-border-subtle` and still selects with
    `border-accent-subtle` + outline. `AtlasCanvas.tsx` is untouched.
  - `AtlasRenderNode` in `projection.ts` still has no color field.
  - `NodeContainer` still has no per-container color prop and still reads
    `var(--cactus-container-tint, …)`.
  - `--color-kind-*` is unchanged and still unreferenced from TS.
  - `mutations.ts` has no color helper.
