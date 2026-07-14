---
title: CLI Grammar Workbench
status: draft
summary: "A special-purpose Luminous app for thinking about CLI grammars — AI builds the bulk of the grammar, the human fiddles with names and subcommand hierarchy, and a shared specification format serves both access patterns as the source of truth"
tags: [research, cli-grammar, workbench, packs, dogfooding, labor]
deps: [doc01.01, doc02.11, doc02.14, doc03.06]
date: 2026-07-12
---

# CLI Grammar Workbench

## The intention

I need a tool that gives me — a human user — a GUI for thinking about CLI grammars.
The division of labor is fixed by what each party is good at:

- **The AI agent builds the bulk of the grammar.** It enumerates verbs, arguments,
  and flags from the source, keeps the specification synchronized with the binary,
  and drafts new operations.
- **The human fiddles with names and the hierarchy of subcommands.** Which verb is
  top-level and which nests under a namespace, what a flag is called, when four
  near-identical operations should collapse into one — these are judgment calls
  about vocabulary and shape, and they are the part of the work I actually want
  to do.

Between the two sits a **specification**: a grammar format that both parties read
and write. The format must be built for the access patterns of the application —
the human's edits (rename, regroup, merge, annotate) and the agent's edits (add an
operation, synchronize against source) are different operations, and the format
should make both cheap. The agent then uses this specification as the **source of
truth while building** the CLI itself.

## Where this came from

The braincrawl repo is running the experiment by hand. Its CLI grammar is modeled
twice at the repo root — `braincrawl-cli.tsp` (TypeSpec) and `braincrawl-cli.smithy`
(Smithy) — as protocol-neutral specs kept in sync with every new verb. The
interesting content in those files is not the enumeration; it is the marginal
judgments: "provider is encoded in the interface name, not a parameter — the
provider-as-branch smell"; "the four `*Refs` operations are byte-for-byte identical
except for the name — prime candidates to collapse." Those annotations are exactly
the hierarchy-and-naming work the human wants a surface for. Today that work
happens in code comments and in prose question-and-answer with an agent
mid-session — a multiple-choice conversation about whether `config` should be flat
or take subcommands. That interaction is the drudgery-shaped thing the tool
replaces.

## Why Luminous

I have already tried to do this with Luminous, and I don't actually use it — not
because the canvas is wrong, but because I never made the **special-purpose CLI
grammar app**. A general canvas gives the domain no verbs. The missing piece is an
app that could work separately from the main Luminous app — another app built on
top of cactus — whose pack, views, and operations are specific to CLI grammars.
This use case is what I want to use Luminous *for*.

## The thesis: labor intensification

If AI coding takes away the drudgery of coding, then software production should
show an **intensification of labor**: the human's hours concentrate on the
judgment work that remains. What's missing is the tool — in this instance a user
interface — that centralizes the new features of this intensified labor in one
place. In other words, we need an **assembly line or workshop that matches the
reality of post-AI software production**.

The CLI grammar workbench is one station of that workshop. The general pattern:
find a class of judgment work the human retains (here: naming and hierarchy),
give it a purpose-built surface, and let the specification carry decisions
between the human's surface and the agent's build loop.

## Open questions

- **What are the operations?** An inventory of the human's edit gestures and the
  agent's read/write patterns over a grammar, before any format decision — the
  format falls out of the access patterns, not the other way around.
- **What is the pack vocabulary?** Node kinds (namespace, verb, positional,
  flag, shared flag set, enum), edge kinds (contains, shares-flags,
  same-shape-as), and what a "smell" annotation is on the canvas.
- **Is the graph the spec, or a projection of it?** Whether the canvas file is
  itself the source of truth the agent builds from, or a view over a grammar
  file in another format (TypeSpec, Smithy, custom JSON).
- **Drift as first-class state.** The braincrawl skill already refuses to
  hand-maintain a command table because it drifts from the binary. Can the
  workbench show spec-vs-implemented drift directly?
- **The gauge example.** braincrawl's real grammar is the candidate first
  canvas — hand-build it in the pack, run a real fiddle session (the pending
  flat-vs-nested and collapse-the-provider-interfaces decisions), and record
  every friction, in the doc02.10 examples-as-gauges pattern.
