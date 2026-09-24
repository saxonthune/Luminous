---
title: Searchable Code Map
summary: Searchable Hemp artifact, explicit extraction and presentation stages, lazy function loading, and retained map positions.
tags: [hemp, pipeline, search, layout]
deps: [doc01.13.03, doc01.13.04, doc01.13.06]
---

# Searchable Code Map

The Hemp app opens both `.hemp.json` studies and `.hemp2.json` code maps.
The latter separates a searchable item/reference index from detailed function
chunks. It is an artifact format, not another app heading.

## Generate and open

```sh
just generate-hemp-map
just cli hemp map <workspace> <source-file> <output.hemp2.json>
just cli hemp map-binary <workspace> <package> <binary> <output.hemp2.json>
just generate-hemp-map-braincrawl
```

The fixture opens at
`http://localhost:5200/?app=hemp&src=.luminous%2Ffunction-map.hemp2.json`.
Search for `process_command`. Selecting a result moves the camera to that item
and emphasizes its direct dependencies. The Relationships control switches to
incoming usages; non-function item selection defaults to usages.

The resizable details sidebar shows the selected item's documentation, kind,
namespace and source location. Open in VS Code and Open in Zed appear at the top.
Source editor settings can override the generated checkout path for this view.

The PCB's atomic layer is now the item: compact cards show name, kind, available
line count, and direct dependency/usage counts. Control flow opens a single
floating, draggable inspector without moving or expanding the item. Closing it
leaves the map unchanged. Opening another function replaces this inspector.

Binary selection follows the existing workspace normal-dependency closure
described in doc01.13.03. It inventories source, not proven runtime reachability.
File selection analyzes the selected file, including its inline modules.
`hemp list` includes both artifact formats. `hemp read` and `hemp check` accept
map manifests; manifest checking does not fetch and validate all chunks.

## Data transformations

| Stage | Owner | Output |
|---|---|---|
| Cargo scope and semantic extraction | `scripts/hemp-items.ts` | Items, containment, source coordinates, resolved reference evidence |
| Syntax extraction | `tools/hemp-rust/src/bin/function-info.rs` | Ordered function and method bodies, signatures, spans |
| Normalization and source-span join | `scripts/hemp-map-analysis.ts` | `MapItem` facts and `FunctionInfo` connections |
| Serialization | `scripts/hemp-map.ts` | Manifest and content-addressed function chunks |
| Presentation | `mapPresentation.ts` in the Hemp app | Labels, kind colors, reserved visual sizes |
| Arrangement and retention | `scripts/hemp-map-layout.ts`, using cactus | Parent-relative saved rectangles |
| Search and relationship lookup | `packages/core/src/hemp/map.ts` | Search results and directed neighborhoods |
| Resource grouping | `functionResources.ts` in Hemp core | Branch-exclusive references and function-level shared references |
| Canvas projection | `HempMap.tsx`, `FunctionWindow.tsx` | Compact item cards, on-demand ordered details, highlighted references |

The orchestrator keeps I/O separate from the pure normalization, joining,
indexing, and presentation functions. The semantic inventory adapter is shared
with the earlier Hemp artifacts; the searchable map does not reuse their
container-disclosure state.

### Changing a struct's presentation

Appearance and wording belong in `presentMapItem` and the renderer. A new source
fact starts in the extractor that can establish it, gains a typed field on the
item record, passes through normalization and serialization, and becomes an
input to presentation. Normalization preserves existing inventory fields.
The UI does not parse Rust or infer missing semantic facts.

Large function-only facts belong in the function chunk rather than in the
initial symbol index. A property needed for search or overview belongs on the
manifest's item record. Updating a visual size policy requires an explicit
`--relayout` to repack saved arrangements.

## Artifact and loading

- The manifest records `format: "hemp2"`, source collection identity, analysis
  warnings, items, directed references, and a separate `layout` field.
- Each function item points to a sibling `*.hemp2-part.json` file containing
  `format: "hemp2-function"` and its `FunctionInfo`.
