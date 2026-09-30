---
title: Static Inspector
summary: Pipeline-produced Rust crate and module inventory, dependency evidence, draggable nodes, LR arrangement, and CLI access.
tags: [hemp, rust, pipeline, cli, dependencies]
deps: [doc01.13.01, doc01.13.04]
---

# Static Inspector

The searchable, fixed-position `.hemp2.json` map and its pipeline are described
in doc01.13.07. It shares the Hemp app heading with the inspector described here.

Hemp reads `*.hemp.json` documents produced from a Cargo workspace. The
document contains crate targets, modules, source locations, documentation
comments, dependency evidence, analysis limits, saved positions, and crate-container frames.
Hemp has its own document model; it does not use Canvas packs.
User-supported requirements are captured in doc01.13.04.

## FunctionInfo extraction proposal

The conceptual model and extraction pipeline are in doc01.13.06. `FunctionInfo`
is an experimental per-function record, not a fixed schema.

`just generate-hemp-function` produces `.luminous/function-study.hemp.json`
from `process_command` in `tools/hemp-fixture/examples/function_board.rs`.
The general command is `just cli hemp function WORKSPACE FILE FUNCTION OUTPUT`.
The syntax helper accepts a uniquely named free function in one source file;
this experiment does not extract methods by name or follow out-of-line modules.
The semantic inventory resolves references to items in the selected file.

The artifact retains the regular Hemp item graph and adds `functionInfo` with
a source-order body tree, signature, namespace, inclusive source-span line count,
and connections from body parts to resolved graph items. Namespace comes from
the selected inventory's parent chain; its root is the source filename, not a
complete Cargo-qualified path. Other expressions retain source text instead of
invented semantics. Local value flow and external definition targets are excluded.
Connections retain the existing inventory's per-edge/per-line evidence granularity.

An artifact with `functionInfo` opens as a fixed function board. Statements run
top to bottom; match arms occupy adjacent regions; all represented descendants
remain visible. There are no disclosure buttons, drag handles, or saved internal
positions. The camera supports pan and zoom. This is a source-shaped view, not
a complete CFG or an execution trace. It does not change existing graph documents.

| Target | Interaction | Result |
|---|---|---|
| Function board | Drag | Pan the camera without rearranging internal elements |
| Function board | Wheel | Zoom without hiding or expanding structure |
| Function toolbar | Fit function | Fit the whole board into the viewport |
| Function toolbar | 100% | Center the board at its unscaled size |

## Inspection

The workspace view displays library and binary crate targets. Each card names
its package and target kind. Selecting it exposes the full identity, source,
documentation, and direct dependencies or dependents. A module dependency
between crates contributes to the corresponding workspace edge.

All crate cards share a draggable, manually resizable overview container. Its
saved rectangle is `crateOverview`; crate positions remain workspace coordinates.
Dragging the overview moves its crate cards, not their separate contents frames.
Solid dependencies are displayed within the crate layer or within the item layer,
never between a crate and a non-crate item. Filtering affects only the canvas;
dependency evidence remains available in the inspector. Dashed ownership links
still connect crate cards to their expanded contents.

The Modules button creates a crate-container (doc01.13.05) beside the crate
graph, without navigating away. A thick dashed Bézier edge connects the frame to its
crate. The frame holds the crate's modules and their internal dependencies.
Cards show names and target kinds; descriptions appear in the sidebar on selection.
Nested module identities retain their parent paths; the inspector identifies
the selected module unambiguously. Cross-crate dependencies remain accessible
in the selected node's inspector.

Dragging a crate-container's header moves the frame and its modules together.
Modules can be dragged within its bounds, without automatically resizing it.
The bottom-right corner handle resizes the frame; shrinking stops at the
contained modules. The close button removes the frame from the canvas, not the
source inventory. Crates and modules share the main canvas camera.

Arrows point from consumer to dependency: a function using a constant points
toward that constant. Container backgrounds paint below edges, and item cards
paint above edges. Dashed owner-to-container connectors remain undirected.
Arrange LR delegates to cactus's DAG
layout, placing consumers such as the CLI before their dependencies. Dragging
changes a card's position; arrangement and dragging save to the document.
Module positions are local to their crate-container; frames have saved workspace
positions and sizes. Module cycles
can produce backward edges; arrangement does not assert that all imports form
a DAG.

The description sidebar renders Markdown headings, lists, code, links, and
tables. Tables and code blocks can scroll horizontally. Dragging the sidebar's
left boundary changes its width so longer descriptions remain readable.

Dragging a selection box on the background selects cards. Dragging any selected
card moves the selected cards together, preserves their relative positions, and
saves their positions together. The toolbar reports the multi-selection count.

