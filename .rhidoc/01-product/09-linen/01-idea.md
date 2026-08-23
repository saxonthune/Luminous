---
title: Idea
summary: A canvas app that answers "what happens when this runs" — nested modules drawn as symbol sequences of control flow and data transformation, annotated on selection
tags: [linen, apps, control-flow, symbols, contracts]
deps: [doc01.04, doc01.09.02]
---

# Idea

Linen is a Luminous app (doc01.04) for software design. Its goal: look at any
piece of a software project and say "what happens when this runs."

A Linen canvas draws nested Modules that depict a Trace (doc01.09.02): a
sequence of control flow and data transformations. Unlike Atlas, whose Nodes
carry Content on the canvas, Linen draws Trace Nodes as Glyphs; a Trace Node's
detail appears as an annotation when the user selects it — "click one → what
happens here?": branching (if, match/switch), guard clauses, input data,
output data, transformations.

The Trace tracks:

- the format of the data as it transforms — out data is simply the next
  Module's input data;
- control passing to another Module, or waiting on a remote resource;
- the output at the end of a Trace, explained at its Release Control. The
  output type is a Contract, so that information is pullable rather than
  authored inline.

## Worked example

A C# API solution with an API project, a services project, and a data-access
project (EF configuration). The API project receives a request in a given
format. The request faces a set of guard clauses — switches where only one
case continues execution; the rest return immediately with an error. The
request is transformed into the format the service layer needs; that format
gets its own box, because one csproj owns it and consumers like the API
project share it. Control passes to the service module, whose path can be
traced all the way to database calls. Control returns to the API module, a
Transformation parses the output, and the Release Control explains what the
branch returns.

## The return rule

No bidirectional Edge shows control returning. When a Pass hands control to
another Module, the caller's Trace resumes holding data in the format of the
Contract connected to the Module passed to. The return side is derived from
that connection, never drawn by hand.

## What the human decides

From the whiteboarding session: "AI cannot decide: composition, controlled
vocabulary." The human owns the controlled vocabulary (doc01.09.02) and the
composition of Modules; the AI implements from clear specs. The project
partitions what AI is good at (implementation from clear specs) from what
humans are good at (naming a controlled vocabulary, high-level concept
design). See the software-as-coloring-book essay
(computation.saxon.zone/blog/260530-software-as-coloring-book) and the
fifa-bracketing naming retrospective (doc01.05.02).

## Semantic zoom

Zoom crosses two container scales: module to module, deployment to deployment.
Information is hidden until necessary — local constants (business logic is a
constant), config. Business logic lives in switches, guards, and transforms;
.NET IOptions implements the config side of this. Inner-node outbound details
can be inferred and summarized by outer containers: each border check has an
outbound manifest.

## Composition frequencies

A deployment must represent compositions of different change frequencies: app
logic, dotenv, connection strings, config, IaC(?), caches, middleware.

## Open questions from the board

- Async wait — how a wait on a remote resource is drawn.
- Whether the boundary-exit behavior depends on the control-flow semantics of
  the language in question.

## Refactorability

The vocabulary and graph rules must stay cheap to change, because names are
expected to change. Two rules propagate across the app:

- **Authored facts are stored; derivable facts are computed.** A Document
  records only what a human declared (an Edge to a Contract, a Pass).
  Conclusions (the format a Trace resumes with after a Pass, a border's
  Manifest) are computed at projection or check time and never persisted, so
  a rule change never requires a Document migration.
- **One descriptor table.** Each Trace Node type is one entry in a single
  core table — name, gloss, Glyph, structural rules as data. Checks,
  rendering, MCP schemas, and generated references all derive from the table;
  a rename is a table edit plus a mechanical version-keyed migration.

## First model

The first Linen canvas models nyc-subwhere, a live 3D map of the NYC subway
(Cloudflare Worker + Durable Object pollers + browser renderer), chosen
because its hardest path crosses runtimes without a call: the backend writes
a snapshot into KV, and the browser reads it seconds later.
