---
title: Requirements
summary: Merino's capabilities as a controlled, EARS-like list of shall-statements, prefixed per section, plus an agent-capabilities section for MCP and the input-command bindings table
tags: [merino, ui, requirements, mcp]
deps: [doc01.10.01]
---

# Requirements

Merino's capabilities, written as a controlled list of EARS-style requirements
(Easy Approach to Requirements Syntax). Each requirement has a stable identifier
prefixed by its section — **C** for Canvas, **N** for Nodes, **E** for Edges,
**T** for Types, **M** for agent capabilities. Identifiers are never reused once
assigned. Capitalized terms — Node, Subnode, Edge, Node Type, Edge Type, Tab,
Container, Port — name Merino's constructs (doc01.10.01).

## Canvas

Merino is one Document with two Tabs. Both Tabs are the same node-and-edge
canvas with the same authoring vocabulary; they differ only in what the user
draws on them.

- **C1.** The system shall present two Tabs, Requirements and Deployments, and
  shall allow the user to switch between them.
- **C2.** The system shall draw each Tab as the same node-and-edge canvas with
  the same authoring vocabulary.
- **C3.** The system shall store which Tab each Node and Edge belongs to in the
  Document.
- **C4.** The system shall allow the user to add a Node from the canvas
  background.
- **C5.** The system shall allow the user to pan and zoom the canvas.
- **C6.** The system shall allow the user to select one Node by clicking it and
  a collection of Nodes by dragging a marquee across the canvas background. It
  shall select Nodes where the marquee is drawn under the current camera, and
  visibly distinguish selected Nodes and their incident Edges while leaving
  other Edges fully visible.
- **C7.** When the user drags a selected Node, the system shall move every
  selected Node by the same distance without moving a selected contained child
  a second time when its selected Container also moves.
- **C8.** The system shall preserve each open Document's viewport through
  Document updates, drag completion, and development reloads without writing
  the viewport to the Document.
- **C9.** The system shall draw a grid across the canvas background to make the
  workspace visible behind its Nodes and Edges.

## Nodes

A Node is the unit the user places and types. A Subnode is a Node the user hangs
off another to carry more detail; it is joined to its parent by a dotted Edge.
Differentiation (doc01.10.01) has no control of its own — it is the practice of
adding Subnodes, and shows only as the dotted Edges they hang on.

A parent link is read three ways, decided by the parent's Node Type (T8). When
the parent's Type is a Container, the child sits inside the parent's box —
freely placed for a `container`, or stacked in an explicit order for a `list`.
When the parent is neither, the child hangs off it by the dotted Edge above. A
Container accepts a child of any Type — it never restricts which Types it holds.

- **N1.** The system shall allow the user to add a Node to the canvas.
- **N2.** The system shall allow the user to drag a Node.
- **N3.** The system shall allow the user to edit a Node's name and contents.
- **N4.** The system shall give each Node a Node Type, and shall draw the Node so
  its Type is legible — in its Type's Color.
- **N5.** When the user right-clicks a Node, the system shall open a context menu
  offering Copy, Paste, Add subnode, a Type submenu, and Delete.
- **N6.** When the user adds a Subnode, the system shall create a child Node
  joined to its parent by a dotted Edge.
- **N7.** When the user deletes a Node, the system shall remove the Node, its
  Subnodes, and every Edge that touches a removed Node.
- **N8.** The Node context menu's Type submenu shall list the Document's Node
  Types and an option to create a new Type; selecting a Type retypes the Node.
- **N9.** The system shall allow the user to copy selected Nodes and paste them
  through the context menu or the platform primary copy and paste shortcuts. A
  paste shall create fresh Nodes, preserve copied parent links and Edges whose
  endpoints were copied, and select the pasted Nodes.
- **N10.** The system shall allow a Node of any Type to be a child of a Container
  Node, without restricting which Types a Container accepts. A contained child
  shares its Container's Tab.
- **N11.** The system shall draw a child of a Container Node inside the
  Container's box, and a child of a non-Container parent as a Subnode joined by a
  dotted Edge.
- **N12.** When the user drags a single Node onto a Container Node, the system
  shall make it a child of that Container; when the user drags it onto the canvas
  background, the system shall detach it to the top level.
- **N13.** When the user drags a Container Node, the system shall move its child
  Nodes with it.
- **N14.** While the user drags a Node, the system shall display a gesture-scoped
  indicator describing what releasing it would do — filing it into a Container,
  detaching it to the top level, moving it in place, or, over a list Container,
  the position it would take in that list.
