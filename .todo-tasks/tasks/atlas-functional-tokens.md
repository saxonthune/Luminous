# Atlas — neutral-keyed color tokens + MCP enum contract

## Motivation

Atlas node colors are stored as pigment-named tokens (`slate`, `moss`, `deep-moss`,
`ochre`, `violet`, `indigo`, `oxide`, `rose`). The name *is* the color, which fuses two
things that should be separate: the **slot** a node references (stable, theme-independent)
and the **pigment** a theme paints it (UI-only, human-facing). Because the slot is named
after its hue, a theme can never remap it — "moss but blue in this theme" is a
contradiction. This is the vim highlight-group vs. colorscheme distinction: a node should
carry a functional slot key; the theme decides the pigment.

Rename the eight tokens to neutral keys (`accent-1` … `accent-8`) so:
- the **data** stores a hue-agnostic slot,
- the **theme** owns the pigment via the existing CSS-var chain (a theme can remap
  `accent-1` to any hue by reassigning one variable),
- the **MCP contract** hands the LLM a closed enum of eight opaque categories with no hue
  promise — restricted access to a fixed set, discoverable in the tool schema.

Pigment names stay only at the palette layer (`--hue-*`, `--color-token-*`) — that layer
is "the box of crayons" and is allowed to name crayons by color. Only the slot layer
(`--color-atlas-*`), the stored value, and the MCP contract go neutral.

The key mapping preserves current appearance 1:1:

| old token   | new key    |
|-------------|------------|
| `slate`     | `accent-1` |
| `moss`      | `accent-2` |
| `deep-moss` | `accent-3` |
| `ochre`     | `accent-4` |
| `violet`    | `accent-5` |
| `indigo`    | `accent-6` |
| `oxide`     | `accent-7` |
| `rose`      | `accent-8` |

## Do NOT

- Do NOT rename the palette layer. Leave `--hue-slate`/`--hue-moss`/… and
  `--color-token-slate`/`--color-token-moss`/… (`packages/client/src/index.css`) exactly
  as they are. They are the shared crayon box — the Canvas `--color-kind-*` vars and
  `--accent: var(--hue-oxide)` also depend on them. Only the `--color-atlas-*` slot block
  gets renamed.
- Do NOT introduce arbitrary/free-form color input anywhere. The set stays fixed at eight
  (R14). The MCP `color` param must be a closed enum, not a bare string.
- Do NOT touch `.luminous/gitignored/braincrawl.atlas.json` — it is gitignored and
  human-owned. Migrate only tracked `.atlas.json` files.
- Do NOT add a separate "styling" MCP tool. Color stays a property set while editing a
  node (`atlas node/set`, and now `atlas node/add`).
- Do NOT reorder the token list — order defines the swatch-grid layout and the 1:1 mapping
  above.

## Plan

### 1. Rename the token set in core (single source of truth)

`packages/core/src/atlas/colors.ts` — replace the eight pigment names with the neutral
keys, order-preserving:

```ts
export const ATLAS_COLOR_TOKENS = [
  'accent-1', 'accent-2', 'accent-3', 'accent-4',
  'accent-5', 'accent-6', 'accent-7', 'accent-8',
] as const;
```

`AtlasColorToken`, `isAtlasColorToken` derive from the array — no other change in this
file. Everything that imports the type or the runtime guard (`operations.ts`, `check.ts`,
the client, the MCP server) follows automatically.

### 2. Rename the slot layer in CSS (this is the theme seam)

`packages/client/src/index.css`, the `:root` block at lines ~223-240 (the one prefaced by
the "Atlas color-picker vars must live in a plain :root block" comment). Rename each
`--color-atlas-<pigment>` / `--color-atlas-<pigment>-container` pair to
`--color-atlas-accent-N` / `--color-atlas-accent-N-container`, keeping the right-hand side
pointing at the same `--color-token-*` so the rendered colors are unchanged. Example:

```css
  --color-atlas-accent-1:           var(--color-token-slate);
  --color-atlas-accent-1-container: color-mix(in oklch, var(--color-token-slate) var(--color-token-container-mix), var(--surface));
  --color-atlas-accent-2:           var(--color-token-moss);
  --color-atlas-accent-2-container: color-mix(in oklch, var(--color-token-moss) var(--color-token-container-mix), var(--surface));
  /* … accent-3→deep-moss, accent-4→ochre, accent-5→violet,
        accent-6→indigo, accent-7→oxide, accent-8→rose */
```

Update the block's leading comment to note that these slots are the theme seam: a theme may
reassign `--color-atlas-accent-N` to a different `--color-token-*` to remap the palette
without touching data. `AtlasNodeContent.tsx` (`var(--color-atlas-${token}-container)`)
and `ColorSwatchGrid.tsx` (`var(--color-atlas-${token})`) build the var name from the
token at runtime, so they need no change once the token strings are `accent-N`.

### 3. Add an `enum` param type to the MCP DSL

`packages/mcp/src/tools.config.ts` — extend the `ParamType` union (lines 1-7) with an enum
variant:

```ts
  | { type: 'enum'; values: readonly string[] }
```

`packages/mcp/src/server.ts` — in `paramToJsonSchema` (line 38), add a branch before the
final throw:

```ts
  if (param.type === 'enum') {
    return { type: 'string', enum: [...param.values] }
  }
```

### 4. Wire the Atlas color params to the enum

