---
title: Renderer engine
summary: Renderers are JSON over a primitive vocabulary; the engine interprets them; custom primitives are the code escape hatch.
tags: [renderer, primitives, pack, rendering]
deps: [doc02.14, doc02.11]
---

# Renderer engine

A renderer is a function `(node-data, state) → visual-thing`. The visual thing is some composition of geometry, text, atoms (icons, badges, dividers), layout, conditional structure, and reactions to interaction. None of those concerns individually requires code. What requires code is **interpreting** the composition.

The renderer engine separates the two. The composition is data — JSON or equivalent — authored per node kind by a pack. The interpretation is a single piece of code in `@luminous/core` that walks the composition tree, materializes the right DOM, binds it to node content, and dispatches events. Every pack uses the same interpreter; only the per-kind composition trees differ.

This document defines what is data and what is code, names the primitive vocabulary, explains the custom-primitive escape hatch, and describes the fallback behaviour when a graph references kinds the engine has never seen.

## The split

Walk down what a renderer needs to express and ask "can this be a string in JSON?":

| Concern | Data? | If yes, how |
|---|---|---|
| Position, size, shape | yes | numbers, enums |
| Content text | yes | string with `{content.field}` interpolation |
| Atom choice (icon, badge, code-block) | yes | enum picking from the vocabulary |
| Layout (vstack, hstack, gap, alignment) | yes | flexbox-as-JSON tree |
| Conditional structure | yes | if/then/else nodes in the tree |
| Style (color, font, padding) | yes | theme-token references |
| Click → dispatch event | yes | `{ "onClick": "FOCUS_NODE" }` — a string the engine reduces |
| The atoms themselves | **no** | painting pixels is code |
| The interpreter | **no** | walking the tree is code |

So the renderer engine is two things:

1. A **vocabulary of primitives** — text, badge, vstack, markdown, code-block, image, and so on. Each primitive is a Solid component, written once in `@luminous/core`. These paint actual pixels.
2. An **interpreter** that reads renderer JSON and assembles primitives into a node's DOM. One implementation, in `@luminous/core`, once.

Everything that combines primitives — every per-kind renderer — is data.

## The primitive vocabulary

The built-in vocabulary covers the common case for the canonical packs (see [doc02.18](18-pack-examples.md)):

### Atoms

| Primitive | Purpose | Common props |
|---|---|---|
| `text` | Plain text with style and interpolation | `value` (string with `{content.*}` refs), `style` (heading / body / caption / mono), `tone` (default / muted / subtle) |
| `badge` | Small inline label | `value`, `tone` (default / muted / accent / danger) |
| `chip` | Pill-shaped reference label, often used for summary-role edges | `value`, `tone` |
| `icon` | Named icon from a built-in set | `name`, `size` |
| `divider` | Horizontal rule | (none) |
| `link` | Text that dispatches navigation | `value`, `target` |
| `markdown` | Rich text from content markdown | `value` |
| `code-block` | Syntax-highlighted code | `value`, `language` |
| `image` | Image by URL or asset reference | `src`, `alt` |
| `kv-list` | Key/value rows | `items: { key, value }[]` |

### Layout

| Primitive | Purpose | Common props |
|---|---|---|
| `vstack` | Vertical stack | `gap`, `padding`, `align`, `justify` |
| `hstack` | Horizontal stack | `gap`, `padding`, `align`, `justify` |
| `card` | Bordered container with header / body / footer regions | `shape` (rectangle / pill / diamond / ellipse / hexagon), `padding`, `tone` |

The `shape` attribute on `card` is the answer to flowchart-style packs that need diamonds for decisions and pills for start/end states. Shape is an aspect of the container, not a separate primitive.

### Control flow

| Primitive | Purpose | Common props |
|---|---|---|
| `if` | Conditional branch | `when` (expression over content), `then`, `else` |
| `for-each` | Repeat over an array | `items` (path into content), `as` (binding name), `template` |
| `bind` | Bind a content path into a string used by a child primitive | (implicit in `value: "{content.x}"` syntax) |

### Style references

Colors, spacing, and font sizes are referenced by theme-token names (`accent`, `fg-muted`, `surface-alt`) rather than literal values. Theme switching (see [doc02.12](12-app-shell-statechart.md)) cascades through every rendered node without per-renderer changes.

## A worked example

A `pack.json` entry for the RTP statechart's `state` node kind, in this model:

