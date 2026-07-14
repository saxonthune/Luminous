# Dataflow example documents

## Motivation

The app should open onto something real. The founding example is the
fifa-bracketing dataflow, drawn as four unfolding panels (doc01.05.01 idea,
doc01.05.02 case study — read via `rhidoc cat doc01.05.01` and
`rhidoc cat doc01.05.02`). This phase commits the four panels as example
documents and guards them with a parse test. Phase 5 (final) of the
dataflow-designer chain.

## Do NOT

- Do NOT invent boxes, names, or flows beyond what the four panels and the
  case study state — transduce, don't editorialize.
- Do NOT touch any package source code except the one new test file.
- Do NOT put layout, positions, or colors in the documents.

## Plan

### 1. Four example documents in `.canvases/`

`fifa-part-1.dataflow.json` … `fifa-part-4.dataflow.json`, valid per
`@luminous/core/dataflow` parsing. Content per panel (names verbatim;
descriptions one to two sentences drawn from doc01.05.02's dataflow section):

- **Part 1**: "Json w/ standings" (the maintainer's results feed; give it a
  `contract` block, `format: "prose"`, listing the standings file's fields —
  `v`, `resolved` as ref/team pairs) → flow → "Bracket w/ teams" (description:
  what the end user sees — a knockout bracket with each match's teams and
  results).
- **Part 2**: adds "Enriched data" between them and a second source
  "Team list" flowing into it (standings and team list both flow into
  Enriched data; Enriched data flows to the bracket).
- **Part 3**: adds "Scorer" between "Enriched standings" and the bracket, and
  a third source "User brackets" flowing into Scorer.
- **Part 4**: views appear — "Standings view", "Bracket view", "Leaderboard" —
  fed from the score/enriched side, with the three sources ("Standings",
  "Team list", "User brackets") upstream, mirroring the fourth panel.

Panels are separate documents on purpose — each is one snapshot of the
unfolding, so a reader can step through them.

### 2. Parse guard — one test in `packages/core`

A test file next to the existing dataflow tests that globs
`.canvases/*.dataflow.json` from the repo root and asserts
`parseDataflowDocument` accepts each and `checkDocument` reports no errors
(warnings are fine — sources trigger none, but do not assert on warnings).

### 3. CLAUDE.md

One sentence in the project-structure section of `CLAUDE.md` noting the
second app: the Dataflow Designer (`src/apps/dataflow/`), a read-only viewer
of `*.dataflow.json` documents, with a pointer to doc02.23.

## Files to Modify

- `.canvases/fifa-part-1.dataflow.json` … `fifa-part-4.dataflow.json` — new
- `packages/core/src/dataflow/` test file — the glob parse guard
- `CLAUDE.md` — one sentence

## Verification

```bash
just test-core
just test-e2e
just lint
```

## Out of Scope

- Any rendering or app changes.
- The full fifa dataflow with every transform (`prunePicks`,
  `encodeBracket`, …) — the four panels stay at the sketch's granularity.

## Notes

- Phase 4's fixture `sample.dataflow.json` already exists; leave it (the e2e
  test uses it).
- Names must match the glossary register: plain box names as the sketch wrote
  them; ids fall out of `addBox`-style kebab-casing.

## Surface after this phase

- Four `fifa-part-N.dataflow.json` documents in `.canvases/`, all parsing
  clean with zero check errors.
- A core test permanently guards every committed `.dataflow.json` example
  against the parser.
- CLAUDE.md names the Dataflow Designer app.
- Negative space: no package source changed except the one test file.
