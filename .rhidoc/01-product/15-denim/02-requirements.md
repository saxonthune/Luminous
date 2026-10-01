---
title: Requirements
summary: Pending user-supported requirements for Denim's journey graph, node editing, query-backed views, and resource selection.
tags: [denim, requirements, ui, graph, views]
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

- **GED1.** [p] When the user differentiates a node, Denim creates a subnode beneath it.
- **GED2.** [p] The user can change a node's type at will.
- **GED3.** [p] Denim does not restrict parent/child relationships by the types of their nodes.
- **GED4.** [p] When differentiating a node, the user can choose an existing node as its subnode instead of creating a new node.

## Journey view

- **JV1.** [p] The default view of a Journey is a top-to-bottom directed acyclic graph.
- **JV2.** [p] In the default Journey view, subnodes appear beneath their parent nodes.
- **JV3.** [p] In the default Journey view, edges represent parent/child placement relationships.

## Tabs and views

- **VIEW1.** [p] Denim provides tabs for different views.
- **VIEW2.** [p] When Denim opens, its default view is a list of Journeys.
- **VIEW3.** [p] Every view shown in a tab is a canvas.
- **VIEW4.** [p] The user can render queried data as a table node.
- **VIEW5.** [p] A view shown in a tab is based on a query.
- **VIEW6.** [p] The user can open shortcuts to specific views.
- **VIEW7.** [p] Shortcut views show a list of Capabilities.

## Journey and Resource queries

- **QUERY1.** [p] The view for a single Journey can query all nodes below that Journey.
- **QUERY2.** [p] The user can query for top-level Resources, where a Resource is top-level when it has no parent that is a Resource.
- **QUERY3.** [p] When the user connects a node to an existing Resource, Denim provides a popup in which the user can find that Resource.

## Canvas presentation

- **CAN1.** [p] Canvas controls have no labels unless the user asks for them.
- **CAN2.** [p] The node-type control is a dropdown that displays the node's type.
- **CAN3.** [p] A node's text appears directly in a content area without a separate "Details" label.
- **CAN4.** [p] Denim keeps the canvas visually streamlined and brainstorm-friendly, avoiding excessive borders and other elements.

## CLI

- **CLI1.** [p] The CLI provides feature parity with Denim's UI capabilities.
- **CLI2.** [p] The CLI can create a new database seeded with the starter Journey and its Action child.

## Storage

- **STORE1.** [p] Denim stores each graph in a `.denim.sqlite` database file.
- **STORE2.** [p] Denim preserves edits to a bundled database in the browser.
- **STORE3.** [p] When saving fails, Denim keeps the in-memory edits and offers the user a way to retry saving.
- **STORE4.** [p] When a database revision conflict occurs, Denim keeps local edits unsaved and offers to reload the newer database, discarding the local edits.
