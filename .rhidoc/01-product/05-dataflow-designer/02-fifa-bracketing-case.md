---
title: The fifa-bracketing case
summary: The motivating case — a bracket-game app built human-with-agent in one evening; the build succeeded, but its largest tax fell exactly where vocabulary and data flow were not visible early
tags: [dataflow, case-study, fifa-bracketing, vocabulary, glossary]
deps: [doc01.05.01]
---

# The fifa-bracketing case

fifa-bracketing is a friends' World Cup bracket-prediction game: an entrant
fills out a knockout bracket in a Builder and gets a URL-safe share code; a
maintainer curates the submitted codes and pushes real tournament results as
matches resolve; the app renders each bracket against reality and ranks
entrants by points. It was built human-with-agent in one evening under a
differentiation-first process ("DA"): the human decides the few load-bearing
questions, ranked by fan-out × irreversibility, and the agent executes
everything downstream.

## The dataflow

The app is a dataflow: sources feed pure transforms feed views. This is the
diagram a Dataflow Designer canvas of the project holds.

Sources:

- `structure.json` — the static knockout skeleton (`TournamentStructure`).
- `teams.json` — the team registry (`TeamRegistry`); registry order is
  load-bearing because the share-code encoding indexes teams by it.
- `currentStandings.json` — the maintainer's reality feed (`CurrentStandings`),
  refreshed by a cron script that pulls a public results API and redeploys.
- `pinned.json` — the curated list of share codes; the one source fetched at
  runtime.
- User input — bracket picks, entrant name, a pasted share code.

Transforms (pure functions):

- The resolve functions compose structure + standings + registry — and, for an
  entrant's bracket, picks — into `ResolvedMatch[]`, the display-ready model
  every bracket renderer shares.
- `prunePicks` drops picks that an upstream result makes illegal.
- `encodeBracket` / `decodeBracket` carry a `UserBracket` to and from a share
  code.
- `scoreBracket` grades a bracket against reality into a `BracketScore`.
- `bracketLayout` computes positions from the structure alone.

Views:

- **Tracker** renders reality — no picks, no scoring.
- **Builder** renders picks in progress and emits a share code.
- **Viewer** decodes a share code, renders the bracket, and shows its score.
- **Leaderboard** fetches the pinned list, scores each entry, and ranks them.

## Where the build paid its tax

The project's painpoint log records one recurring disease: the agent authored
the upstream layer that was the human's to decide. It named domain types
silently and weakly (`Structure`, `Results`, a vague `Provider`, one `Bracket`
doing duty for both an entrant's picks and the live tournament state); it
invented scope (a leaderboard nobody asked for) and abstractions (a resolver
module that appeared in the tree unauthorized); and it stood up a contract-doc
tree that restated the type shapes and drifted from them immediately.

Fan-out happened on top of those silent choices, so every weak name had to be
caught, renamed, and re-swept across every artifact that had inherited it. The
retrospective's verdict: the process worked — coarse idea to a shared, working
app in one evening — but the single largest tax was naming churn, and the
corrective is one sentence: the shared vocabulary should have been locked,
under human control, before any fan-out, paired with a data-flow pass — what
types each surface starts with, how they flow through the pure functions, what
each view receives.

The contracts converged to two surfaces: a glossary owning names and intent,
and `types.ts` owning shapes, once. A doc points at the type for fields and
never restates them.

## The gap the Dataflow Designer fills

The corrective — a human-controlled vocabulary plus a data-flow pass, before
fan-out — is exactly the artifact this app edits. The diagram makes the data
flow and the vocabulary visible while both are still cheap to change:
a box name is a domain term stated once, on a surface the human can see and
rename, instead of a word an agent coins in passing and every downstream
artifact inherits. Before code exists, a box's contract is the design's only
shape surface, held next to the edges that show who consumes it.
