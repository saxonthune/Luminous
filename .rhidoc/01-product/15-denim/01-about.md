---
title: About
summary: Denim is a graph-based design system for describing user journeys, capabilities, resources, implementation structure, and contracts.
tags: [denim, graph, design, requirements, journeys]
deps: [doc01.04]
---

# About

Denim is a graph-based design system for describing how a product is expected to
work and how that design relates to the resources and implementation that
support it. Its starting point is a collection of Journeys: business flows or
similar, elaborated through observable Actions, Capabilities, Resources,
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
query-backed canvas views. Users can refine a Journey into child nodes, connect
existing nodes, and move between a Journey's requirements, Capabilities,
Resources, and other queried views. Node kinds and their relationships remain
open to change while the model is being tested.

## First implementation

The first storage format is a single `.denim.sqlite` file. SQLite stores nodes
and edges in separate tables; node and edge type names are text values so they
can change without changing the database schema. One shared TypeScript module
in `@luminous/core/denim` owns sql.js access for both the browser app and CLI.
The browser app can edit a workspace database or keep edits to a bundled demo
database in browser storage.
