---
title: Qt Graphics View
summary: Qt's Graphics View Framework — the scene/view/item split, item hierarchy, three coordinate systems, the BSP spatial index, and the interaction the framework ships versus what the host adds
tags: [cactus, prior-art, qt, scene-graph, desktop-library]
deps: [doc01.06.01.01]
---

# Qt Graphics View

## What it is

The Graphics View Framework is the desktop scene-graph canvas that ships with
Qt, the C++ application framework; it is reachable from Python through the
PySide and PyQt bindings. Qt is dual-licensed under the LGPL and a commercial
license. Graphics View was introduced in Qt 4.2, replacing the earlier QCanvas
class, and has been maintained across every release since. It has no
node-and-edge semantics of its own — it is the hardened engine that desktop
node editors are built on top of, including the C++ library QtNodes
(nodeeditor) and the Python library NodeGraphQt.

## Mental model

- A **scene** (`QGraphicsScene`) is the container for items. It owns the item
  set, propagates events to the item at a position, tracks item state such as
  selection and focus, and can render itself without a view for printing. The
  scene holds no widget of its own.
- A **view** (`QGraphicsView`) is a widget that visualizes the contents of a
  scene through a scrolling viewport. Several views can observe one scene at
  once, each with its own transformation, so the same items appear at
  different zoom levels or rotations in different windows.
- An **item** (`QGraphicsItem`) is the unit on the scene. It is the base class
  for all graphical objects and handles mouse events, keyboard input,
  drag-and-drop, and collision detection. Qt ships item subclasses for common
  shapes (rectangle, ellipse, line, path, pixmap, text).
- Items form a **parent/child hierarchy**. A parent propagates both its
  position and its transformation to its children, so a child moves and
  transforms with its parent. A child's position is expressed in the parent's
  coordinates, while the child's own drawing functions still operate in the
  child's local coordinates.
- Three **coordinate systems** operate at once: item coordinates, local to
  each item and centered on its origin; scene coordinates, the base system for
  top-level items; and view coordinates, relative to the viewport widget and
  unaffected by scene transformations. Mapping functions convert between them —
  `mapToScene` / `mapFromScene`, `mapToParent` / `mapFromParent`, and
  `mapToItem` / `mapFromItem` on items, and `mapToScene` / `mapFromScene` on
  the view.
- The scene indexes items in a **BSP tree** (binary space partitioning) to
  discover the items at a point or in a region quickly, so a scene can hold a
  large number of items and stay interactive.
- **Interaction flags** on an item turn behavior on per item: `ItemIsMovable`
  lets the user move the item with the mouse, `ItemIsSelectable` lets it be
  selected, and `ItemIsFocusable` lets it take keyboard focus. Related flags
  govern clipping (`ItemClipsToShape`, `ItemClipsChildrenToShape`), transform
  inheritance (`ItemIgnoresTransformations`), stacking (`ItemStacksBehindParent`),
  and change notifications (`ItemSendsGeometryChanges`).
- **Event propagation** runs through the scene: the view translates an input
  event to scene coordinates, the scene finds the item at that position and
  passes the event to it, and each item's handler receives coordinates already
  in its own item space.
- A widget-based control can live on the scene as an **embedded widget**
  through `QGraphicsProxyWidget`, which places an ordinary Qt widget as an item
  and preserves its cursor, tooltip, focus behavior, and pop-ups.
- A **`QGraphicsItemGroup`** is the framework's built-in grouping item. It is
  itself an item that holds member items as children; adding a member keeps
  the member's existing position and transformation rather than resetting it,
  and moving or transforming the group moves the members with it.

## Capabilities

The framework owns the canvas mechanics; the host application owns what the
scene means.

The framework ships: item selection and focus tracking, interactive item
dragging (via `ItemIsMovable`), affine transforms on items and on the view
(the same set `QPainter` supports, so zoom and rotation are view transforms),
collision and hit testing between item shapes, item discovery by point or
region through the BSP index, rubber-band selection in the view, an arbitrary
selection area on the scene, embedded widgets, and rendering of the scene or
view to any paint device for printing or export.

The host implements: the meaning of items — what a node is, what an edge is —
along with any edge or connection object (the framework has no edge type),
connection gestures, and any layout, since the framework positions nothing on
its own. Persistence, context menus, and the visual design of each item are
likewise the host's code.

So the user can select, drag, rubber-band select, and zoom out of the box,
while everything those gestures represent — nodes, links between them, and
where anything is placed — is defined by the application built on the
framework.

## Sources

Official Qt documentation at doc.qt.io, consulted 2026-07-14 against Qt 6
(current published version 6.11.1): the Graphics View Framework overview
(`qt-6/graphicsview.html`) and the `QGraphicsItem` class reference
(`qt-6/qgraphicsitem.html`) for the flag names, the parent/child rules, and
the coordinate mapping functions. Introduction in Qt 4.2 confirmed from the
archived Qt 4.x framework overview. Exact flag lists, class signatures, and
version details live behind those links and change between releases.
