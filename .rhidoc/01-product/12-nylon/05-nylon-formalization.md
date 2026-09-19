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
- **M2.** Every Data Arc MUST join one Transformation and one Contract.
- **M3.** Every Control Pass Arc MUST join two Transformations. Neither kind
  joins two Contracts.
- **M4.** Every path made exclusively of Data Arcs MUST alternate Contracts and Transformations.
- **M5.** Containment and Contract Pairs MUST preserve the data network's bipartite structure.
  A Contract in a Contract Pair remains a Node and remains the endpoint of its
  Arcs.

## Control prototype

- A Control Pass Arc has a stable identity and an invocation, return, or
  continuation role. A return references its invocation's identity. Its source
  may be an internal exit of the invoked Transformation, and its destination
  may differ from the caller.
- A Control Contract references separate input and output Contract Nodes on an
  invocation Arc. Their Data Arcs express transferred data; they do not replace
  the invocation and return relationships.
- Differentiation retains control endpoints on the original boundary. Authors
  explicitly move them to internal participants when that detail is known.
- An invocation alone implies neither a transferred thread nor a synchronous
  wait. A return or continuation states the progression the design promises.
- The .NET contact-refresh specimen reads customer details, prepares a summary,
  then invokes a second repository to commit a summary write. Only afterward
  does it return HTTP 204. If the customer is absent, a separate continuation
  returns HTTP 404 without invoking the write. The read and write are not one
  atomic transaction.
- Alternative returns may reference the same invocation. Their target
  Transformations state mutually exclusive guards over the result Contract,
  such as Found and NotFound. These are alternative continuations, not an
  instruction to execute every outgoing branch. Guards remain prose in this
  prototype, following the rate-limit example's existing convention.
- A Data Arc from a durable table to a read states a data dependency. A Data Arc
  from a committed write to a table states a resource effect. Neither implies
  control transfer; the write's acknowledgement remains a separate Contract.
- Write failure, timeout, request-only, and asynchronous variants remain design
  work; customer absence is the first explicit alternative outcome.

## Diagnostics

Rules diagnose authored Documents without modifying them. Semantic violations
are warnings and do not prevent moving or inspecting Nodes. Duplicate Node or Arc
identities, unknown parents, and containment cycles prevent safe canvas
projection; the UI retains the Document and Tabs while showing the issues.
Doctor is read-only, including when the Document violates these rules.

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
