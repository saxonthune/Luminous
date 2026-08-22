---
title: Idea
summary: A canvas app for designing a program as a dataflow diagram — boxes with prose descriptions and optional data contracts, grown by unfolding differentiation from one source and one artifact
tags: [dataflow, apps, unfolding, design]
deps: [doc01.04, doc01.05.02]
---

# Idea

The Dataflow Designer is a Luminous app (doc01.04) for designing a program as a
dataflow diagram before the program exists. A user or agent draws boxes and
connects them; data flows from sources through transforming boxes into views.

The diagram is a meta-interface: it carries the design's *intention*, and the
live code is compared against it, so drift between the two is detected by
deterministic analysis rather than by rereading prose.

The app owns its own document format. The graph-and-pack model belongs to
Luminous Canvas, not to the platform: each app decides what it reads and
writes, and cactus renders whatever projection the app makes of it. The app
is an opinionated filter on cactus capabilities, not a schema layered over
them.

Each box carries:

- a **name** — a domain term the rest of the design inherits;
- a **prose description** of what the box is;
- optionally an expandable **contract** (JSON or similar) that describes the
  shape of the data the box holds or emits;
- optionally **rules** for how the box filters or transforms the data that
  passes through it.

Design proceeds by unfolding differentiation: start with the simplest diagram —
one artifact fed by one source — and add boxes, sources, and views only when
the design demands them. A worked unfolding, drawn from the bracket-game case
(doc01.05.02):

1. A bracket of teams, fed by a JSON file of standings. Two boxes, one edge.
2. An enrichment step differentiates out between them; a team list joins the
   standings as a second source.
3. A scorer differentiates out between the bracket and the enriched standings;
   user brackets join as a third source.
4. Views differentiate out on the far side: a standings view, a bracket view,
   a leaderboard.