| Target | Interaction | Result |
|---|---|---|
| Card | Click | Select and inspect documentation and dependency evidence |
| Card | Drag | Move and save its position, together with other selected cards |
| Card | Shift/Ctrl/Cmd-click | Toggle membership in the selection |
| Canvas background | Left drag | Box-select cards |
| Canvas background | Right drag | Pan the canvas |
| Crate card | Modules button | Create a crate-container on the same canvas |
| Crates overview header | Drag | Move the overview and its crate cards together |
| Crates overview bottom-right handle | Drag | Resize the overview manually |
| Crate-container header | Drag | Move the frame and its modules together |
| Module card | Drag | Move within the fixed-size crate-container |
| Crate-container bottom-right handle | Drag | Resize the frame manually |
| Crate-container header | Close button | Remove the frame from the canvas |
| Item contents container header | Drag | Move the frame and its contained cards together |
| Item card inside a container | Drag | Move within the fixed-size container |
| Item contents container bottom-right handle | Drag | Resize the frame manually |
| Item owner card | Expand/Collapse button | Reveal/hide its contents and collect hidden endpoints onto the visible owner |
| Item contents container header | Collapse button | Hide the contents frame while retaining its owner card |
| Top of selected item or body details | Open in Zed / Open in VS Code | Request that the local editor open the source location |
| Sidebar Source editor settings | Edit local repository root | Override the generated checkout path for editor links during this session |
| Toolbar | Arrange LR | Arrange and save the crate graph, or item contents and their containers |
| Toolbar | Fit | Fit the visible nodes in the viewport |
| Inspector dependency | Expand | Show import paths and source locations |
| Sidebar left boundary | Drag | Resize the description sidebar |
| Focused sidebar boundary | Left/Right arrow | Widen/narrow the description sidebar |

## Pipeline

`just generate-hemp` produces `.luminous/braincrawl.hemp.json` from the
gitignored `braincrawl` link. `just cli hemp generate <workspace> <output.hemp.json>`
accepts another workspace. The extractor requires Rust 1.94.0.

Cargo metadata supplies workspace packages, library/binary targets, and
declared normal dependencies between workspace packages. The Rust `syn` parser
follows module declarations and import paths. Documentation comes from Rust
doc attributes and Cargo package descriptions. Stable target/module paths
identify nodes; a rename changes identity. Regeneration preserves saved
positions and crate-container frames for surviving IDs and removes positions
and frames for deleted nodes.

This is a syntax-based inventory across conditional source. It excludes
`cfg(test)` module trees and dev/build dependencies. It does not evaluate
feature/target conditions, expand macros, resolve local aliases or re-exports
semantically, or infer method calls. Dependency evidence reports imports,
not execution or a complete reference graph. Missing module files appear as
analysis warnings. The analysis scope travels with the document.

## CLI and storage

### Module item graph

`just cli hemp items <workspace> <module-file-relative-to-workspace> <output.hemp.json>`
produces a semantic item graph, initially scoped to one source file and its inline
modules. For the Braincrawl example:

```sh
just cli hemp items braincrawl stem/crates/l3/src/ids.rs .luminous/braincrawl-ids.hemp.json
```

For selected packages across source files, use:

```sh
just generate-hemp-cli
# equivalent:
just cli hemp crates braincrawl braincrawl-cli braincrawl-cli-support .luminous/braincrawl-cli.hemp.json
```

The `crates <workspace> <package> [<package> ...] <output.hemp.json>` command
uses Cargo metadata to select library/binary targets and follows out-of-line
module declarations through analyzer definition resolution. Braincrawl's two
packages yield three crate cards: CLI library, CLI binary, and CLI-support
library. The artifact starts collapsed; expand a crate, then a module or item,
to reveal contents. Arrange LR lays out the visible overview without reserving
space for hidden frames. Use Arrange LR and Fit as you open larger contents.
References resolve across selected files and re-exports; definitions outside
the selected targets are excluded. A source file shared by multiple selected
module trees currently reports an error rather than guessing its context.

Install the analyzer with `rustup component add rust-analyzer --toolchain 1.94.0`.
The generator starts that analyzer locally over LSP. Cargo build scripts and
procedural macros may execute during workspace loading; use trusted workspaces.
Document symbols supply declarations and their logical containment. Reference
search and semantic-token definition resolution supply direct reference edges;
the latter follows renamed imports. This is semantic resolution, not spelling
matching. Reference-search results are checked against available definition
resolution to avoid conflating a trait's associated items with an implementation.
References include type and field uses, not just calls.