```json
{
  "kind": "statechart.state",
  "render": {
    "type": "card", "shape": "rectangle", "padding": 12,
    "children": [
      { "type": "vstack", "gap": 6, "children": [
        { "type": "hstack", "justify": "space-between", "children": [
          { "type": "text", "value": "{content.name}", "style": "heading" },
          { "type": "badge", "value": "{content.surface}", "tone": "muted" }
        ]},
        { "type": "markdown", "value": "{content.description}" },
        { "type": "if",
          "when": "content.reads.length > 0",
          "then": { "type": "kv-list",
            "items": [{ "key": "reads", "value": "{content.reads | join:', '}" }] } }
      ]}
    ]
  }
}
```

A pack author writes one of these per kind. The engine renders it identically across all themes, all views, all disclosure levels.

## Reactivity and events — also declarative

Two concerns commonly assumed to need code, and why they do not.

### Reactivity

The renderer JSON is a *template*. The interpreter re-applies the template when content changes. The template author does not write Solid signals or React hooks. They write `"{content.label}"` and the engine handles change detection. The pattern is identical to how a Solid component declares JSX over reactive signals — the renderer JSON is the JSX equivalent.

### Events

Renderers dispatch events as strings, not functions:

```json
{ "type": "card", "onClick": "FOCUS_NODE" }
```

The engine receives a `FOCUS_NODE` event with the node's id as payload and dispatches it into the app's statechart (see [doc02.12](12-app-shell-statechart.md)). This is exactly the pattern RTP transitions already use (`"actions": ["Collection.create"]` are strings, not function references). The pattern generalizes from statecharts to renderers: strings everywhere, code only at the engine.

## Custom primitives — the escape hatch

The built-in vocabulary covers the common case. Specialized packs — live charts, interactive code editors, embedded sub-canvases — graduate to custom primitives.

A pack registers a custom primitive alongside its other contributions:

```ts
export const myPack: Pack = {
  id: 'myco.live-chart',
  customPrimitives: {
    'sparkline': SparklineComponent,
    'pulse-graph': PulseGraphComponent,
  },
  // ... nodeKinds, edgeKinds, views, ...
};
```

Renderer JSON references custom primitives the same way it references built-ins:

```json
{ "type": "myco.live-chart/sparkline", "points": "{content.series}" }
```

The interpreter looks up the primitive by name in a merged registry (built-ins + custom). The renderer JSON does not know whether a primitive is built-in or custom. **The unit of code becomes the primitive, not the renderer.** Most packs ship zero custom primitives. A specialized pack ships a handful.

## Fallback rendering

Luminous renders every node, even when the node's kind is unregistered or when the pack does not supply a renderer for the active disclosure level.

| Situation | Behaviour |
|---|---|
| Kind known, renderer for current disclosure level registered | Use it |
| Kind known, renderer for current level missing | Fall back along `DISCLOSURE_ORDER` until a registered level is found |
| Kind known, no renderer registered at any level | Generate a default renderer JSON from the kind's content schema: a `card` with a `text` heading from the first string field and a `kv-list` of remaining fields |
| Kind unknown (the graph references a kind no registered pack declares) | Use the default-generated renderer over the literal content object |

The fallback is legible and ugly. It guarantees that a graph file from an unknown source still produces a useful picture, and that adding a pack to make it pretty is an opt-in upgrade rather than a precondition.

The same fallback applies to edge kinds: missing edge renderers render as a thin line with the edge's `content.label` if present.

## Where the engine lives

The renderer engine — vocabulary, interpreter, and fallback generator — belongs to `@luminous/core`. Packs depend on `@luminous/core` to declare kinds and renderer JSON. Cactus depends on `@luminous/core` only for the result of interpretation (a Solid component to mount at a position). The boundaries match the contracts in [doc02.11](11-pdr-property-graph-architecture.md):

```
@luminous/core
├── Pack registry and contract (doc02.14)
├── Renderer engine (this doc)
│   ├── Built-in primitive vocabulary
│   └── Interpreter + fallback generator
└── Projection + identity (doc02.17)

packs
├── pack.json (kinds, views, layers, renderer JSON)
└── [optional] customPrimitives.tsx

cactus
└── Viewport + node mounting — receives interpreted components, never inspects them
```

The asymmetry — pack authors write data, Luminous interprets data, cactus paints generic geometry — is the contract that makes a pack author's job small and Luminous's job stable.
