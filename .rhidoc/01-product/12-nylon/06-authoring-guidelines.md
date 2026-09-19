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

- For the control prototype, author JSON directly. Preserve existing Node IDs
  and the source path so open Tabs retain their focus, camera, and disclosure.
- A control Arc has `id`, `kind: "control"`, `control: "invoke" | "return" |
  "continue"`, `from`, and `to`. A return adds `invocation`, the invocation Arc ID.
  An invocation may add `controlContract: { input, output }`, referencing two
  ordinary Contract Nodes. Other Arcs default to data; `kind: "data"` is optional.
- Model caller-to-callee invocation and callee-to-continuation return as separate
  Arcs. Do not invent four Arc kinds for their input/output Data Arc segments.
- A return can leave an internal exit Transformation of the callee. Retain
  boundary endpoints while a Transformation is undifferentiated or the internal
  mapping is undecided; differentiation does not guess this mapping.
- Describe the layer-specific acknowledgement in the output Contract. No
  response promised is different from an empty successful response.
- Give alternative outcomes a tagged result Contract and mutually exclusive
  guards in the receiving Transformations' prose. In the .NET example,
  GetDetails returns Found or NotFound; only Found invokes the summary write.
  Both return Arcs reference the same invocation. Do not interpret them as
  unconditional Fan-out.
- Show table reads as Data Arcs from durable table Contracts and committed
  writes as Data Arcs into them. Keep the returned acknowledgement separate
  from the table state, and do not infer control progression from resource edges.
- Use `nylon check` or `nylon doctor` for non-destructive JSON diagnostics.
  Semantic warnings remain editable. Direct file changes clear undo history,
  independently of retained view information. Use the storage server for live reloads.
- Nylon's rule catalog is `nylonRules` in `packages/core/src/nylon/diagnostics.ts`.
  Each entry declares an `id`, `description`, `severity`, and pure `check(context)`
  function returning findings with messages and affected Node/Arc IDs. Add or
  change an entry there when Nylon gains a node kind, edge type, or semantic rule.
  The evaluator supplies rule identity and severity to each finding.
- The catalog applies to all Nylon Documents; there is no per-document rule
  configuration. JSON loading, actions, CLI, and UI use the same checker.
  Operations retain target-existence and ambiguity guards but do not duplicate
  semantic predicates. Structural errors block unsafe changes; semantic findings
  remain warnings regardless of how the relationship was authored.
- The diagnostics module depends only on document types. Copy that module and
  its types to reuse it. Rendering code places indicators and projects the graph;
  it does not decide which relationships violate Nylon's rules.

- Keep an external resource outside the Transformation or application that
  uses it.
- Let an Arc cross a containment boundary when a Child depends on an external
  resource.
- Use a Contract Pair for a boundary with one input Contract and one output
  Contract. Do not create a Contract Pair for a Transformation with multiple
  output Contracts.
