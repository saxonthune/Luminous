---
title: The braincrawl case
summary: The motivating case — braincrawl is drawn as the first Atlas canvas, a rough-draft proof of concept, because it already carries every input Atlas needs and its own specs already name the smells an Atlas should show
tags: [atlas, case-study, braincrawl, cli, dataflow]
deps: [doc01.07.01]
---

# The braincrawl case

braincrawl is a reusable academic knowledge graph built from open scholarly
metadata. It stores works, authors, and citations gathered from OpenAlex,
Semantic Scholar, Crossref, OpenCitations, and arXiv, and splits storage into
three layers: L1, the Library, holding raw bytes; L2, the Catalog, holding the
relational source of truth for identity and citations; L3, the Research
Collection, holding per-tenant markdown documents that reference L2 by
canonical id. A Rust core defines traits that two backends bind — a local stack
of filesystem, SQLite, and a native server, and a Cloudflare stack of R2, D1,
and a Worker. Its surfaces are a CLI and a read-only Solid.js web client.

braincrawl is the subject of the first Atlas canvas: a rough-draft proof of
concept, drawn to find out what Atlas is by drawing one.

## Why this program

Atlas asks for an inventory of interfaces and, from each entry, the dataflow
behind it (doc01.07.01). braincrawl already carries both inputs, produced from
code rather than authored by hand.

Its `.luminous/` directory holds three artifacts, each generated and never
hand-maintained. `cli-grammar.graph.json` is a Luminous graph of 75 nodes and
74 edges — 28 commands and 47 flags, nested by a `cli.contains` edge — emitted
from clap's own command tree by way of `CommandFactory`, so the inventory
cannot drift from the binary. `cli-grammar.pack.json` is its vocabulary: two
node kinds, one edge kind, four disclosure levels, and one view.
`braincrawl.dataflow.json` is a Dataflow Designer document of 7 boxes and 13
flows, grouped Provider, Desktop, Cloudflare, and Phone, each box carrying a
prose description and a contract.

These are generated artifacts, not an atlas: each is a transduction of code to
a visual document, thrown away and rebuilt on every run. They are what the
braincrawl atlas starts from and what it can later be compared against
(doc01.07.01). The atlas itself is authored — it holds both halves on one
canvas, and it keeps what it is given.

## What the canvas would show

The inventory half is the CLI grammar: `braincrawl` split into its subcommands,
each with its flags.

The dataflow half is what happens when a user enters one of those commands. For
`braincrawl openalex get --id <doi>`: the flags are a source; the command is
traced through alias resolution, which turns an external identifier into a
canonical id; through the OpenAlex client and its mapping; and out to the
writes — a `works` row in L2, an artifact blob in L1, and a job enqueued for
content the fetch did not carry.

Two properties of the domain are candidates for visual encoding. Node
materialization status is derived rather than stored: a citation target with no
`works` row is known but unfetched, and a work climbs from metadata-only to
abstract to fulltext as artifacts arrive. Tags on the CLI graph already mark
every flag with its bare argument name, so filtering by tag surfaces the
repetition that containment hides.

## The loop the canvas would close

braincrawl models its own CLI surface twice more, in `braincrawl-cli.tsp` and
`braincrawl-cli.smithy` — parallel protocol-neutral specs written as a
rationalization worksheet, not a build input. Their comments name the
irregularities in prose: the provider is baked into the operation name
(`OpenAlexSearch`, `SemanticScholarSearch`) instead of being a parameter, so
`get`, `refs`, and `citedBy` recur identically across four provider interfaces;
coverage is uneven, with `search`, `find`, and `autocomplete` for OpenAlex but
only `refs` for Crossref and OpenCitations.

The generated graph shows the same repetition as structure: the argument `id`
recurs across 14 commands, `entity` across 4; the verb `get` appears under 3
providers and `refs` across 4. One source names the smell in prose, the other
carries it as data, and nothing joins them.

The graph is also already stale against the code — it holds no `l3` or `arxiv`
commands, though `apps/cli/src/l3.rs` and `apps/cli/src/arxiv/` exist and the
TypeSpec models an `L3` interface. Detecting that a generated inventory has
fallen behind its source is the same comparison the Dataflow Designer makes
between a diagram and the live code (doc01.05.01).
