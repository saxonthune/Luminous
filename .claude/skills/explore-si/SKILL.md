---
skill: explore-si
description: |
  Self-improving Explore. Runs a broad read-only fan-out search like Explore mode,
  then identifies where missing, stale, or confusing docs slowed the search down,
  and applies fixes so the next exploration is faster.
  Use when the user wants to explore a codebase question AND leave the docs better
  than they found them — "explore X and improve the docs", or invoked as /explore-si.
version: 1.0
author: Claude
tags: [explore, search, docs, self-improving, codebase]
---

# ExploreSI — Self-Improving Explore

ExploreSI does what Explore mode does — a broad fan-out search across many files,
returning the conclusion rather than file dumps — and then closes the loop: it
records every point where the docs failed the explorer, and fixes them so the
next explorer moves faster.

The premise: each exploration is a stress test of the repo's navigational docs.
Where the explorer guessed wrong, backtracked, or couldn't find an index, the
docs have a gap. ExploreSI captures that signal and acts on it.

## Phases

### Phase 1 — Explore (read-only)

Launch an `Explore` agent with the user's question. Use `model: "sonnet"` (Explore
is broad, shallow reading — Sonnet is the right cost/speed point).

Add this instruction to the Explore agent's prompt, on top of the search task:

> While exploring, keep a **friction log**. Each time the docs slow you down,
> record one entry: what you were looking for, what you expected to find and
> where, what you actually had to do instead. Friction includes: no entry-point
> doc or index; a CLAUDE.md / README that omits a key directory; stale paths or
> renamed symbols in docs; naming conventions you had to infer from code because
> nothing stated them; a `.carta` spec that contradicts the code.
> Return TWO sections: (A) the answer to the search question, (B) the friction
> log as a list. If there was no friction, say so explicitly.

### Phase 2 — Return findings to the main agent

When the Explore agent returns, immediately relay **section A (the answer)** to
the user. This is the thing they asked for — do not make them wait on doc work.

Then summarize **section B (the friction log)** to the user as a short list of
proposed doc changes, e.g.:

> Doc improvements queued (running in background):
> - `packages/cactus/README.md` — add the `src/` layout, none documented
> - `CLAUDE.md` — `tsgo` path note is stale, points at removed script

If the friction log is empty, say so and stop — there is nothing to improve.

### Phase 3 — Apply doc improvements (background)

Launch a background `Agent` (`subagent_type: "general-purpose"`,
`run_in_background: true`) that applies the friction-log fixes. Pass it the full
friction log and these rules:

**Scope — what may be edited:**
- Agent-context / navigational docs: `CLAUDE.md`, `AGENTS.md`, `README.md`,
  package-level docs, and code-navigation comments. Edit directly.
- `.carta/` specs: in scope, but **must** go through the `carta` CLI for
  structural changes and `carta regenerate` after frontmatter edits. Content
  edits to existing spec bodies may be direct. Follow the rules in `CLAUDE.md`.

**Constraints:**
- Each change must trace to a specific friction-log entry. No speculative edits.
- Fix what the explorer needed: add the missing index, correct the stale path,
  state the convention that had to be inferred. Keep edits minimal and in the
  voice of the surrounding doc.
- If a friction entry reveals a contradiction between a `.carta` spec and the
  code, do NOT silently rewrite the spec — flag it in the agent's final report
  for the user to resolve. Specs are a source-of-truth bridge.
- Do not commit. Leave changes in the working tree for the user to review.
- Final report: list each file touched and the friction entry it addresses;
  separately list anything flagged but not changed.

## Why background

The user wanted an answer to a search question. Phase 1+2 deliver that on the
critical path. Phase 3 is a tidy-up that benefits *future* explorations — it
should never block the user reading their answer, so it runs detached.
