# Architecture diff language

Use a current overview as the base for a proposed overview. Retain existing node
IDs, component titles, role classes, and valid relationships; add the proposed
components and connections. Explicitly distinguish an authored design comparison
from a source-computed diff. Layout is recomputed; shared IDs do not currently
pin positions across canvases.

`packages/portable/src/diff.ts` is the authoritative definition of change kinds,
labels, symbols and light/dark colors. The reusable `DiffBadge` component renders
that vocabulary in Card headers and legends. Role colors remain independent.

- `new`: new component, solid green + badge.
- `additive`: existing component gains capability, pale green ++ badge.
- `modified`: existing behavior changes, split red/green −/+ badge.
- Omit `diff` for an unchanged component.

Badges occupy a 48px square at the right edge of the Card header, with no badge
padding. The layout reserves header text space; the badge is retained at distant
zoom. The same component renders smaller swatches in the legend. Symbols and
accessible labels distinguish meanings in addition to color.

```yaml
# Inside portable-nodes:
reader:
  component: card
  title: ReadingInstance
  diff: additive
  body: Adds bounded Conversation reads while retaining existing routes.
```

Declare the vocabulary in that canvas's own legend:

```yaml
# Inside portable-canvas:
legend:
  entries:
    - diff: new
    - diff: additive
    - diff: modified
    - class: storage
```

Each entry specifies either `diff` or a theme `class`. Diff entries work without
a theme; class entries require their corresponding theme definition. The Legend
header remains fixed. Invalid diff values fail generation.
