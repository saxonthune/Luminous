---
title: Glossary
summary: The Linen controlled vocabulary — the terms Linen docs use exactly, in the entry kinds of doc00.05
tags: [glossary, vocabulary, linen]
deps: [doc01.09.01]
---

# Glossary

Linen's controlled vocabulary, in the entry kinds of doc00.05. Docs in this
section use these terms exactly.

Admission policy follows Atlas (doc01.07.03): a term is added only when the
user asks. A concept the glossary does not name is described in plain words
and added as an Unnamed entry — never named in passing.

## Document

- **Document** — the file a Linen canvas persists as (`*.linen.json`).

## Trace

- **Trace** — one run through the drawn system, from an Entry to its end (a
  Return or a Release Control); the unit "what happens when this runs" is
  asked of. (Named to match "stack trace".)

- **Trace Node** — one symbol in a Trace.
  - There is a set of Trace Node types that together depict what happens when
    a run executes: where it starts, how it branches, how data changes
    format, where control leaves and resumes, and where it ends.

- **Glyph** — the visual mark a Trace Node type is drawn as.

- **Edge** — the connection from one Trace Node to the next; an Edge carries
  the order of the Trace. `edge(Trace Node, Trace Node)`
  - An Edge to a Contract connects a Module or Trace Node to a Contract.

## Trace Node types

- **Entry** — where a Trace starts: the arrival of a request or event.

- **Filter** — a guard clause: a switch where only one path leads to effects;
  the other cases return immediately with an error.

- **Switch** — a branching point (if, match/switch) where more than one path
  continues.

- **Transformation** — a step that maps data from one format to another
  (mapping rules).

- **Type** — the format of the data at a point in the Trace, drawn between
  steps. Out data is simply the next module's input data.

- **Pass** — control passes to another Module and the Trace suspends until it
  resumes. The resumed data format comes from a Contract connected to the
  Module being passed to.

- **Return** — an early exit from a Trace (the failing cases of a Filter).

- **Release Control** — the end of a Trace: control leaves the drawn system.

## Structure

- **Module** — a container holding a sequence of Trace Nodes; the ownership
  boundary control passes across.

- **Deployment** — the container scale above Module; a deployed composition
  of Modules.

- **Contract** — a declared data shape, owned by one Module and shared to its
  consumers; referenced, never copied inline.

- **Manifest** — the outbound summary computed at a Module border: what
  leaves, in what Types. Computed, never authored.

## Unnamed

> Splits that recur but have no approved term yet. Each entry states the
> split, where it recurs, and candidate names — following the `*(unnamed)*`
> entry kind of doc00.05.
