---
title: Idea
summary: The general canvas — a property graph of nodes and edges, projected through a pack that declares kinds, render templates, and views; the app the graph-and-pack model belongs to
tags: [canvas, apps, packs, property-graph]
deps: [doc01.04, doc02.11, doc02.14]
---

# Idea

Canvas is a Luminous app (doc01.04) for software design. It holds a property
graph — nodes with kinds, edges with kinds, both with typed props — and projects
it onto a canvas through a pack that declares what those kinds mean and how they
are drawn (doc02.11).

A node starts as a note: an actor, human or agent, puts it on the canvas and
draws a freeform edge to another without declaring a vocabulary first. Notes are
promoted into formalized instances once the vocabulary is understood. Nodes nest.

## Graph and pack

A canvas is two documents. The graph holds the model; the pack holds its
vocabulary — node and edge kinds, render templates, disclosure schemas, saved
views, and layout defaults (doc02.14). They change at different rates: a graph
churns with every pipeline run and every authored edit, and a pack is a stable
library.

The asymmetry decides where a setting lives. A fact that travels with the data —
a per-canvas one-off, a pipeline-derived hint — belongs on the graph. A fact that
travels with the vocabulary — layout defaults, disclosure, view definitions —
belongs on the pack. The question that settles it: would another canvas using
this pack want the same thing?

A pack is JSON data, owned by the domain it describes and co-located with its
graph, not code installed into Luminous.

## Pipelines

A pipeline reads source code by static analysis and emits a graph. The pipeline
is the reusable artifact, shareable across projects. Each pipeline declares the
node kinds its domain demands rather than drawing from a universal schema.

Regeneration never clobbers authored work: ids are stable and derived from source
content.

## Scope

The graph-and-pack model belongs to Canvas. Dataflow (doc01.05) and Atlas
(doc01.07) are sibling apps with their own document formats and no pack; cactus
renders whatever projection an app hands it.