- Chunk filenames include a content hash. Generation writes chunks before
  replacing the manifest, so an open snapshot retains its referenced files.
- Copying an artifact requires its manifest and referenced sibling chunks.
  Unreferenced chunks remain on disk; generation does not delete them.
- The browser loads the manifest once and builds name and adjacency indexes.
  Function bodies load only when their control-flow window opens, with a bounded cache.
- Cactus culls offscreen rectangles. Lightweight rectangles can remain registered
  for routing without mounting offscreen item DOM trees. Zooming out never
  suppresses items. An open details window is independent of canvas zoom.

This implementation scans the rectangle index for viewport changes and uses
in-memory substring search. It does not claim bounded memory for arbitrarily
large manifests. The fixture exercises the end-to-end path; large-codebase
performance requires measurement.

## Persistent locations

The generated layout is stored in the manifest separately from analysis facts.
Regeneration of the same collection reuses saved anchors. Initial arrangement
packs contained items and arranges root regions left to right using their
cross-region references. Coordinates are relative to the containing item.

New siblings are appended beside saved siblings. Growing content enlarges its
reserved rectangle and ancestors without changing existing anchors. A warning
identifies changes that can cause overlap. `--relayout` discards saved geometry
and computes a fresh arrangement. Search and focus never write layout.

Item identity comes from the inventory's crate/module/item path. Ordinary line
shifts preserve identity. Renames, ownership changes and ambiguous duplicate
definitions can change it; duplicate disambiguation can include a source line.
Function-part IDs describe one extracted snapshot, not durable identities
across arbitrary body edits. Collection identity includes the source root and
selection; relocation is not automatically reconciled.

## Interpretation and limits

The soldered PCB principle applies to the atomic item layer. Finer syntax is
inspected separately, not expanded inline. Zoom changes scale, not semantic
visibility or reserved locations. The earlier standalone function study remains
available as a separate experiment.

The details window preserves syntax order. Each resolved target is assigned to
its nearest match arm or if/else branch. Repeated uses in the same branch produce
one resource block. A target used in multiple branch scopes, or outside branches,
appears once at function level. Nested branch sharing also promotes to function
level in this limited version. These are static references, not runtime resource
consumption, local-variable data flow, or liveness. Local-variable references are
not yet extracted. Signature-only references remain on the PCB, not body blocks.

The compact presentation needs `--relayout` once for previously generated large
function footprints. The bundled function-map fixture has been repacked; later
generation retains those new positions as usual.

Highlighted edges are direct resolved item references, with arrows from using
item to used item. They attach to item headings; the function's per-part
connection annotations preserve more precise evidence. A reference is not proof
of execution or complete value flow. External targets, macro-generated bodies,
dynamic dispatch and analysis configuration retain the extractor's limits.
Default trait bodies and impl methods are extracted where they match the
semantic inventory. Missing bodies are reported in analysis warnings.

## Input bindings

| Input | Action |
|---|---|
| Search field | Search names and namespaces across indexed items |
| Enter in search | Focus the first result |
| Escape in search | Clear the query |
| Search result or item heading | Focus the item at its saved position and show its details |
| Item content | Select the item and show its details without moving the camera |
| Dependencies / Usages | Select outgoing or incoming direct references |
| Fit connections | Fit the focused neighborhood's headings |
| Clear focus | Remove highlighting without rearranging |
| Fit map | Fit the complete saved extent |
| Wheel on canvas | Zoom without hiding PCB items or changing an open details window |
| Background drag or middle drag | Pan |
| Function connection annotation | Focus its referenced item |
| Open in VS Code / Open in Zed | Open the selected item's source location in that editor |
| Sidebar divider drag or Left/Right when focused | Resize the details sidebar |
| Control flow on a function item | Open its ordered details in the floating window |
| Floating window header drag | Move the window without moving PCB items |
| Close control flow | Close the floating window |
