---
title: Tldraw
summary: The tldraw SDK's mental model — an Editor over a reactive record Store, shapes backed by ShapeUtil, tools as a state chart, bindings, the camera, and the two grouping forms (derived-bounds groups and owning frames)
tags: [cactus, prior-art, tldraw, whiteboard, web-library]
deps: [doc01.06.01.01]
---

# Tldraw

## What it is

The tldraw SDK (`tldraw`, v5.2.x) is a React library for building infinite-canvas
whiteboard apps — the embeddable engine behind the tldraw.com app, documented here
as the library rather than the app. It ships a `<Tldraw>` component with default
shapes, tools, and UI, and a lower-level `<TldrawEditor>` (`@tldraw/editor`) that
supplies none of these. The license is proprietary: the source and packages are
free for development, but production use needs a license key. A hobby license (for
non-commercial projects) requires a "made with tldraw" watermark on the canvas; a
commercial license removes it. A free 100-day trial license is available, and the
SDK will not run in production without a valid key. tldraw is a widely adopted
whiteboard SDK and is used by its own tldraw.com product.

## Mental model

- The **Editor** is the main way of controlling the canvas — "almost everything is
  available through it." It creates and deletes shapes, reads sorted shape arrays,
  manages selection, and drives the camera. It is reached through the `onMount`
  callback or the `useEditor` hook.
- The **Store** is the reactive database holding all records. Shapes, bindings,
  pages, and assets are all records in the store. State is built on **Signals**,
  so reader methods (for example `getSelectedShapeIds`, `getCurrentPageShapes`)
  return values that update automatically; components use `track` or `useValue`
  to react.
- A **Shape** is something that can exist on a page — an arrow, an image, text. It
  is a JSON record with base properties (position, rotation, opacity, `parentId`)
  and a `type` field, plus a `props` object holding the shape-specific data.
- A **ShapeUtil** is a class that defines a shape type's complete behavior:
  rendering (`component`), geometry for hit detection (`getGeometry`), default
  data (`getDefaultProps`), the selection outline (`getIndicatorPath`), and
  interaction responses. A custom shape is a registered `type`/`props` pair plus
  a `ShapeUtil` subclass.
- A **tool** is a top-level state in a state chart. The first level of states are
  the tools (select, hand, draw, arrow, and custom ones). A tool extends the
  **StateNode** class and overrides event methods such as `onPointerDown`; a tool
  can contain child states for multi-step interactions. The active tool is set
  with `editor.setCurrentTool()`.
- A **binding** is a record storing a persistent relationship between two shapes.
  It carries an `id`, `type`, a `fromId` and `toId` naming the two shapes, and a
  `props` object. A **BindingUtil** responds to the binding's lifecycle through
  hooks — `onAfterCreate`, `onAfterChangeFromShape`, `onAfterChangeToShape`,
  `onBeforeDelete`, isolation hooks, and others. Arrow binding is the built-in
  example: the arrow is always the "from" shape and the shape it points to is the
  "to" shape, and the util updates the arrow's position when the target moves.
- The **camera** controls viewport position and zoom (x, y, and a zoom z). Shape
  positions live in page space; the editor converts between page space and screen
  space, and composes parent transforms for nested and rotated shapes.
- Grouping has two distinct forms, both realized as shapes on a page:
  - A **group** is a logical container with no visual representation. Its geometry
    is the union of its children's geometries, so its bounds are **derived from
    its members** and update automatically as children change. It is created
    through the editor API, preserves each child's page position while changing
    `parentId` and local coordinates, and deletes itself when its last child is
    removed.
  - A **frame** is a visual container shape with a header, name, and optional
    border and background. It has explicit width and height that the user sets, so
    its bounds are **owned by the container**, not derived from its members. A
    frame clips its children to its bounds, and moving the frame moves the
    children, which are positioned relative to the frame's origin.

## Capabilities

The SDK ships the canvas and its interactions; the host app supplies shape meaning,
persistence, and app-level chrome.

The SDK ships: the reactive store and the Editor API, an infinite pannable and
zoomable canvas, a default set of shapes (including draw, text, arrow, frame) and
the group construct, the default tools (select, hand, draw, arrow), selection,
shape drag, resize and rotate, arrow binding that follows moved targets, pages,
assets, and — via `<Tldraw>` — a full default UI. The `@tldraw/editor` base ships
the canvas and store but leaves shapes, tools, and UI to the host.

The host implements: custom shape types (each a `ShapeUtil`), custom tools (each a
`StateNode`), custom binding types (each a `BindingUtil`), any domain rules about
what shapes and bindings mean, persistence and collaboration wiring, and app-level
UI beyond the default components. A valid license key is a host responsibility for
production.

So the user can draw, select, move, resize, rotate, connect with binding arrows,
group, frame, pan, and zoom out of the box; the host decides what any custom shape
or relationship represents and where the data is stored.

## Sources

Official docs at tldraw.dev, consulted 2026-07-14 at `tldraw` v5.2.x —
principally: docs/editor (the Editor, the Store, Signals, camera and
coordinates), sdk-features/shapes and sdk-features/default-shapes (shapes,
ShapeUtil, frames, groups), sdk-features/groups (group versus frame semantics),
docs/tools (tools as a state chart, StateNode), sdk-features/bindings (binding
records, BindingUtil, fromId/toId, arrow bindings), community/license and the
pricing page (license terms and watermark), and npmjs.com/package/tldraw for the
current version. API signatures, hook lists, and prices live behind those links
and change over time.
