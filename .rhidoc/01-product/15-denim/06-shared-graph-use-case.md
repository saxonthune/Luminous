---
title: Shared Graph Use Case
summary: A motivating use case for reusing shared design Nodes across Journey Boards so queries can reveal requirements across the whole product.
tags: [denim, use-case, graph, boards, journeys, reuse, queries]
deps: [doc01.15.01, doc01.15.02, doc01.15.04]
---

# Shared Graph Use Case

## One design graph, several Journey Boards

A product can have multiple Journeys, each with its own sequence of User Actions.
Those actions lead to domain-oriented Capabilities, which in turn require
Instances, Organizations, and code Modules. Each Journey can have a Board that
shows the part of the design useful for reasoning about that Journey.

The Boards are views of one shared graph. They do not own copies of the Nodes
they show. For example, two Journeys may both require a UI Server and its
SolidJS Components Module. The graph contains one UI Server Node and one
SolidJS Components Node, with the relevant relationships from both Journey
paths leading to those shared Nodes. Each Journey Board can load and arrange
those same Node identities in its own projection.

## Why reuse matters

Reusing a Node preserves the fact that both Journeys depend on the same part of
the design. If each Board instead had a separately created “SolidJS Components”
Node, a query could mistake those labels for unrelated modules and miss that
they describe one shared resource. Stable identity lets queries traverse from
one shared Module to all connected Capabilities, User Actions, and Journeys.
That makes it possible to ask which requirements across the product depend on
a resource, or which resources support requirements from several Journeys.

The distinction is between **graph identity** and **Board presentation**. The
database holds shared Nodes and Edges; a Board records which Nodes are loaded
and where they appear. A Board can focus on one Journey without making its
design data private to that Board.

## Container example

The shared UI Server Node can own one regular Container, with the shared
SolidJS Components Node linked to it by a `contains` Edge. The Journey Boards
can each show that same owner, Container membership, and Module while placing
the Container independently on each canvas. Journey-specific dependency
relationships remain graph Edges; Container membership describes visual or
structural containment and does not replace those dependencies.

This example motivates keeping shared design relationships in the graph while
keeping loaded membership and spatial arrangement on each Board. It also gives
queries a product-wide graph to inspect, even when a person reasons through
that graph one Journey at a time.
