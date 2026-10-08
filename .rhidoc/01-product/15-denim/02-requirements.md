---
title: Requirements
summary: Pending user-supported requirements for Denim's journey graph, node editing, persistent Boards, and instance selection.
tags: [denim, requirements, ui, graph, boards]
deps: [doc01.15.01, doc01.15.03]
---

# Requirements

These requirements capture the initial Denim requests. `[p]` means wording and
placement are pending review. Their source evidence and capture revisions are
recorded in `.grn/events.jsonl`.
Requirement identifiers use a short prefix and local numbering for each feature section. If a feature grows, split it into smaller, hierarchically nested sections with their own prefixes and sequences instead of extending one global counter.

## Journeys

- **JNY1.** [p] Denim presents a collection of Journeys.
- **JNY2.** [p] When the user selects a Journey, Denim shows its tree of requirements.
- **JNY3.** [p] The user can create a Journey from the Journey collection.

## Graph editing

- **GED1.** [p] When the user differentiates a node, Denim creates a subnode beneath it with the same type as its parent.
- **GED2.** [p] The user can change a node's type at will.
- **GED3.** [p] Denim does not restrict parent/child relationships by the types of their nodes.
- **GED4.** [p] When differentiating a node, the user can choose an existing node as its subnode instead of creating a new node.

- **GED5.** [p] Denim persists literal-line Edges and `contains` Edges as distinct Edge types.
- **GED6.** [p] Denim derives an Edge's semantic meaning from its Edge type and the types of its endpoint Nodes.
- **GED7.** [p] A Node can belong to at most one Container.
- **GED8.** [p] Denim derives nested containment from `contains` Edges.
- **GED9.** [p] Creating a Node inside a Container creates a `contains` Edge from the Container's owner Node, and the new Node has the same type as its owner.

## Journey Board

- **JV1.** [p] The default Board for a Journey presents a top-to-bottom directed acyclic graph.
- **JV2.** [p] On the default Journey Board, subnodes appear beneath their parent nodes.
- **JV3.** [p] On the default Journey Board, edges represent parent/child placement relationships.

## Boards

- **VIEW1.** [p] Denim presents persistent Boards as tabs.
- **VIEW2.** [p] When Denim opens, its default Board shows a list of Journeys.
- **VIEW3.** [p] Every Board is a canvas projection of shared database Nodes and Edges.
- **VIEW4.** [p] The user can render queried data as a table node.
- **VIEW5.** [p] A Board is seeded from one or more query sources and stores its exact set of loaded Nodes independently.
- **VIEW6.** [p] The user can open shortcuts to the built-in Boards.
- **VIEW7.** [p] The built-in Capabilities Board shows a list of Capabilities.
- **VIEW8.** [p] Denim stores each Board's loaded Nodes and spatial arrangement independently; Nodes and Edges remain shared database data.
- **VIEW9.** [p] The user can load a shared Node onto or unload it from one Board without deleting the Node or its Edges.

## Journey and Instance queries

- **QUERY1.** [p] A Board sourced from one Journey can query all nodes below that Journey.
- **QUERY2.** [p] The user can query for top-level Instances, where an Instance is top-level when it has no parent that is an Instance.
- **QUERY3.** [p] When the user connects a node to an existing Instance, Denim provides a popup in which the user can find that Instance.

## Canvas presentation

- **CAN1.** [p] Canvas controls have no labels unless the user asks for them.
- **CAN2.** [p] The node-type control is a dropdown that displays the node's type.
- **CAN3.** [p] A node's text appears directly in a content area without a separate "Details" label.
- **CAN4.** [p] Denim keeps the canvas visually streamlined and brainstorm-friendly, avoiding excessive borders and other elements.

## CLI

- **CLI1.** [p] The CLI provides feature parity with Denim's UI capabilities.
- **CLI2.** [p] The CLI can create a new database seeded with the default Node types, the starter Journey, and its User Action child.
- **CLI3.** [p] The CLI can seed an existing Denim database with the default Node types from the shared default types file.

## Storage

- **STORE1.** [p] Denim stores each graph in a `.denim.sqlite` database file.
- **STORE2.** [p] Denim preserves edits to a bundled database in the browser.
- **STORE3.** [p] When saving fails, Denim keeps the in-memory edits and offers the user a way to retry saving.
- **STORE4.** [p] When a database revision conflict occurs, Denim keeps local edits unsaved and offers to reload the newer database, discarding the local edits.
