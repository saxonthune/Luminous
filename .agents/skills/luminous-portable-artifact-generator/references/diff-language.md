# Composable diagram change language

Use this visual language alongside process, schema, module, and other diagram recipes. It describes change independently of node role, ownership, or field type. Avoid parenthetical status labels such as “(candidate)”, “(proposed)”, or “(new)” when the diagram context and change badges already communicate the status. Keep a qualifier only when it conveys separate information, such as an optional design. Use a current overview as the base for a proposed overview. Retain existing node
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
- `removed`: an existing component or field is removed, pale red − badge; keep it visible in the proposed view so the removal can be reviewed.
- Omit `diff` for an unchanged component or field.

Circular badges appear in Card headers and on individual schema fields. A card badge describes the component as a whole; field badges describe individual field changes. Apply both where useful without assuming every field shares its card’s status. Role colors and type badges retain their separate meanings. The legend uses the same badge vocabulary at the size of its other swatches. Symbols and
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
    - diff: removed
    - class: storage
```

Each entry specifies either `diff` or a theme `class`. Diff entries work without
a theme; class entries require their corresponding theme definition. The Legend
header remains fixed. Invalid diff values fail generation.
