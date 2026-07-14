---
title: Dataflow operations
summary: The operation set over a dataflow Document — the dataflow MCP tool group's verbs, their validation rules, and the check warnings
tags: [dataflow, mcp, operations, tools]
deps: [doc02.21, doc02.04]
---

# Dataflow operations

The operations an agent uses over a dataflow Document, exposed as the
`dataflow` MCP tool group. The grammar is primitive verbs only: compound
gestures compose from them inside a batch — inserting a Box between two Boxes
is addBox, connect twice, and disconnect, applied atomically.

## Verbs

- `list` returns the workspace's dataflow Documents.
- `create` makes an empty Document at a path.
- `read` returns a Document.
- `addBox` adds a Box with a name and optional description and contract. The
  id derives from the name at creation and never changes afterward.
- `set` updates a Box's name, description, or contract. Renaming changes only
  the name.
- `connect` adds a Flow; both Boxes must exist; duplicate Flows are rejected.
- `disconnect` removes a Flow.
- `removeBox` removes a Box. It refuses while Flows attach to the Box unless
  the caller passes `cascade`, which removes those Flows with it.
- `check` reports invariant breaks as errors (a Flow endpoint that names no
  Box, duplicate ids, duplicate names) and structural smells as warnings: a
  Box with inbound Flows and no outbound Flow (DFD's black hole) and a Box
  with no Flows at all (an orphan). Warnings never block a write.
- `batch` applies a sequence of mutations atomically — a reader never sees a
  half-applied change.

## Write path

Mutations validate in the tool layer, apply through the pure functions in
`@luminous/core/dataflow`, and reach disk as one whole-document write through
the server. The server stays dumb storage: it validates nothing about the
document's content.