The artifact uses `projection: "items"`: all recorded items appear on the main
canvas. Each module retains its own red card and has a separate maroon-tinted
container holding its direct children. Other items with children use the same
owner-card and contents-container pattern. A nested module's card sits in its
parent's container, with its own contents in a separate frame. Dashed connectors
link owner cards to their containers; solid arrows point from referrer
to referenced item. Selecting a constant/static lists its direct users and source
evidence in the sidebar. Selecting any item also identifies its logical parent.
Existing drag, selection, Arrange LR, and Fit controls apply to this projection.
Container headers drag their contents together, and corner handles resize them.
Dragging children does not resize the container. Arrange LR arranges the contents
and the separate frames through cactus. Frames appear automatically in item graphs;
their dimensions and local child positions are saved with canvas edits.

Owner cards offer Expand and Collapse. Collapsing hides descendants and their
contents frames without deleting inventory, geometry, or deeper disclosure state.
References to hidden items attach to their visible owner. References sharing
the same visible endpoints collect into one arrow, retaining their counts in the
model without displaying canvas edge labels; references wholly
inside a collapsed owner are hidden. Opening restores the exact visible endpoints.
Selecting an owner exposes the original endpoints and evidence behind its visible
arrows. Counts are item-to-item reference relationships, not calls or executions;
module-name references count too. The optional `collapsed` array saves disclosure
independently of the underlying containment and reference relations.

`just generate-hemp-two-modules` produces `.luminous/two-modules.hemp.json` from
`tools/hemp-fixture/examples/two_modules.rs`. Its two inline modules, `orders`
and `pricing`, demonstrate shared constants, a cross-module function use, and
internal references. Collapse both modules to collect their cross-module edges;
expand either one to progressively reveal the underlying endpoints. The file's
root and `main` remain part of the inventory. This example exercises cross-module
disclosure in one source file, not multi-file extraction. Regeneration preserves
saved disclosure for surviving IDs.

Background colors identify Rust item kinds: functions are blue, methods teal,
constants amber, statics orange, structs green, enums violet, variants pink,
fields olive, traits indigo, impls slate, type aliases cyan, and macros coral.
Kind labels remain visible so color is not the only identity cue. Module contents
use a light maroon wash to preserve contrast with reference arrows. Every contents
container follows its owner's palette: blue for functions, teal for methods,
purple for matches, amber for arms, and corresponding shades for other kinds.

Functions and methods use larger rectangular cards. Non-function item kinds
use smaller stadium-shaped cards; crates and modules retain their structural
cards. Names and kind labels stay visible, with full names available on hover
and in the sidebar. Shape identifies a kind of item, not a dependency guarantee:
a constant can itself reference other items. Layout, hit-testing, edge attachment,
drag bounds, and frame resizing use the same per-kind dimensions.

Nodes include functions, methods, constants/statics, types, traits, impl blocks,
fields, variants, and modules exposed by the analyzer's outline. Hover content
provides signatures and documentation. `parent` is the containment relation;
`dependencies` with `kind: "reference"` are the reference relation. Saved positions
survive regeneration for surviving IDs. IDs use file, parent, kind and name;
duplicate declarations use a source-line suffix, so moving those may change IDs.

This is not yet a complete codebase inventory: `items` excludes external-file
module bodies, while `crates` follows them for selected library/binary targets.
Standalone integration tests, examples, build scripts, and external dependency
definitions are not inventoried by `crates`. References outside the selected
files are counted in coverage warnings. Macro-generated declarations, local variables,
and closure identities are not fully inventoried. Closure uses are attributed
to the enclosing recorded item. The active default Cargo configuration is used,
including test targets, rather than every possible feature configuration.
Reference edges do not assert execution, read/write effects, or a concrete dynamic
dispatch target. Empty results do not prove an item unused. Coverage warnings
travel with the artifact and are available in the unselected sidebar.

`just generate-hemp-items` regenerates the Braincrawl example.

### Function-body preview

`just generate-hemp-cli-complete` generates
`.luminous/braincrawl-cli-complete.hemp.json` from the CLI binary and its
transitive workspace library dependencies, with all inventoried function/method
bodies. The general command is:

```sh
pnpm exec tsx scripts/luminous-cli.ts hemp binary braincrawl braincrawl-cli braincrawl .luminous/braincrawl-cli-complete.hemp.json
```

Cargo's resolved normal-dependency graph selects packages for the current host
platform. The entry binary and library targets are included; other binaries,
dev-only packages, build dependencies, and third-party source definitions are
excluded. Default features are those resolved by the workspace, not an exact
per-binary compilation trace. Every inventoried function in the selected source
trees is included, including source test items exposed by the analyzer; this is
a conservative navigation inventory, not function-level dead-code elimination.
Macro-generated bodies remain outside the source-body extractor's coverage.
Nested matches, arms, branches, calls, and closures use the existing progressive
disclosure model. Containers start collapsed in a new file.

