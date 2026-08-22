---
title: Unreal Blueprints
summary: The Blueprint Visual Scripting mental model — Blueprint classes and the Event Graph, nodes and the exec-versus-data pin system, the three subgraph forms, and the annotative comment box
tags: [cactus, prior-art, unreal, blueprints, node-editor, product]
deps: [doc01.06.01.01]
---

# Unreal Blueprints

## What it is

Blueprint Visual Scripting is the node-based gameplay scripting system inside
Unreal Editor — a product an author operates, not a library a developer
embeds. Epic's docs call it "a complete gameplay scripting system based on the
concept of using a node-based interface to create gameplay elements from within
Unreal Editor," an object-oriented class definition tool comparable to a
traditional scripting language. It is one editor mode within the larger Unreal
Engine (proprietary Epic Games EULA license), and among the most widely used
visual scripting environments in game development. This doc describes the
Blueprint editor's own vocabulary as documented for Unreal Engine 5.8.

## Mental model

- A **Blueprint Class** is the primary authored asset — "a recipe that uses
  components, variables, and visual scripting to define the properties and
  behaviors of an Actor" that the author places as instances in a level. A
  Blueprint holds **Components** (collision, mesh, movement), **Variables**,
  **Functions**, **Macros**, and one or more graphs.
- The **Event Graph** is the graph where gameplay logic lives. "All logic in
  the Event Graph is a response to something happening during gameplay" — player
  input, animation triggers, sounds.
- A **Node** is an object placed in a graph: an event, a function call, a flow
  control operation, or a variable get/set. Pins on the left of a node are
  inputs; pins on the right are outputs.
- The **pin system** has two kinds. An **execution pin** (**exec pin**) is a
  white triangle that controls order: "when an input execution pin is activated,
  the node is executed," and on completion it activates an output exec pin to
  continue the flow. A **data pin** carries a typed value; data pins are
  type-specific, colored by their data type, and can only wire to pins of the
  same type (subject to auto-casting). Both kinds draw as an outline when
  unwired and solid when connected.
- A **Wire** is a connection between two pins. An execution wire is a white
  arrow spanning an output exec pin to an input exec pin and represents the flow
  of execution; a data wire is a colored arrow and represents the flow of a
  value. The data pins of a function call node correspond to that function's
  parameters and return value.
- There are **three subgraph forms**, each a way to move a cluster of nodes off
  the main graph, differing in reuse:
  - A **collapsed graph** encapsulates selected nodes into a single node whose
    contents open as a subgraph. It is organization only — it has no input or
    output limits, but cannot be called elsewhere; copying it duplicates its
    contents into a new collapsed graph.
  - A **Function** is a graph with a single entry node and one exec output pin.
    It is called from other graphs and other Blueprints, runs once, returns a
    result, and forbids latent nodes (timelines, delays) so it is guaranteed to
    return immediately.
  - A **Macro** is a reusable graph layout that "expand[s] directly into the
    Blueprint where they're used." It can have multiple execution outputs and is
    used for visual flow control; it does not exist in the compiled Blueprint,
    because each instance is expanded into its own copy of the nodes at compile
    time.
- A **comment box** is a resizable rectangle that is purely annotative. It is
  created by pressing **C** (empty) or by "Create Comment from Selection," and
  resized by dragging its lower-right corner. Any nodes within the box's
  boundaries move along with it when it moves — the default **Move Mode** is
  **Group Movement**; the alternative **Comment** mode lets the box move
  independently. The box has an editable title text in its header and a
  **Comment Color** for its background. Its title text scales as the graph is
  zoomed, so it stays readable at overview zoom.
- Organization vocabulary the author works in: a **reroute node** is an
  "extension cord" inserted into a wire (double-click a wire to add one) to move
  the wire's path without changing its logic; and **Alignment** menu options
  align and distribute selected nodes.

## Capabilities

The product is an editor; these are what it gives the author working a graph.

The author can: place nodes from a searchable context menu and wire exec and
data pins into a graph; **collapse** a selection into a collapsed graph, a
Function, or a Macro; add comment boxes and reroute nodes and align nodes to
organize the graph; and search the current graph for a node by name (**Ctrl+F**)
and frame or fit the view (**F** for selection, **A** for the whole graph).

The editor **compiles** the Blueprint on demand — the **Compile** button "checks
your Blueprint for errors and updates it so the latest changes work in your
level" — and reports errors and warnings so the author fixes them before
runtime.

The editor **debugs** on the live graph. During Play-In-Editor or
Simulate-In-Editor the author places a **breakpoint** on a node to pause
execution there, sets a **watch** on a pin to see the value from its most recent
execution, and reads the Blueprint Debugger's Data Flow, Call Stack, and
Execution Trace. Execution is visualized on the graph itself as the flow moves
through nodes and wires.

## Sources

Official documentation at dev.epicgames.com, consulted 2026-07-14 for Unreal
Engine 5.8 — principally: blueprints-visual-scripting-in-unreal-engine,
overview-of-blueprints-visual-scripting-in-unreal-engine, blueprint-foundations,
nodes-in-unreal-engine, connecting-nodes-in-unreal-engine,
collapsing-graphs-in-unreal-engine, comments-in-unreal-engine,
flow-control-in-unreal-engine, and blueprint-debugger-in-unreal-engine.
Key-binding lists, exact pin colors, and node catalogs live behind those links
and change across engine versions.
