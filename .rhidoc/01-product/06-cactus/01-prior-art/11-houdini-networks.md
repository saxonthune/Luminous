---
title: Houdini Networks
summary: Houdini's network editor mental model — contexts and nested networks, nodes with inputs, outputs, and flags, wires, and the organization ladder of network boxes, sticky notes, subnets, and digital assets
tags: [cactus, prior-art, houdini, node-editor, product]
deps: [doc01.06.01.01]
---

# Houdini Networks

## What it is

The Houdini network editor is a product-level entry: an editor a user operates
inside the SideFX Houdini application, not a library a developer embeds.
Houdini is commercial 3D software for procedural modeling, animation, effects,
and rendering, widely used in film and games. The network editor is the panel
where the user builds and wires the node graphs that drive the whole
application. This doc records the editor's vocabulary from the official Houdini
user guide; it does not cover the Python scripting layer (HOM) that mirrors it.

## Mental model

- A **node** is one operation. It has input and output connectors and a
  parameter interface. Nodes of the same type share behavior and differ by
  their parameters.
- A **network** is a collection of connected nodes. Every network belongs to a
  **context** (also called a network type), and each context supplies its own
  node types for its own kind of data. The user guide lists nine: Object
  (OBJ, scene objects), Geometry (SOP, surface operators), Dynamics (DOP,
  simulation), Copernicus (COP, image), Compositing (COP2, legacy 2D), Render
  (ROP), VOP (VEX shading, visual programming), Channel (CHOP, time-based
  channels), and Task (TOP, dependency work items).
- Networks nest: a node can contain a network inside it. The user enters a
  node to see its child network and steps back out to the parent, so the graph
  is a hierarchy the user navigates by drilling in and out.
- A **wire** connects one node's output connector to another node's input
  connector. The user draws a wire by dragging between connectors; wires carry
  the flow of data appropriate to the context.
- **Flags** are per-node toggles that mark state. Some are shared across
  contexts — **bypass** disables the node and passes its input through
  unchanged; **lock** freezes and caches a node's output. Others are
  context-specific: a Geometry (SOP) node carries **display**, **render**, and
  **template** flags among others. When zoomed far out, a **node ring** appears
  on hover to reach the flags and an info button.
- A **network box** is a rectangle drawn in the network that holds a set of
  nodes. The user creates it from a selection with Add ▸ Network box; moving
  the box moves the nodes inside it together. The box has a color chosen from a
  palette and an editable title on its top bar. Sizing is both ways: the user
  can drag the corners to size it manually, or run Layout ▸ Resize network
  boxes to fit to shrink it to its contents. A minus button on the top bar
  minimizes the box. Dragging nodes across the edge adds or removes them.
- A **sticky note** is a free text annotation placed in the network to explain
  a section. It is not tied to nodes. It has a background color and a text
  color from the palette, resizable corners, and a minimize button. Hiding its
  background and enlarging the text turns it into a big label.
- A **subnet** (subnetwork) encapsulates several nodes inside a single node,
  which the user guide describes as streamlining the network visually and
  conceptually. The user creates one by selecting nodes and choosing Collapse
  Selected into Subnet, then enters it by double-clicking, like opening a
  folder, and steps back out to the parent. Inside, connections to the outside
  arrive through input pseudo-nodes, and the display flag on an internal node
  sets the subnet's output.
- A **digital asset** (Houdini Digital Asset, HDA) is a subnet packaged into a
  reusable, parameterized node type. The user builds a user interface for the
  asset by promoting parameters from the contained nodes up onto the asset
  node, hiding the internal complexity behind those controls. Once defined, the
  type can be instanced many times, each instance varying by its parameters.
  The definition is saved in a library file (`.hda`, legacy `.otl`) that can
  hold several assets and can embed referenced files such as textures. Houdini
  supports two versioning systems for assets.

## Capabilities

At the product level, the editor gives the user these operations:

- **Navigate** the network hierarchy — enter a node to see its child network,
  step back out to the parent, and move across the nested contexts.
- **Wire** nodes by dragging between input and output connectors.
- **Flag** nodes to set display, render, bypass, template, lock, and other
  context-specific state, reachable directly or through the node ring.
- **Box and annotate** — group nodes in a colored, titled network box that
  moves them together and can be sized to fit or by hand and minimized; add
  sticky notes and big labels; set per-node color and shape; and attach a
  comment to a node and show it in the network.
- **Collapse** a selection into a subnet, a single node the user enters like a
  folder.
- **Package** a subnet into a digital asset — a reusable node type with a
  promoted-parameter interface, instanced many times and versioned in a
  library file.

## Sources

Official Houdini user guide at sidefx.com/docs/houdini, consulted 2026-07-14.
Houdini does not print a version on these pages; the current documented
release line at the date of consultation is Houdini 20.5. Pages consulted:
network/organize.html (network boxes, sticky notes, subnets, node comments and
colors), network/nodes.html (nodes, wires, flags, contexts, node ring),
network/flags.html (the nine network types and their per-context flags),
and assets/intro.html (digital assets — promoting parameters, instancing,
library files, versioning). Exact keyboard shortcuts, flag letters, and menu
paths live behind those links and change between releases.