The older `cli-all-bodies` file covers only the explicitly selected CLI and
CLI-support packages; it does not follow their dependencies.

The 2026-09-20 complete snapshot contains 13 crate targets in 12 workspace
packages, 81 source files, 961 functions/methods, and 193 match expressions:
11,716 nodes and 8,745 reference edges, approximately 17 MB. New hidden body
frames retain local layouts but defer global placement until expansion; laying
out every hidden frame together exhausted a JavaScript collection limit in the
first larger run. The semantic analyzer is released before layout and writing.

`just generate-hemp-cli-bodies` creates a separate
`.luminous/braincrawl-cli-bodies.hemp.json`. It uses the same selected crates,
with `--bodies stem/apps/cli/src/main.rs` to inspect the top-level `main` and
`run` functions. Other functions retain item-level inspection. Expand the CLI
binary, then `main` or `run`, then their matches and arms.

`just generate-hemp-cli-all-bodies` creates
`.luminous/braincrawl-cli-all-bodies.hemp.json`, using `--bodies all` for
inventoried functions and methods across every selected source file (including
inline modules and trait default bodies). The original preview is unchanged;
`.luminous/braincrawl-cli-bodies.snapshot.hemp.json` preserves the pre-expansion
artifact and its saved arrangement. New artifacts start collapsed.

The measured CLI/CLI-support extraction on this checkout took 54 seconds,
with `/usr/bin/time -v` reporting approximately 5.8 GiB maximum resident memory.
It produced 3,174 nodes and 1,573 relationship edges across 16 source files.
These are local measurements, not a whole-workspace estimate: semantic workspace
loading and reference resolution depend on dependencies and Cargo configuration,
not just selected source size. Body parsing adds syntax nodes without a semantic
request for each new node. Full-workspace scaling remains unmeasured.

A small `syn` visitor adds source-shaped matches, arms (with pattern/guard
labels), if/then/else regions, closures, and call expressions. These are syntax
nodes, not additional Rust items. Containment records where each call occurs;
rust-analyzer resolves identifiers to the inventoried definitions. Call edges
use `kind: "call"` and are labeled Calls/Called by in the inspector. Ordinary
reference edges remain distinct. Collapsing a body owner collects its endpoints
using the existing disclosure behavior. Calls to definitions outside the
selected inventory remain visible call sites but have no target edge.

This is **not a complete control-flow graph**: there are no sequencing edges,
loop backedges, early-return/`?` paths, async scheduling, or macro expansion.
Closures have a separate deferred-body container, not an implied immediate call.
The parser traverses other expressions without representing each operation.
Call nodes can also represent constructor or indirect call syntax; only
resolved function/method targets get call edges. Body IDs are traversal-based
and may change when source is edited.

New preview containers carry `unplacedContainers` until first expansion, when
cactus places them near the visible owner using visible obstacles. The saved
position is retained on subsequent collapse/expand. This avoids revealing a
first-use frame at its hidden full-graph layout position.

Source records can include one-based `column`, `endLine`, and `endColumn`.
The generated `analysis.sourceRoot` is a local checkout hint; file paths remain
repository-relative. The sidebar provides native `zed://file` and
`vscode://file/` links directly below the selected node's title, before its
description, and a session-local root override. The OS/browser must
have the editor protocol handler registered and may prompt for permission.
These links open on the browser's computer, not on a remote storage server.
No server command-execution endpoint is added. The current link builder handles
absolute POSIX checkout paths; older artifacts without the hint need a root
entered in the sidebar.

The focused semantic regression check is `just test-hemp-items`.
It uses a small Cargo fixture to check direct references, aliases, shadowing,
containment, const/static distinctions, and cross-file binary/library references
through re-exports without browser automation. The multi-file example advances
the existing item-graph scope in HEMP22; containment, references, and disclosure
retain the behavior recorded in HEMP23–24 and HEMP33–34.

`just cli hemp` prints command help. The CLI offers `generate`, `list`, `read`,
`items`, `crates`, `check`, `write`, `layout`, and `move`. Storage commands accept `--server URL`;
layout and move accept `--scope <crate-id>` for a module view and `--dry-run`
to inspect the resulting document. Move coordinates are absolute within the
selected view. There is no Hemp MCP interface.

The UI and CLI share parsing, projection, layout, and movement rules. The
server stores the document as raw JSON and broadcasts file changes. Writes
replace the whole document; concurrent editors have no revision conflict
protection. The static demo keeps edits in memory.
