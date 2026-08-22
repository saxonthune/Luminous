---
title: Konva
summary: Konva's mental model — a Stage/Layer/Group/Shape scene graph with no node/edge semantics — and the split between what the library ships (transform, hit detection, tween) and what the host must build
tags: [cactus, prior-art, konva, scene-graph, web-library]
deps: [doc01.06.01.01]
---

# Konva

## What it is

Konva (`konva`, v10) is an MIT-licensed HTML5 Canvas JavaScript
framework that extends the 2D drawing context with interactivity —
event handling, drag, animation, filtering, and caching. It was created
in 2014, originally forked from KineticJS, and ships built-in
TypeScript types. Konva describes itself as the most popular
open-source 2D Canvas framework; named users include Meta, Microsoft,
Labelbox, Zazzle, and Polotno. Official framework bindings wrap the same
core package: `react-konva`, `vue-konva`, `svelte-konva`, and
`ng2-konva`. Konva has no notion of a node graph — it is a scene graph
for drawing and manipulating shapes.

## Mental model

- A **Stage** is the root container. It holds one or more Layers and owns
  the DOM element the canvas mounts into.
- A **Layer** is a rendering surface backed by two canvas elements: a
  scene canvas that the user sees, and a hidden **hit graph** canvas used
  for event detection. A Stage can hold several Layers, each redrawn
  independently.
- A **Shape** is a drawn primitive — the library ships rectangles,
  circles, text, images, lines, paths, stars, polygons, and more. A shape
  carries visual attributes (fill, stroke, shadow, opacity) and its own
  transform. Custom shapes define their own draw function.
- A **Group** is a container that holds shapes or other groups. Its
  children transform with it: moving, rotating, or scaling a Group moves,
  rotates, or scales every child as one unit, because a child's coordinates
  are relative to the Group's transform. A Group is the owning form — a
  child belongs to the Group it was added to. Groups nest to any depth,
  forming a node tree that mirrors the DOM's shape.
- All of these — Stage, Layer, Group, Shape — are **Nodes**: they share
  position, scale, rotation, opacity, and visibility, and they compose into
  one tree.
- **Hit detection** works by color keying. Each shape is drawn to the
  hidden hit canvas in a unique solid color; to learn what sits under the
  pointer, Konva reads the pixel color at that point on the hit canvas and
  maps the color back to its shape. A shape may override this with a custom
  hit function or, for images, generate a hit region from its cached pixels
  so transparent areas do not register.
- A **Transformer** is a special Group that attaches to one or more nodes
  and draws interactive resize handles and a rotation control around them.
  Resizing changes a node's `scaleX`/`scaleY` rather than its width and
  height. The host chooses which nodes the Transformer is attached to.
- **Animation** comes in two forms: `Konva.Tween` transitions numeric
  attributes (position, rotation, size, opacity, scale) of any node over a
  duration with an easing function, and `Konva.Animation` runs a per-frame
  callback for open-ended motion.
- **Serialization** is `node.toJSON()` and `Node.create(json, container)`.
  The JSON captures node structure and attributes only. Functions and event
  handlers are not serialized — the host reattaches listeners after loading
  — and external resources such as images need their own handling.

## Capabilities

The library owns drawing and direct manipulation of shapes; the host owns
any structure or meaning laid over them.

The library ships: the shape primitives, the Stage/Layer/Group/Shape scene
graph, per-node drag, the Transformer's resize and rotate handles,
color-keyed hit detection with a DOM-like event model (click, hover, and
the rest), image filters, node caching for performance, tween and
frame-based animation, layered redraw, node lookup by id or name, and JSON
serialization of the tree.

The host implements: any notion of a **node** as a domain object, any
**edge** or **connection** between shapes, **layout** — Konva places
nothing automatically — **selection semantics** beyond the raw events
(what a selection means, multi-select rules, marquee), snapping, undo and
redo, persistence of anything beyond shape attributes, and the meaning of
every gesture. Konva reports that a shape was dragged or clicked; what that
should do is the host's code.

## Sources

Official docs at konvajs.org, consulted 2026-07-14 at `konva` 10.3.0 —
principally: docs/overview, docs/about, docs/groups_and_layers/Groups,
docs/events/Custom_Hit_Region (hit graph and hit functions),
docs/select_and_transform (Transformer basics), docs/tweens (Tween and
easing), and docs/data_and_serialization/Simple_Load (toJSON /
Node.create). The version and MIT license are from the `konva` npm
package. API signatures and the full option lists live behind these links
and change over time.
