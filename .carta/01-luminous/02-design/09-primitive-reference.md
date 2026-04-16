---
title: Node primitive reference
status: draft
summary: Enumerated reference for node primitives (drag-bar, title, markdown, container) with bind semantics and examples
tags: [primitives, schemas, reference, node]
deps: []
---

# Node primitive reference

A node's visual appearance is defined by its schema's `primitives` array — an ordered list of small, composable renderers stacked top-to-bottom inside the node. Primitives are registered in `packages/client-next/src/primitives/index.ts`; there is currently no plugin mechanism for third-party primitives. Adding a new primitive means writing a renderer component and adding one registry entry.

## The PrimitiveDef shape

```ts
interface PrimitiveDef {
  type: string    // dispatch key — must match a registered renderer
  bind?: string   // content field this primitive reads/writes
  name?: string   // container primitives only — slot name
}
```

Only `type` is required. `bind` names the key in the node's `content` object that the primitive renders. `name` is reserved for container primitives (future use: multi-slot containers).

## Registered primitives

### `drag-bar`

A non-interactive header strip that acts as the drag handle for the node. Shows the schema name on the left and the first 8 chars of the node id on the right.

- **bind**: none (structural)
- **content**: none
- **Renderer**: `DragBarRenderer`
- **Typical placement**: first in the primitives array

```json
{ "type": "drag-bar" }
```

### `title`

Single-line editable text input. Commits on blur or Enter. Any string field in `content` can back a title.

- **bind**: required — the content key to read/write
- **content**: `string`
- **Renderer**: `TitleRenderer`

```json
{ "type": "title", "bind": "name" }
```

### `markdown`

Multi-line markdown editor (lazy-loaded). Useful for descriptions, specs, notes.

- **bind**: required — the content key to read/write
- **content**: `string` (markdown source)
- **Renderer**: `MarkdownRenderer`

```json
{ "type": "markdown", "bind": "description" }
```

### `container`

A slot that renders the node's children inline. Required on any schema whose nodes are intended to visually contain their descendants (as opposed to only being a parent for layout/coordinate purposes). Shows an optional label strip derived from `bind` (if set) or `name`.

- **bind**: optional — if set, reads a label string from content
- **content**: optional `string` label
- **Renderer**: `ContainerRenderer`
- **Typical placement**: last in the primitives array

```json
{ "type": "container", "name": "children" }
```

## Container acceptance constraint

`NodeSchema.accepts?: string[]` narrows which child schemaNames may be nested. Absent or empty means any child is allowed. This is a soft UI hint rather than a hard runtime guard.

## Minimal valid schema

```json
{
  "name": "note",
  "kind": "node",
  "label": "Note",
  "primitives": [
    { "type": "drag-bar" },
    { "type": "title", "bind": "title" },
    { "type": "markdown", "bind": "body" }
  ]
}
```

A node using this schema would carry `content: { title: "...", body: "..." }`.

## What's not yet supported

The current registry is intentionally minimal. Primitives that have been discussed but not implemented include `badge`, `subtitle`, `image`, and typed numeric/date fields. If a pipeline needs a field that can't be expressed with the four existing primitives, either bind it through `markdown` (loses structure) or treat that as a signal to add a new primitive — see the registry in `primitives/index.ts` for the one-line change it requires, plus a renderer component.

## See also

- `doc01.02.06.02` — ADR for the schema discriminant (node vs edge)
- `doc01.02.08` — Edge schemas (`acceptsSource`, `acceptsTarget`, `layoutRole`)
- `doc01.02.05.02` — Cactus API contract
