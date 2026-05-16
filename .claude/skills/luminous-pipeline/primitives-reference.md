# Primitive Vocabulary Reference

Source of truth: `.carta/02-design/16-renderer-engine.md` (doc02.16). This file is a condensed agent-facing catalog. If the two diverge, the source doc wins.

The primitive vocabulary is the fixed set of building blocks a pack author composes in each kind's `render` field. The interpreter in `@luminous/core` executes these; pack authors only write JSON.

---

## Atoms

Atoms are leaf nodes in the render tree — they paint content directly.

### `text`

Plain text with optional interpolation.

```json
{ "type": "text", "value": "{content.name}", "style": "heading", "tone": "default" }
```

| Prop | Type | Values / Notes |
|------|------|----------------|
| `value` | string | Literal or `{content.fieldName}` interpolation |
| `style` | enum | `heading` · `body` (default) · `caption` · `mono` |
| `tone` | enum | `default` · `muted` · `subtle` |

### `badge`

Small inline label, typically for type annotations or status.

```json
{ "type": "badge", "value": "{content.surface}", "tone": "muted" }
```

| Prop | Type | Values |
|------|------|--------|
| `value` | string | Interpolated string |
| `tone` | enum | `default` · `muted` · `accent` · `danger` |

### `chip`

Pill-shaped reference label. Used for summary-edge endpoints — the compact representation of a node that appears on an edge rather than as a standalone card.

```json
{ "type": "chip", "value": "{content.name}", "tone": "default" }
```

Props: `value`, `tone` (same enum as badge).

### `icon`

Named icon from the built-in icon set.

```json
{ "type": "icon", "name": "arrow-right", "size": 16 }
```

| Prop | Type | Notes |
|------|------|-------|
| `name` | string | Icon identifier from the built-in set |
| `size` | number | Pixel size |

### `divider`

Horizontal rule with no props.

```json
{ "type": "divider" }
```

### `link`

Clickable text that dispatches a navigation event.

```json
{ "type": "link", "value": "{content.name}", "target": "FOCUS_NODE" }
```

| Prop | Type | Notes |
|------|------|-------|
| `value` | string | Display text |
| `target` | string | Event name dispatched into the app statechart |

### `markdown`

Renders markdown-formatted content from a field.

```json
{ "type": "markdown", "value": "{content.description}" }
```

### `code-block`

Syntax-highlighted code.

```json
{ "type": "code-block", "value": "{content.signature}", "language": "typescript" }
```

| Prop | Type | Notes |
|------|------|-------|
| `value` | string | Interpolated code string |
| `language` | string | `typescript` · `rust` · `javascript` · etc. |

### `image`

```json
{ "type": "image", "src": "{content.imageUrl}", "alt": "{content.name}" }
```

### `kv-list`

Key/value rows. Each item is a fixed-key, interpolated-value pair.

```json
{
  "type": "kv-list",
  "items": [
    { "key": "reads",  "value": "{content.reads | join:', '}" },
    { "key": "file",   "value": "{content.filePath}" }
  ]
}
```

---

## Layout

Layout primitives are containers. They have `children` arrays of other primitives.

### `vstack`

Vertical stack of children.

```json
{
  "type": "vstack",
  "gap": 8,
  "padding": 12,
  "align": "start",
  "children": [ ... ]
}
```

| Prop | Type | Values |
|------|------|--------|
| `gap` | number | Spacing between children (px) |
| `padding` | number | Inner padding (px) |
| `align` | enum | `start` · `center` · `end` · `stretch` |
| `justify` | enum | `start` · `center` · `end` · `space-between` |
| `children` | array | Nested primitives |

### `hstack`

Horizontal stack. Same props as `vstack`.

```json
{
  "type": "hstack",
  "gap": 6,
  "justify": "space-between",
  "children": [ ... ]
}
```

### `card`

Bordered container with optional shape. The outer frame of most node renderers.

```json
{
  "type": "card",
  "shape": "rectangle",
  "padding": 12,
  "tone": "default",
  "onClick": "FOCUS_NODE",
  "children": [ ... ]
}
```

| Prop | Type | Values |
|------|------|--------|
| `shape` | enum | `rectangle` (default) · `pill` · `diamond` · `ellipse` · `hexagon` |
| `padding` | number | Inner padding (px) |
| `tone` | enum | Theme-token tone name |
| `onClick` | string | Event dispatched on click (e.g. `"FOCUS_NODE"`) |
| `children` | array | Nested primitives |

`shape` covers flowchart-style packs: `diamond` for decisions, `pill` for start/end, `rectangle` for process steps. Shape is an attribute of the container, not a separate primitive.

---

## Control Flow

### `if`

Conditional branch based on a content expression.

```json
{
  "type": "if",
  "when": "content.reads.length > 0",
  "then": { "type": "kv-list", "items": [ ... ] },
  "else": { "type": "text", "value": "—", "tone": "muted" }
}
```

| Prop | Type | Notes |
|------|------|-------|
| `when` | string | Expression over `content`; truthy = render `then` |
| `then` | primitive | Rendered when `when` is truthy |
| `else` | primitive | Optional; rendered when `when` is falsy |

### `for-each`

Repeat a template over an array field.

```json
{
  "type": "for-each",
  "items": "content.tags",
  "as": "tag",
  "template": { "type": "badge", "value": "{tag}", "tone": "muted" }
}
```

| Prop | Type | Notes |
|------|------|-------|
| `items` | string | Path into content resolving to an array |
| `as` | string | Binding name available in `template` via `{as}` |
| `template` | primitive | Rendered once per item |

### `bind`

Implicit — content interpolation is written as `"{content.fieldName}"` directly in any `value` prop. The interpreter resolves it at render time. No explicit `bind` primitive is needed.

---

## Style References

Use theme-token names rather than literal CSS values for colors and spacing. Theme switching cascades automatically.

Common tokens:
- Tones: `default`, `muted`, `subtle`, `accent`, `danger`
- Backgrounds: `surface`, `surface-alt`, `surface-raised`
- Foregrounds: `fg`, `fg-muted`, `fg-subtle`

---

## Events

Renderers dispatch events as strings. The engine handles dispatch into the app statechart.

```json
{ "type": "card", "onClick": "FOCUS_NODE" }
```

The node's id is sent as the event payload automatically. Use `"FOCUS_NODE"` for the standard focus interaction.

---

## Worked Example — a complete nodeKind render

```json
{
  "id": "solid.component",
  "label": "Component",
  "props": {
    "type": "object",
    "properties": {
      "name":     { "type": "string" },
      "filePath": { "type": "string" },
      "props":    { "type": "array", "items": { "type": "string" } }
    }
  },
  "render": {
    "type": "card", "shape": "rectangle", "padding": 12,
    "children": [
      {
        "type": "hstack", "gap": 6, "justify": "space-between",
        "children": [
          { "type": "text", "value": "{content.name}", "style": "heading" },
          { "type": "badge", "value": "component", "tone": "muted" }
        ]
      },
      { "type": "text", "value": "{content.filePath}", "style": "caption", "tone": "muted" },
      {
        "type": "if",
        "when": "content.props.length > 0",
        "then": {
          "type": "for-each",
          "items": "content.props",
          "as": "prop",
          "template": { "type": "chip", "value": "{prop}", "tone": "default" }
        }
      }
    ]
  }
}
```
