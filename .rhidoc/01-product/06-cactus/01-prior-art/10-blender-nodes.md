---
title: Blender Nodes
summary: Blender's node editor mental model — node trees, typed color-coded sockets, links, and the two organization constructs side by side, frames (derived envelope) and node groups (owning subgraph)
tags: [cactus, prior-art, blender, node-editor, product]
deps: [doc01.06.01.01]
---

# Blender Nodes

## What it is

Blender's node editor is a product-level construct — an editor a Blender user
operates inside the free, open-source (GPL) Blender application, not a library a
developer embeds. One editor serves several node-tree domains: a Shader Editor
for materials, worlds, and lights; a Geometry Node Editor for procedural
geometry; and a Compositor for post-render image compositing (a Texture node
context also exists). The interface, controls, and organization constructs are
shared across these contexts; only the available node catalog differs by tree
type.

## Mental model

- A **node tree** is the graph a given editor context edits — a shader tree, a
  geometry tree, or a compositing tree. Each context edits one tree type; the
  editor is the same tool switched between them.
- A **node** performs one operation. It has a header and a body; its body
  carries value fields and the sockets that connect it to other nodes.
- A **socket** is a connection point, drawn as a small colored circle on the
  node. **Input** sockets sit on the lower-left; **output** sockets sit on the
  upper-right. A socket's color encodes its **data type** (float, vector,
  integer, color, rotation, matrix, and data-block types such as object,
  material, image, and others). Some type pairs convert implicitly when linked
  (for example float and color).
- A **multi-input socket** accepts more than one incoming link. It is drawn as
  an elongated (ellipsis) shape rather than a circle to mark that behavior.
- A **link** (informally, a *noodle*) is a connection dragged from one socket to
  another, carrying an output's value into an input. The user draws one by
  dragging from a socket and releasing on another.
- A **reroute node** is a small node that contributes nothing to the tree's
  result; it exists only to reposition links, letting the user route a noodle
  cleanly around the layout.
- **Muting** a node removes its contribution to the tree and makes links pass
  through it unchanged; muted links are drawn red. Individual links can also be
  muted. Muting the input side of a reroute node also mutes its output side.

The editor ships two organization constructs side by side, one derived and one
owning:

- A **frame** is a background node that other nodes are attached to — a labeled
  rectangle grouping members visually without changing the tree's result. Nodes
  attach by being dragged onto the frame, or by selecting the nodes then the
  frame and pressing Ctrl-P; a node detaches with Alt-P, or by pressing F while
  dragging it out. A frame has an optional **Shrink** setting: when on, the
  frame's bounds fit tightly around its members and resize automatically as they
  move, and its edge is no longer draggable; when off, the frame keeps a fixed
  size the user resizes by hand.
- A **node group** is a subgraph collapsed into a single node. Its internal
  **Group Input** and **Group Output** nodes expose the group's socket interface
  — the sockets that appear on the group node from outside. The user makes a
  group from a selection with Ctrl-G and dissolves one back into loose nodes with
  Alt-G. A group is **instanced**: one group definition can be placed in many
  spots in the same tree or another tree, and editing the definition updates
  every instance. The user **enters** a group with Tab to edit its interior and
  **exits** with Tab again, returning to the parent tree.

## Capabilities

The editor gives the user, out of the box:

- **Wiring** — drag between sockets to create links; typed color-coded sockets
  with implicit conversion between compatible types; multi-input sockets for
  fan-in; Ctrl-drag from an output to reposition existing outgoing links; Alt to
  swap a link into an occupied socket.
- **Framing** — group nodes visually into labeled frames whose bounds either
  shrink-fit to members or stay fixed for manual resizing, with keyboard
  attach and detach.
- **Grouping** — collapse a selection into a reusable, instanced node group with
  an exposed socket interface, entered and exited with Tab, ungrouped with Alt-G.
- **Searching and adding** — add nodes from a searchable menu (Shift-A),
  including placing existing groups from a Groups submenu, and link or append
  groups from other blend-files.
- **Keyboard-driven organization** — reroute nodes to tidy link paths, and
  muting of nodes and individual links to disable contributions while keeping
  the wiring in place.

## Sources

Official Blender manual at docs.blender.org/manual (en/latest), consulted
2026-07-14, documenting Blender 5.1. The relevant pages are under
interface/controls/nodes — principally the node parts, editing, groups, and the
layout/frame node type pages — with the shader, geometry-nodes, and compositing
sections as the tree-type contexts. Direct page fetches were blocked; facts here
were verified from those pages' indexed text, and volatile detail (exact
shortcuts, the full socket-type and node catalogs) lives behind those links and
changes between versions.
