---
title: Authoring Guidelines
summary: Practical guidance for ordering and differentiating behavior in a Nylon network
tags: [nylon, authoring, guidelines, differentiation, ordering]
deps: [doc01.12.03, doc01.12.05]
---

# Authoring Guidelines

This document records practical guidance learned while authoring and revising
Nylon Documents. It explains how to express software clearly within the formal
rules in doc01.12.05.

## Ordering

- Read ordering from Arcs, not from the left-to-right placement of Nodes.
- Use a serial path when each Transformation requires the preceding result.
- Use Fan-out when one Contract supplies multiple independent Transformations.
- Use Fan-in when one Transformation requires the results of multiple branches.
- Treat every incoming Contract of a Transformation as required before that
  Transformation proceeds.
- Treat a Contract as reusable data, not as a consumable token. One Contract can
  supply multiple independent branches.

## Differentiation

- Treat nesting and differentiation as primary software-design decisions:
  nesting states which behavior owns a child, and differentiation exposes how
  that behavior works.
- Place each child inside the narrowest Transformation that owns its behavior.
- Preserve the Parent Transformation's external inputs and outputs.
- Use an Entry Transformation to receive or prepare each parent input.
- Use an Exit Transformation to gather internal results and produce each parent
  output.
- Make the Exit Transformation complete the output boundary. Do not make it
  repeat the full description of its Parent Transformation.
- Use the smallest differentiation that expresses the behavior. Add another
  Node only when the design identifies another meaningful step or
  representation.

## Contracts and Transformations

- Add a Contract only for meaningful data, state, or an interface. Do not add a
  Contract to turn or route an Arc.
- Represent durable data, such as a database table, as a Contract.
- Represent an operation over data, such as a query, join, filter, or
  projection, as a Transformation.
- Connect a durable-data Contract to each Transformation that reads it. Keep
  the Contract outside the serial request-and-result path unless it is itself
  an intermediate result.

## Boundaries

- Keep an external resource outside the Transformation or application that
  uses it.
- Let an Arc cross a containment boundary when a Child depends on an external
  resource.
- Use a Contract Pair for a boundary with one input Contract and one output
  Contract. Do not create a Contract Pair for a Transformation with multiple
  output Contracts.
