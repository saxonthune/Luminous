---
title: About
summary: Denim is a graph-based design system for describing user journeys, capabilities, software instances, implementation structure, and contracts.
tags: [denim, graph, design, requirements, journeys]
deps: [doc01.04]
---

# About

Denim is a graph-based design system for describing how a product is expected to
work and how that design relates to the resources and implementation that
support it. Its starting point is a collection of Journeys: business flows or
similar, elaborated through observable User Actions, Capabilities, Instances,
Organizations, and Contracts. The graph model is intended to remain open to
revision as the product is explored.

## Inspirations

These sources motivate questions and points of view for Denim. They are not
rules Denim must follow, and their terminology is not adopted as Denim's
controlled vocabulary.

### Software assemblage

The draft at
`/home/saxon/Documents/clown-train/predrafting/software-assemblage/260825_software-assemblage.md`
frames software as a changing network of autonomous parts across code,
deployments, organizations, people, and the outside world. Execution begins
with an external event, passes through linked modules, and changes state. The
draft also treats source code, deployment, and the systems that build software
as connected parts of that network. It argues for tools that help engineers
inspect deployed systems, inventory requirements holistically, and create
artifacts that coding agents can act on.

### Artifact-driven development

The draft at
`/home/saxon/Documents/clown-train/drafts/computation/reality-of-software/artifact-driven development.md`
starts design from the product need and the artifacts needed to provide it. It
favors composition around those needs over simulating a real-world process in
software objects, and connects code changes to changes in product requirements.
It also emphasizes that implementation details such as storage and operating
constraints shape what surrounding parts can do.

### Serenity/JS Screenplay Pattern

[Serenity/JS's Screenplay Pattern](https://serenity-js.org/handbook/design/screenplay-pattern/)
uses actors, goals, and business-focused activities to make acceptance-test
scenarios understandable across technical and business roles. It separates
higher-level Tasks from lower-level Interactions and uses Abilities to connect
actors to interfaces. For Denim, this is an example of expressing behavior at
more than one level of detail and connecting observable activities to the
interfaces that support them; its Screenplay terms and test-specific structure
are not adopted as Denim rules.

## Starting direction

Denim begins with a Journey list, a graph of typed nodes and relationships, and
persistent Boards for reasoning about that graph. Nodes and Edges belong to the
database as a whole. Each Board is seeded from queries, then stores its exact
set of loaded Nodes and its own spatial arrangement. Users can shape several
useful views of shared design data without assigning Nodes to a single Board.
Node kinds and their relationships remain open to change while the model is
being tested.

## Design principle

Semantics derive from visual arrangement and UI controls, not the other way
around. Containment, Edges, and other graph relationships are fundamental
properties of the design. Instance data and Node types do not dictate the
canvas projection; the user composes each Board through its visible Nodes,
relationships, and controls.

## First implementation

The first storage format is a single `.denim.sqlite` file. SQLite stores nodes
and edges in separate tables; node and edge type names are text values so they
can change without changing the database schema. One shared TypeScript module
in `@luminous/core/denim` owns sql.js access for both the browser app and CLI.
The browser app can edit a Denim database or keep edits to a bundled demo
database in browser storage.

## Static demo

The bundled Denim example is `packages/client/public/canvases/denim-itself.denim.sqlite`.
Braincrawl projects are not bundled as Denim examples. The initial Journeys Board
shows “A user drafts a journey” in a Sequence Container, including nested steps.
The Journey drafting Board provides another placement of that shared sequence;
the Implementation Board reuses selected actions alongside capabilities, contracts,
and modules in regular and nested containers. The original “A user builds a journey”
Board retains the broader architecture exploration.

The demo is a curated design example, not a complete generated inventory or call
graph. Its older action-to-query call edges were removed during curation because
they predated the action/database refactor; the retained `board.read` to
`getDenimBoardGraph` edge follows the current handler. Capability-to-action edges
on Implementation mean that the capability supports the action. They point toward
the action so implementation detail does not become an extra sequence entry:
Sequence Containers currently traverse all downstream parent-child Edges.

The snapshot was curated from `.luminous/denim-starter.denim.sqlite` through the
action API on a separate copy. Placeholder Nodes were removed, table definitions
refreshed, and a Sequence Container UI module added. The six extra sequence
operation/table-definition Nodes were removed after demo review. The bundled file is the portable
artifact; no local working project is required to load it. Static-demo edits stay
in the visitor's browser storage. An existing saved browser copy takes precedence
over the bundled snapshot.
