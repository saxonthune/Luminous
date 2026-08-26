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
assigned. Capitalized terms — Node, Subnode, Edge, Node Type, Edge Type, Tab —
name Merino's constructs (doc01.10.01).

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
  shall visibly distinguish selected Nodes and their incident Edges while
  leaving other Edges fully visible.
- **C7.** When the user drags a selected Node, the system shall move every
  selected Node by the same distance.

## Nodes

A Node is the unit the user places and types. A Subnode is a Node the user hangs
off another to carry more detail; it is joined to its parent by a dotted Edge.
Differentiation (doc01.10.01) has no control of its own — it is the practice of
adding Subnodes, and shows only as the dotted Edges they hang on.

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
| Node | double left click | Edit the Node's name and contents | N3 |
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
| Edge | right click | Context menu: Type ▸, Delete | E4, E5 |
| Type ▸ (Edge context menu) | hover | Open the Edge Type submenu (Types + New type…) | E4, T5 |
| Edge Type (submenu) | left click | Set the Edge's Type | E4 |
| Delete (context menu) | left click | Remove the Node (with its Subnodes and Edges) or the Edge | N7, E5 |
| Manage types control | left click | Open the Manage types panel | T7 |
