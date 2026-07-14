---
title: Dataflow document format
summary: The *.dataflow.json document — Boxes and Flows carrying design intention; TypeScript types own the shape, a sidecar JSON Schema describes it
tags: [dataflow, format, contract, schema]
deps: [doc01.05.01, doc01.05.03]
---

# Dataflow document format

A dataflow Document is a `*.dataflow.json` file in the served workspace,
sibling to canvas documents. It holds a design's intention as Boxes and Flows
(glossary: doc01.05.03).

## Shape ownership

The TypeScript types in `packages/core/src/dataflow/` are the source of truth
for the document shape. The sidecar `21-dataflow-document.schema.json`
describes the same shape as JSON Schema for readers and tools that want a
schema; the types win when the two disagree.

## Invariants

- A Box's `id` is stable for the life of the Document; renaming a Box changes
  only its `name`.
- The Document stores no layout. The viewer computes positions.
- A Box's `description` is prose intention. Its optional `contract` is a
  format-tagged block (`{format, text}`), so rendering and drift detection
  dispatch on the format (prose, JSON Schema, YAML, a class or interface
  definition).
- A Flow references Boxes by id, and both endpoints exist.
- The schema enforces no role. Source, Transform, and View are ways of
  speaking about Boxes, not fields.
- The `v` field names the document format version.