`packages/mcp/src/tools.config.ts` — import the token list at the top:

```ts
import { ATLAS_COLOR_TOKENS } from '@luminous/core/atlas'
```

`atlas node/set` `color?` (lines ~623-627): change `innerType: 'string'` to
`innerType: { type: 'enum', values: ATLAS_COLOR_TOKENS }`, and update the description to
name the contract, e.g. *"Color slot for the node — one of eight fixed categorical tokens.
The pigment each slot paints is theme-owned; the tokens carry no inherent hue."*

`atlas node/add` (params block ends ~line 586): **add** a `'color?'` param with the same
enum `innerType` and a description noting it colors the node at creation. This closes the
current gap where a node can only be colored by a second `set` call.

### 5. Migrate tracked `.atlas.json` documents

Rewrite `color` values old→new per the mapping table in these **tracked** files:
- `.luminous/braincrawl.atlas.json`
- `packages/client/e2e/fixtures/sample.atlas.json`

Read each, replace every `"color": "<pigment>"` with its `accent-N` key. (Do not touch the
gitignored copy under `.luminous/gitignored/`.)

### 6. Update tests that use literal token strings

Replace literal old-token strings (`'moss'`, `'rose'`, etc.) with their `accent-N` keys in:
- `packages/core/tests/atlas/document.test.ts` (lines ~289, 311)
- `packages/core/tests/atlas/history.test.ts` (lines ~53, 101)
- `packages/core/tests/atlas/operations.test.ts` (lines ~123, 125, 129, 136, 139, 385, 389)
- `packages/client/src/apps/atlas/__tests__/mutations.test.ts` (line ~48)

The specific pigment chosen in each test is arbitrary — map it through the table (e.g.
`'moss'` → `'accent-2'`, `'rose'` → `'accent-8'`).

### 7. Update the Atlas docs that name the token set

Grep the Atlas product docs (`.rhidoc/01-product/07-atlas/`) for the old pigment token
names and for any prose describing tokens as color-named. Where a doc **enumerates** the
tokens (e.g. a glossary entry, or R14's Color Token definition), update it to describe them
as neutral categorical slots whose pigment is theme-owned. Do not invent new requirements —
only correct existing prose that assumes hue-named tokens (per the transduce-don't-editorialize
rule). If `.rhidoc` files change structurally, run `rhidoc regenerate`; a pure content edit
just needs the edit.

## Files to Modify

- `packages/core/src/atlas/colors.ts` — rename the eight tokens to `accent-1..8`
- `packages/client/src/index.css` — rename the `--color-atlas-*` slot block; update its comment
- `packages/mcp/src/tools.config.ts` — add `enum` ParamType; import `ATLAS_COLOR_TOKENS`; wire `node/set` + `node/add` `color?`
- `packages/mcp/src/server.ts` — add the `enum` branch to `paramToJsonSchema`
- `.luminous/braincrawl.atlas.json` — migrate `color` values
- `packages/client/e2e/fixtures/sample.atlas.json` — migrate `color` values
- `packages/core/tests/atlas/document.test.ts` — literal token strings
- `packages/core/tests/atlas/history.test.ts` — literal token strings
- `packages/core/tests/atlas/operations.test.ts` — literal token strings
- `packages/client/src/apps/atlas/__tests__/mutations.test.ts` — literal token strings
- `.rhidoc/01-product/07-atlas/*.md` — correct prose that names tokens by hue (only where it enumerates them)

## Verification

```bash
just typecheck
just test-core
just test-mcp
just test-client
grep -rn -E "'(slate|moss|deep-moss|ochre|violet|indigo|oxide|rose)'" packages/core/src/atlas packages/client/src/apps/atlas packages/mcp/src && echo "STRAY OLD TOKENS FOUND" && exit 1 || echo "no stray quoted old-token literals"
grep -rn -E "\"color\": \"(slate|moss|deep-moss|ochre|violet|indigo|oxide|rose)\"" .luminous/braincrawl.atlas.json packages/client/e2e/fixtures/sample.atlas.json && echo "UNMIGRATED DOC COLOR" && exit 1 || echo "docs migrated"
```

> `just typecheck` is the strongest gate: since `AtlasColorToken` no longer includes the
> pigment names, any leftover `color: 'moss'` literal in typed source becomes a type error.
> The two greps catch untyped occurrences (JSON docs, the CSS var block is exempt because it
> uses `--color-token-*`, not quoted string literals).

## Out of Scope

- Per-slot author labels on the graph ("accent-1 = OpenAlex sources"). A good follow-up
  that slots into the graph-vs-pack rule (label travels with data, pigment with theme), but
  not this task.
- A second Atlas theme that actually remaps the slots. This task only creates the seam; it
  ships a single theme with the current pigments.
- Any change to Canvas (pack-based) styling or `pack describe`.

## Notes

- The gitignored `.luminous/gitignored/braincrawl.atlas.json` will still hold old pigment
  keys after this lands; opening it in Atlas will render those nodes uncolored (the
  `--color-atlas-slate` var no longer exists). It is human-owned — the operator can
  re-pick colors or migrate it by hand. Called out so a reviewer isn't surprised.
- `isAtlasColorToken` is the write-time guard (via `operations.ts`/`check.ts`); it follows
  the renamed array automatically, so invalid tokens are rejected server-side regardless of
  the MCP schema enum. The enum is for **discoverability**, the guard is for **enforcement**
  — both matter.
