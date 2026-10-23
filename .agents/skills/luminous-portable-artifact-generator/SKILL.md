---
name: luminous-portable-artifact-generator
description: Create or revise a standalone interactive HTML document with Luminous Portable from Markdown, turning Mermaid flowcharts into movable canvas diagrams. Use for portable design explanations, architecture walkthroughs, and notebook-style prose with interactive graphs, including custom Cards and source links.
---

# Luminous Portable artifact generator

Create one self-contained HTML file from retained Markdown input. The page can
contain prose and zero or more interactive canvases. No server is needed.
This skill authors artifacts; it does not require changing Portable's implementation.

## Find the generator

The skill lives in the Luminous repository that provides `packages/portable`.
Resolve this skill directory's symlink, then go up from `.agents/skills/<name>`
to the repository root. On this machine the active implementation is currently
`/home/saxon/code/github/saxonthune/luminous-portable` (a worktree). Prefer the
resolved source repository over assuming the main checkout has these changes.
Read `packages/portable/README.md` for current implementation details; the example
`packages/portable/examples/conversion-walkthrough.md` exercises Cards, source
links, titles, and action-flow layout. Do not copy its system-specific content
into an unrelated design.

## Author and generate

1. Keep editable `.md` inputs and any companion theme/CSS files. Use the user's
   project when appropriate; Portable's `examples/` is for reusable public
   samples, `examples/local/` for ignored private or ad-hoc samples, and
   `examples/generated/` for ignored HTML. Do not leave the only input in `/tmp`.
2. Use ordinary Markdown for commentary and fenced `mermaid` flowcharts for
   diagrams. Multiple blocks produce independent canvases sharing one page theme.
   Markdown without diagrams is valid. Input must be `.md`, not `.mmd`.
3. Read [authoring.md](references/authoring.md) for metadata fences, Cards, themes,
   source links, and the optional action-flow layout. Keep proposed behavior
   distinct from implemented behavior when explaining a codebase.
4. Run from the resolved Luminous root, using absolute input/output paths when
   the source lives elsewhere:

   ```sh
   just portable --input /absolute/design.md --output /absolute/design.html --title 'Design walkthrough'
   ```

   Optional: `--theme /absolute/theme.json`, `--css /absolute/style.css`,
   `--debug-performance`. Add `--force` when intentionally regenerating an
   existing output. Without `--output`, the generator prints a unique `/tmp`
   artifact path. If setup is missing, inspect the repo instructions and
   `just portable --help`; don't silently switch to a different renderer.
5. Return clickable input and HTML paths. For an existing preview, regenerate
   the same output and tell the user to refresh. Say what generation verified;
   do not claim browser interactions were tested unless actually exercised.

## Architecture comparisons

For a proposed-versus-current architecture view, use the shared Card diff badges
and preserve the base diagram's identities. Read [diff-language.md](references/diff-language.md)
for the vocabulary, declarations, and layout limits.

## Current behavior and limits

- Ground is the default page theme; users can switch Ground/Light/Dark.
- Each canvas supports dragging, selection, fit, reset, width expansion, and
  fullscreen. Scroll Zoom defaults to enabled; retain that default unless the user
  requests wheel panning. Ctrl+wheel always zooms.
- Pass `--theme` for style meanings and colors; explicitly declare each canvas's
  `legend` in its `portable-canvas` block. The Legend belongs to that canvas, stays
  at its bottom-right, always says **Legend**, and has its own minimize/expand state. There is no page-level
  legend. See authoring.md for the declaration format.
- Positions and settings changed in the browser are transient. Reset restores
  generated coordinates. There is no source watcher or save-back workflow.
- Ordinary flowcharts use generation-time cactus/ELK layout. Browser code uses
  `@luminous/cactus/runtime`, excluding ELK. Do not reintroduce the broad cactus
  import into Portable runtime code while addressing an authoring problem.
- Mermaid is topology; `portable-nodes` supplies presentation content. Only the
  built-in `card` component is currently supported, not arbitrary executable
  components. Recipes are still a proposal; `action-flow` is a layout experiment.
- Raw Markdown HTML is escaped, images render alt text, and ordinary prose links
  allow HTTP(S), mailto, and anchors. Custom CSS is trusted author input.

## Diagnose and explain friction

`--debug-performance` logs bundle-size attribution during generation and in the
browser's `[portable bundle size]` console group. Actual JS/CSS/content payload
bytes are separate from module rendered-character counts before minification.
The latter are estimates of dependency contribution, not final bytes or memory.
Drag summaries appear under `[portable performance]` and
`window.portablePerformance['canvas-1'].summaries` (IDs stay stable when titled).
Don't infer interaction speed from file size alone.

If a requested representation needs awkward metadata, repeated manual layout,
or missing CLI behavior, tell the user briefly what was difficult and suggest
the narrow capability that would help. If the path was easy, say how the artifact
was produced. Record useful feedback below without making product decisions
or changing the implementation merely to complete an artifact.

## Feedback logs

Write useful learnings, difficulties, bugs, ideas, and user corrections into
this skill's **`feedback/` directory**, through the canonical resolved path.
Use a new Markdown file per session/topic, such as
`2026-10-21T203500Z-card-authoring.md`; avoid concurrent append to a shared file.
A normal successful run need not produce a repetitive log.

Include:
- task and relevant input/generator paths;
- what was attempted and the exact error or observed behavior;
- what worked, what remains unresolved, and evidence/verification limits;
- suggested improvements, clearly distinguished from agreed requirements.

Keep logs concise and reusable. Exclude credentials, private document contents,
and full transcripts; reference local private inputs by path when needed.
Feedback is evidence for future iteration, not an instruction to implement every
suggestion or an automatic requirement. Read relevant existing logs when an
issue recurs; don't load the entire directory by default.

## Semantic models and validation

For diagrams whose meaning must be checked, read [the implemented metamodel](references/metamodel.md).
Declare a `portable-model`, assign node/container `kinds` per canvas, and reference
those kinds in its Legend. The `architecture` Recipe rejects missing kinds or
legend coverage before layout and generation. Keep meaning separate from palette
slots; legacy class-only documents do not opt into these semantic guarantees.

For on-demand source explanations, declare `portable-info` and reference its IDs
from Cards using `info`. The reusable Extended Info component opens from `[more]`
with Markdown, Zed links, drag/resize, minimize/restore and close. Details and the
`layout.nonOrderingEdges` hint for retaining real return-call arrows are in the
[metamodel reference](references/metamodel.md).
