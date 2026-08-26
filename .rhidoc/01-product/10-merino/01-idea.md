---
title: Idea
summary: A general-purpose node-and-edge app for designing a program as event-driven requirements and their deployments, grown by attaching detail subnodes until an agent has enough to change source code
tags: [merino, apps, requirements, deployments, differentiation]
deps: [doc01.04]
---

# Idea

Merino is a Luminous app (doc01.04) for software design. A user makes Nodes of
different types on a canvas and connects them with Edges. It is deliberately
general — the same small vocabulary draws a UI transition graph (Homepage →
Accounts → Settings) and an event-driven requirements graph (an event fans out
into the requirements it triggers, and each requirement into the resources it
needs).

The app is kept free-form on purpose, because the shape it should take is still
being found. The value is in the design process, not a fixed schema: a Node
starts coarse, and when it does not yet carry enough for an agent to change
source code, the designer hangs detail off it and repeats.

## The authoring vocabulary

- A user creates a Node on the canvas.
- Right-clicking a Node adds a **Subnode** — a child Node joined by a
  dotted Edge.
- A user connects two Nodes by dragging from an indicator on one Node to
  another.
- A user manages the set of Edge types: adding a type, and changing an Edge
  from one type to another.

## Differentiation

The design grows by differentiation, the same unfolding the Dataflow Designer
uses (doc01.05.01): start with the coarsest graph and add detail only where the
design demands it. Merino's demand is concrete — a Node is detailed enough when
an agent could act on it to change source code. Where a Node still holds
unresolved ambiguity, the designer attaches Subnodes carrying more information,
and each Subnode can itself be differentiated further.

## Two tabs

Merino has two tabs the user selects between: **Requirements** and
**Deployments**. Both are the same node-and-edge canvas with the same
vocabulary. The Requirements tab holds the event-driven requirements graph and
the UI transition graph. The Deployments tab holds a graph of the deployments
that run the software — for the worked example below, a web page, a REST API, a
key-value store, and a scheduled job.

## Worked example: CitiBikes in Subwhere

The motivating case is showing CitiBike stations on the NYC-subway map that
nyc-subwhere already draws (doc01.09.01). Its requirements graph reads left to
right as event, then requirement, then resource:

- **On load** triggers: the map loads, train and station data load, the UI
  loads.
- **On bike-toggle** triggers loading the bike data.

Each requirement decomposes into the resources behind it — train trips, station
records (format: line; id, position), the map camera geometry, the menu (a bike
toggle and a load indicator) — and each resource points at where it comes from
in the deployment graph: MTA feeds, a position calculation that needs a
line-segment percentage, values hardcoded in the bundle or in code.

## Open questions from the board

- **One document or two.** Whether the Requirements and Deployments tabs are two
  graphs in one Merino document or two separate documents, given the board draws
  requirement, source code, and deployment as one connected pipeline.
- **Where source code sits.** The board places a Source Code column between the
  requirements graph and the deployment graph; whether that is a third region, a
  property of a Node, or derived is unsettled.
- **Differentiation as a modeled state.** Whether "enough for an agent to change
  source code" is a state a Node carries (resolved against unresolved) or an
  informal stopping point the designer judges.
- **How detailed the deployment graph must be**, and whether its format maps
  one-to-one with source code modules.
- **Node types built-in or user-minted.** Whether Merino ships a small starter
  set of Node types (event, requirement, resource, deployment) or leaves all
  types for the user to define, as the Edge types are.
- **Cadence.** How the refresh cadence of a data source (MTA feeds, a scheduled
  job) is expressed against the requirements it serves.