- **N15.** The system shall draw a list Container's children as a vertical stack
  in an explicit order, and shall size the Container to fit the stacked children
  as their sizes change.
- **N16.** When the user drags a Node within a list Container, the system shall
  let the user reorder it, opening a gap at the slot under the pointer while the
  drag is in progress and committing the new order on release; when the user
  drags a Node onto a list Container, the system shall file it at that slot.
- **N17.** When a Node's details editor has focus, clicking outside it or
  pressing Escape shall blur the editor.
- **N18.** The system shall allow the user to resize a Container, keeping its
  box at least large enough for its children and their padding.
- **N19.** When a Container's child extent shrinks, the system shall keep the
  Container's current size until the user resizes it.
- **N20.** The system shall label a freeform Container "Freeform Container" and
  a list Container "List Container" inside its box, left-aligned above its
  children.
- **N21.** The system shall offer a Tidy control beside a freeform Container's
  label that pushes the Container's overlapping children apart until no two
  overlap, then grows the Container to fit them. A list Container has no Tidy
  control — it orders its children itself.

## Edges

An Edge connects two Nodes and carries a user-managed Edge Type. The dotted Edge
of a Subnode (N6) is drawn by the system from the parent link, not authored as a
typed Edge.

- **E1.** The system shall draw an indicator on a Node from which the user starts
  an Edge.
- **E2.** When the user drags from a Node's indicator to another Node and
  releases, the system shall create an Edge between them.
- **E3.** The system shall give each Edge an Edge Type, and shall draw the Edge in
  its Type's style — Color, dash, and arrowhead.
- **E4.** The system shall allow the user to change an Edge's Type.
- **E5.** The system shall allow the user to delete an Edge.
- **E6.** When the user holds the platform primary modifier while releasing an
  in-progress Edge, the system shall create a new Node of the source Node's
  Type at the pointer and connect the Edge to it.
- **E7.** While an Edge is in progress, the system shall display a gesture-scoped
  indicator describing its current outcome, including the new-Node outcome when
  the platform primary modifier is held.
- **E8.** When an Edge crosses a Container's box, the system shall route it
  through boundary Ports on that box — one where it leaves the source side, one
  where it enters the destination side — so the crossing is legible rather than
  cutting straight through the box.
- **E9.** The system shall give each Container two boundary Ports, an entry and an
  exit, shared by every Edge crossing that Container, and shall let the user drag
  each Port to any side of the box. Absent a placement, the entry sits on the
  left and the exit on the right.
- **E10.** When an Edge targets a Container, the system shall route it through
  that Container's entry Port; when an Edge starts at a Container, the system
  shall route it through that Container's exit Port.

## Types

Node Types and Edge Types are user-managed sets kept in the Document. The common
act — picking or coining a Type while drawing — is a context-menu gesture, not a
modal; only editing the set as a whole opens a panel.

- **T1.** The system shall keep a registry of Node Types in the Document, seeded
  with a starter set: event, requirement, resource, and deployment.
- **T2.** The system shall allow the user to add a Node Type, change a Node Type's
  name and Color, and remove a Node Type.
- **T3.** The system shall keep a registry of Edge Types in the Document.
- **T4.** The system shall allow the user to add an Edge Type, set its style
  (Color, dash, arrowhead, and whether it is directed), change it, and remove it.
