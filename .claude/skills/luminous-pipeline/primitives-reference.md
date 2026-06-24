<!-- GENERATED FILE — do not edit by hand. Source: packages/core/src/render/primitive-descriptors.ts. Regenerate with `just gen-skill-reference`. -->

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
| `style` | enum | heading · body · caption · mono — `body` is default |
| `tone` | enum | default · muted · subtle |

### `badge`

Small inline label, typically for type annotations or status.

```json
{ "type": "badge", "value": "{content.surface}", "tone": "muted" }
```

| Prop | Type | Values / Notes |
|------|------|----------------|
| `value` | string | Interpolated string |
| `tone` | enum | default · muted · accent · danger |

### `chip`

Pill-shaped reference label. Used for summary-edge endpoints — the compact representation of a node that appears on an edge rather than as a standalone card.

```json
{ "type": "chip", "value": "{content.name}", "tone": "default" }
```

| Prop | Type | Values / Notes |
|------|------|----------------|
| `value` | string | Interpolated string |
| `tone` | enum | default · muted · accent · danger |

### `icon`

Named icon from the built-in icon set.

```json
{ "type": "icon", "name": "arrow-right", "size": 16 }
```

| Prop | Type | Values / Notes |
|------|------|----------------|
| `name` | string | Icon identifier from the built-in set |
| `size` | number | Pixel size |

### `divider`

Horizontal rule with no props.

```json
{ "type": "divider" }
```

### `link`

Clickable text. `target` opens an external URL; `onClick: "INSPECT"` opens the node in the inspector.

```json
{ "type": "link", "value": "{content.docsUrl}", "target": "{content.docsUrl}" }
{ "type": "link", "value": "{content.name}", "onClick": "INSPECT" }
```

| Prop | Type | Values / Notes |
|------|------|----------------|
| `value` | string | Display text |
| `target` | string | URL opened in a new tab when clicked |
| `onClick` | string | INSPECT — Set to `"INSPECT"` to inspect this node instead of opening a URL |

### `markdown`

Renders markdown-formatted content from a field.

```json
{ "type": "markdown", "value": "{content.description}" }
```

| Prop | Type | Values / Notes |
|------|------|----------------|
| `value` | string | Interpolated markdown string |

### `code-block`

Syntax-highlighted code.

```json
{ "type": "code-block", "value": "{content.signature}", "language": "typescript" }
```

| Prop | Type | Values / Notes |
|------|------|----------------|
| `value` | string | Interpolated code string |
| `language` | string | `typescript` · `rust` · `javascript` · etc. |

### `image`

Image from a URL field.

```json
{ "type": "image", "src": "{content.imageUrl}", "alt": "{content.name}" }
```

| Prop | Type | Values / Notes |
|------|------|----------------|
| `src` | string | Image URL |
| `alt` | string | Alt text |

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

| Prop | Type | Values / Notes |
|------|------|----------------|
| `items` | array | Array of `{ key, value }` objects; values support interpolation |

---

## Layout

Layout primitives are containers. They have `children` arrays of other primitives.

### `clamp`

Wraps any content region and limits it to a fixed number of visible lines. When the content overflows, the node shows a CSS ellipsis and becomes click-to-inspect (opens the inspector panel showing the full content). Use this to bound prose-heavy fields so node sizes stay predictable.

`text` with `style: "body"` or `style: "caption"` auto-clamps to 4 lines by default — explicit `clamp` wrappers are only needed when you want a different line count or want to clamp non-text content.

```json
{
  "type": "clamp",
  "lines": 8,
  "children": [
    { "type": "text", "value": "{content.description}", "style": "body" }
  ]
}
```

| Prop | Type | Values / Notes |
|------|------|----------------|
| `lines` | number | Max visible lines before ellipsis. Default: 3 |
| `children` | array | Any primitives whose combined text content may overflow |

**Inspector behaviour:** clicking an overflowed clamp region opens the inspector, which renders at full-expand (no clamp applied). No separate popover or modal is created.

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

| Prop | Type | Values / Notes |
|------|------|----------------|
| `gap` | number | Spacing between children (px) |
| `padding` | number | Inner padding (px) |
| `align` | enum | start · center · end · stretch |
| `justify` | enum | start · center · end · space-between |
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

| Prop | Type | Values / Notes |
|------|------|----------------|
| `gap` | number | Spacing between children (px) |
| `padding` | number | Inner padding (px) |
| `align` | enum | start · center · end · stretch |
| `justify` | enum | start · center · end · space-between |
| `children` | array | Nested primitives |

### `card`

Bordered container with optional shape. The outer frame of most node renderers.

```json
{
  "type": "card",
  "shape": "rectangle",
  "padding": 12,
  "tone": "default",
  "onClick": "INSPECT",
  "children": [ ... ]
}
```

| Prop | Type | Values / Notes |
|------|------|----------------|
| `shape` | enum | rectangle · pill · diamond · ellipse · hexagon — `rectangle` is default |
| `padding` | number | Inner padding (px) |
| `tone` | enum | Theme-token tone name |
| `onClick` | string | INSPECT — Set to `"INSPECT"` to open this node in the inspector |
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

| Prop | Type | Values / Notes |
|------|------|----------------|
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

| Prop | Type | Values / Notes |
|------|------|----------------|
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

`onClick` takes a string. The interpreter handles exactly one value today: **`"INSPECT"`**, which opens the node in the inspector (the node's id is passed automatically).

```json
{ "type": "card", "onClick": "INSPECT" }
```

Any other string is accepted but currently does nothing — a future dispatch bus will route them. Do not invent event names; use `"INSPECT"` or omit `onClick`.

---

## Worked Example — a complete nodeKind render

Note that `render` is a **map keyed by disclosure level** (`peek` / `card` / `open` / `deep`).
Each level's value is a RenderNode tree. This example authors two levels:

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
    "peek": { "type": "text", "value": "{content.name}", "style": "heading" },
    "card": {
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
}
```
