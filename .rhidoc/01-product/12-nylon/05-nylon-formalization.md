---
title: Nylon Formalization
summary: Nylon's formal rules and the semantic rules being tested as Transformations are differentiated
tags: [nylon, formalization, bipartite, transformations, contracts, arcs]
deps: [doc01.12.02, doc01.12.03]
---

# Nylon Formalization

This document separates Nylon's required graph structure from semantic rules
that the design is testing. The required rules define a valid Nylon network.
The rules under consideration guide how a valid network expresses software.

## MUST Rules

- **M1.** Every Node MUST be exactly one of: Transformation, Contract.
- **M2.** Every Arc MUST join one Transformation and one Contract.
- **M3.** An Arc MUST NOT join two Transformations or two Contracts.
- **M4.** Every path MUST alternate Contracts and Transformations.
- **M5.** Containment and Contract Pairs MUST preserve this bipartite structure.
  A Contract in a Contract Pair remains a Node and remains the endpoint of its
  Arcs.

## Rules Under Consideration

- Differentiation can expose a serial path, supporting dependencies, or both. It
  does not require every internal Node to form one serial chain.
- Differentiation preserves the differentiated Transformation's input and
  output boundary.
- A Contract denotes meaningful data, state, or an interface. A bend or routing
  need does not justify a Contract.
- A durable data source, such as a database table, is a Contract.
- An operation over data, such as a query, join, filter, or projection, is a
  Transformation.
- A durable data Contract can supply data to a Transformation without becoming
  an intermediate result on the Transformation's input-to-output path.
- An intermediate Contract appears only when the design identifies a meaningful
  representation between Transformations.