- **T5.** A Type submenu (N8, and the Edge context menu's Type submenu) shall
  offer an option to create a new Type and apply it to the Node or Edge in the
  same step.
- **T6.** When the user removes a Type that Nodes or Edges still use, the system
  shall require reassigning those Nodes or Edges to another Type first.
- **T7.** The system shall offer a Manage types panel listing the Document's Node
  Types and Edge Types, each editable, each with a control to remove it.
- **T8.** The system shall let the user set a Node Type's layout in the Manage
  types panel — to hold nothing (a leaf), a `container` (children freely placed),
  or a `list` (children stacked in order) — and clear it back to a leaf. A Node's
  Type being a Container is what makes the Node hold its children inside its box
  (N11), and its being a list is what orders them (N15).

## Agent capabilities (MCP)

Merino exposes an MCP tool group, the sibling of the other apps' groups. This
section states what an agent can do through it, not the individual verbs.

- **M1.** The system shall allow an agent to create a Merino Document and to read
  its Nodes, Edges, and Type registries.
- **M2.** The system shall allow an agent to add, rename, retype, reparent, and
  remove Nodes and Subnodes.
- **M3.** The system shall allow an agent to connect and disconnect Nodes with
  typed Edges, and to change an Edge's Type.
- **M4.** The system shall allow an agent to manage the Node Type and Edge Type
  registries — adding, changing, and removing Types.
- **M5.** The system shall allow an agent to validate a Document, reporting
  invariant breaks (an Edge naming a missing Node, a Node or Edge whose Type is
  not in the registry, duplicate identifiers) and structural smells that do not
  block a write.
- **M6.** The system shall allow an agent to apply a batch of mutations
  atomically, so a reader never sees a half-applied change.
- **M7.** The system shall route every agent mutation through the same write path
  the browser uses, so an agent's edits and the user's edits reach the Document
  the same way.
- **M8.** The system shall let an agent search Nodes and inspect a Node's
  descendants, incident Edges, or bounded Edge neighborhood without loading the
  complete Document.
- **M9.** When an agent batch fails, the system shall report the failing action's
  position and reason. A batch shall let a later action refer to an earlier
  action's explicit id by a local reference name.
- **M10.** The system shall store optional agent guidance on the Document, a
  Node Type, and an individual Node, and shall return it to an agent reading or
  editing the Document.
- **M11.** The system shall let an agent append a Node to a Container by intent,
  without supplying canvas coordinates; a list Container shall assign its next
  order and a freeform Container shall derive a local child position.

## Input-command bindings

An **input** is an ordered pair — a target and an interaction method (left click,
right click, double click, drag, a key). Each row binds one input to the command
it performs and the requirement it serves. Rows with `—` in the Req column are
baseline navigation with no assigned requirement yet.

| Target | Interaction | Action | Req |
|---|---|---|---|
| Tab (Requirements / Deployments) | left click | Switch to that Tab | C1 |
| Canvas background | right click | Context menu: Add Node | C4, N1 |
| Canvas or Node | middle click + drag | Pan the camera | C5 |
| Canvas background | scroll wheel | Zoom the camera | C5 |
| Canvas background | left click + drag | Marquee-select intersecting Nodes | C6 |
| Node | left click | Select that Node | C6 |
| Node | left click + drag | Move the Node, or every selected Node when it belongs to the selection | N2, C7 |
| Container Node | left click + drag | Move the Container and its children together | N13, N2 |
| Node | left click + drag onto a Container Node | Make the Node a child of the Container | N12 |
| Node | left click + drag onto a list Container | File the Node into the list at the pointer's slot | N16 |
| Node (child of a list Container) | left click + drag within its list | Reorder the Node in the list | N16 |
| Node | left click + drag onto the canvas background | Detach the Node to the top level | N12 |
| Node | double left click | Edit the Node's name and contents | N3 |
| Node details editor | click outside, or Escape | Blur the details editor | N17 |
| Container resize grip | left click + drag | Resize the Container without clipping its children | N18 |
| Tidy control (freeform Container label) | left click | Push the Container's overlapping children apart | N21 |
| Node | right click | Context menu: Copy, Paste, Add subnode, Type ▸, Delete | N5, N9 |
| Canvas background | right click | Context menu: Paste | N9 |
| Canvas | Ctrl/Cmd+C | Copy selected Nodes | N9 |
| Canvas | Ctrl/Cmd+V | Paste copied Nodes | N9 |
| Add subnode (context menu) | left click | Create a Subnode joined by a dotted Edge | N6 |
| Type ▸ (Node context menu) | hover | Open the Node Type submenu (Types + New type…) | N8, T5 |
| Node Type (submenu) | left click | Set the Node's Type | N8 |
| New type… (Node Type submenu) | left click | Create a Node Type and apply it to the Node | T2, T5 |
| Connection indicator | left click + drag | Draw a preview Edge; on release over a Node, create an Edge to it | E1, E2, E7 |
| In-progress Edge | hold Ctrl/Cmd and release | Create a same-Type Node at the pointer and connect the Edge | E6, E7 |
| Container boundary Port | left click + drag | Move the Port to another side or position on the box | E9 |
| Edge | right click | Context menu: Type ▸, Delete | E4, E5 |
| Type ▸ (Edge context menu) | hover | Open the Edge Type submenu (Types + New type…) | E4, T5 |
| Edge Type (submenu) | left click | Set the Edge's Type | E4 |
| Delete (context menu) | left click | Remove the Node (with its Subnodes and Edges) or the Edge | N7, E5 |
| Manage types control | left click | Open the Manage types panel | T7 |
| Node Type layout select (Manage types) | change | Set the Node Type's layout — nothing, a container, or a list | T8 |
