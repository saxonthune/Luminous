---
title: Glossary
summary: The Dataflow Designer's controlled vocabulary — Document, Box, Flow, Description, Contract, Group, and the loose Source/Transform/View subtypes
tags: [glossary, vocabulary, dataflow]
deps: [doc01.05.01]
---

# Glossary

The Dataflow Designer's controlled vocabulary, in the entry kinds of doc00.05.
Docs in this section use these terms exactly.

- **Document** — one dataflow diagram as a file; the unit the app lists, the
  agent edits, and drift detection reads against code.
  - A Document holds Boxes and Flows.

- **Box** — one piece of the designed system, carrying the design's intention
  for that piece.
  - A Box has a Name. The user decides Names; an agent proposes, never coins.
  - A Box has a Description.
  - A Box optionally holds a Contract.
  - Each Source is a Box that data enters the design through.
  - Each Transform is a Box that makes new data from the data flowing into it.
  - Each View is a Box that shows data to the end user.
  - Not: "node" (the engine's word — a Box renders as a cactus node).

- **Flow** — a directed connection carrying data from one Box to another.
  `flows(from Box, to Box)`

- **Description** — prose on a Box saying what it is and is for; the part of
  intention no Contract carries.

- **Contract** — the declared shape of a Box's data, in the notation the
  described system uses (prose, JSON Schema, YAML, a class, trait, or
  interface definition); the surface drift detection reads against code.

- **Group** — a simple visual grouping of Boxes.

- *(unnamed)* — the split between a Box that describes the state of data and
  a Box that describes a change to data. Recurs in prior art (DFD's stores
  and processes); the schema does not enforce it, and the Source/Transform/
  View subtypes above are ways of speaking, not required fields.
  Candidates: role, kind.
