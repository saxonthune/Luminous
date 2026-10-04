---
title: Glossary
summary: Denim terms for graph structure, persistent Boards, projections, and toolbar controls.
tags: [denim, glossary, vocabulary, graph, boards]
deps: [doc01.15.01, doc01.15.02]
---

# Glossary

These initial entries capture terms and relationships named in the Denim
request. `[p]` means their wording and placement are pending review. Contract
relationships and contents were not specified in the source request.

## Journey structure

- **DTERM1.** [p] **Journey** — a business flow or similar, represented through Actions.
  - A Journey has Actions as child nodes. `parent-of(action, journey)`

- **DTERM2.** [p] **Action** — an abstract description of behavior a user observes.
  - An Action can have Actions as child nodes.
  - An Action can have Capabilities as child nodes.

- **DTERM3.** [p] **Capability** — a node type that an Action can have and an Instance can fulfill.
  - A Capability can have Capabilities as child nodes.
  - An Instance fulfills a Capability. `fulfills(instance, capability)`

## Instances and implementation

- **DTERM4.** [p] **Instance** — a concrete, materialized part of a running software system, such as a UI deployment, API worker, or database table.
  - An Instance can have Instances as child nodes.
  - An Instance can have Organizations as child nodes.

- **DTERM5.** [p] **Organization** — a node representing modules, functions, guards, or other implementation details.

- **DTERM6.** [p] **Contract** — a node type requested for Denim; its contents and relationships remain unspecified.

## Boards and editing

- **DTERM7.** [p] **Differentiate** — create a child node beneath a node, either as a new node or by connecting an existing node.

- **DTERM8.** [p] **Board** — a persistent canvas workspace for reasoning about shared graph data. A Board stores query sources, explicitly included Nodes, per-Board Node positions, and display settings; it does not own the Nodes or Edges it presents.

- **DTERM9.** [p] **Table node** — a node that renders queried data as a table.

- **DTERM11.** [p] **Denim App Toolbar** — an always-visible toolbar below the Luminous header bar, organized into sections.

- **DTERM12.** [p] **Quick Select** — a speedy icon in the Denim App Toolbar that opens a dropdown of built-in Boards.

- **DTERM13.** [p] **Board Strip** — the second section of the Denim App Toolbar, which shows open Boards using tab navigation.

- **DTERM14.** [p] **Board Toolbar** — a floating toolbar below the Denim App Toolbar, centered horizontally over the canvas, with actions relevant to the current Board.

- **DTERM15.** [p] **Node Toolbar** — a toolbar in the bottom-left of a Node area that presents actions as icons; its capabilities may vary by Node type.

- **DTERM16.** [p] **Projection** — the graph computed from a Board's query sources and included Nodes for display on its canvas. “View” may describe this rendered or queried result, rather than the persistent Board.

## Graph relationship

- **DTERM10.** [p] Any node type can be a parent or child in a parent/child relationship. `parent-of(child, parent)`

## Relationship priority

- **DTERM17.** [p] **Priority value** — a numerical value on the Edge connecting a step to its parent; lower values come earlier in ascending rank order.

## Status feedback

- **DTERM18.** [p] **Status Toast** — a transient message near the canvas save-status badge that reports an action currently in progress and is hidden when no action is in progress.
