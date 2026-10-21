---
title: Glossary
summary: Denim terms for graph structure, persistent Boards, projections, visibility, and toolbar controls.
tags: [denim, glossary, vocabulary, graph, boards, visibility]
deps: [doc01.15.01, doc01.15.02]
---

# Glossary

These initial entries capture terms and relationships named in the Denim
request. `[p]` means their wording and placement are pending review. Contract
relationships and contents were not specified in the source request.

## Journey structure

- **DTERM1.** [p] **Journey** — a business flow or similar, represented through User Actions.
  - A Journey has User Actions as child nodes. `parent-of(user-action, journey)`

- **DTERM2.** [p] **User Action** — an abstract description of behavior a user observes.
  - A User Action can have User Actions as child nodes.
  - A User Action can have Capabilities as child nodes.

- **DTERM3.** [p] **Capability** — a node type that a User Action can have and an Instance can fulfill.
  - A Capability can have Capabilities as child nodes.
  - An Instance fulfills a Capability. `fulfills(instance, capability)`

## Instances and implementation

- **DTERM4.** [p] **Instance** — a concrete, materialized part of a running software system, such as a UI deployment, API worker, or database table.
  - An Instance can have Instances as child nodes.
  - An Instance can have Organizations as child nodes.

- **DTERM5.** [p] **Organization** — a node representing a concept that groups implementation details, such as Journey, Node, Edge, Container, or Board.

- **DTERM34.** [p] **Module** — a node representing a piece of code, such as an item in Rust.

- **DTERM6.** [p] **Contract** — a node type requested for Denim; its contents and relationships remain unspecified.

## Boards and editing

- **DTERM26.** [p] **Denim design principle** — Semantics derive from visual arrangement and UI controls, not the other way around. Containment, Edges, and other graph relationships are fundamental properties; Node type or Instance data does not dictate the canvas projection.

- **DTERM7.** [p] **Differentiate** — create a child node beneath a node, either as a new node or by connecting an existing node.

- **DTERM8.** [p] **Board** — a persistent canvas workspace for reasoning about shared graph data. A Board is seeded from query sources and stores its exact set of loaded Nodes, per-Board Node positions, and display settings; it does not own the Nodes or Edges it presents.

- **DTERM9.** [p] **Table node** — a node that renders queried data as a table.

- **DTERM11.** [p] **Denim App Toolbar** — an always-visible toolbar below the Luminous header bar, organized into sections.

- **DTERM12.** [p] **Quick Select** — the lightning-bolt button in the Denim App Toolbar that opens a general menu of app-level actions.

- **DTERM13.** [p] **Board Strip** — the second section of the Denim App Toolbar, which shows open Boards using tab navigation.

- **DTERM14.** [p] **Board Toolbar** — a floating toolbar below the Denim App Toolbar, centered horizontally over the canvas, with actions relevant to the current Board.

- **DTERM15.** [p] **Node Toolbar** — a toolbar in the bottom-left of a Node area that presents actions as icons; its capabilities may vary by Node type.

- **DTERM35.** [p] **Node Status Bar** — a dedicated area beneath a Node's content that shows its type label and indicators.

- **DTERM16.** [p] **Projection** — the graph of loaded Nodes and their connecting Edges rendered on a Board's canvas. Query sources seed a Board's initial loaded set; the Board then stores that exact set. “View” may describe this rendered or queried result, rather than the persistent Board.

## Graph relationship

- **DTERM10.** [p] Any node type can be a parent or child in a parent/child relationship. `parent-of(child, parent)`


- **DTERM19.** [p] **Contains edge** — an Edge of type `contains` directed from a Container's head Node to a Node inside it.

- **DTERM20.** [p] **Container** — a persistent component represented by a head Node, with member Nodes linked to that head by `contains` Edges. Its identity and membership are shared across Boards; its bounds are saved per Board.

- **DTERM21.** [p] **Container Toolbar** — a toolbar inside the top-left of a Container's area, below its header, using the Node Toolbar's always-visible and hover-revealed icon pattern.

- **DTERM22.** [p] **Container Node** — the Node represented by a Container and connected to it by a dashed curved line. Its type supplies the default type for Nodes created in that Container.

- **DTERM23.** [p] **Contained visual state** — the visual state of a Node whose rectangle touches or overlaps its Container's area. The Node moves with the Container.

- **DTERM24.** [p] **Detached visual state** — the visual state of a Node that remains connected to its Container by a `contains` Edge but no longer touches or overlaps its area. A dotted curved line represents the Edge; the Node stays in place when the Container moves.

- **DTERM25.** [p] **Detached Edge Toolbar** — a fixed-screen toolbar that opens to the right of a small badge anchored at the midpoint of a dotted Edge while the pointer hovers over it. Its trash icon opens a “Confirm Detachment” action that removes the `contains` Edge.

- **DTERM27.** [p] **Container Population Indicator** — a badge in a Container header showing `N/M`, where N is the number of Nodes reached by direct `contains` Edges loaded on the active Board and M is the total number reached by those Edges. Nodes inside nested Containers are not counted as direct members.

- **DTERM28.** [p] **Downstream Nodes Indicator** — a badge at the bottom-right of a Node showing `N/M`, where N is the number of its direct downstream Nodes loaded on the active Board and M is the total number of direct downstream Nodes.

- **DTERM29.** [p] **Upstream / Downstream** — for a directed Edge `A → B`, A is upstream of B and B is downstream of A. On a differentiated Node relationship, the parent is upstream and its child is downstream; downstream follows the Edge arrow direction.

- **DTERM31.** [p] **Board Context Menu** — a context menu opened by right-clicking the bare canvas background, offering Add node and Create new node.

- **DTERM32.** [p] **Node Visibility Menu** — a shared component that lists Nodes returned by a caller-provided query and lets the user load or unload each Node on a Board. Visibility means Board membership: loaded Nodes appear in the projection; Nodes not loaded onto the Board do not.

- **DTERM33.** [p] **Node Visibility Item** — a row in the Node Visibility Menu containing a Node's List Representation, its loaded state, and a control to load it onto or unload it from the current Board.

## Graph Primitives

- **DTERM36.** [p] **Graph Primitive** — a visual UI control that lets users input design information beyond manipulating a graph, while creating graph Nodes and Edges under the hood.

- **DTERM37.** [p] **Sequence Container** — a Graph Primitive that presents Nodes as an ordered sequence in Special Presentation or Graph Presentation.

- **DTERM38.** [p] **List Representation** — a type-colored rectangular component that presents a Node's type and text in list form. Find a node results and the Sequence Container's Special Presentation use the same component.

- **DTERM39.** [p] **Sequence Container Toolbar** — a toolbar in the Sequence Container header that uses the present and hidden action pattern and lets the user change presentation.
- **DTERM40.** [p] **Sequence Container Drafting Mode Node Toolbar** — a Node toolbar in the left padding beside its sequence position label during Drafting State, with one delete icon that uses the usual Node deletion confirmation.

## Relationship priority

- **DTERM17.** [p] **Priority value** — a numerical value on the Edge connecting a step to its parent; lower values come earlier in ascending rank order.

## Status feedback

- **DTERM18.** [p] **Status Toast** — a transient message near the canvas save-status badge that reports an action currently in progress and is hidden when no action is in progress.
