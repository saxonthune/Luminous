---
title: Requirements
summary: User-supported Hemp requirements for the static Rust inventory, canvas interaction, descriptions, and CLI access.
tags: [hemp, requirements, rust, cli, markdown, selection]
deps: [doc01.13.01, doc01.13.03]
---

# Requirements

These requirements capture the user's Hemp requests. `[p]` means wording and
placement are pending review, independently of implementation. Source evidence
and capture revisions are recorded in `.grn/events.jsonl`. Implementation and
input bindings are described in doc01.13.03.

## Rust inventory

- **HEMP1.** [p] Hemp provides a static inspector for Rust code.
- **HEMP2.** [p] A pipeline produces braincrawl.hemp.json for Hemp.
- **HEMP3.** [p] For the static milestone, Hemp shows crates.
- **HEMP4.** [p] For the static milestone, Hemp shows modules.
- **HEMP5.** [p] For the static milestone, Hemp shows dependencies.

## Canvas interaction

- **HEMP6.** [p] When the user requests automatic arrangement with a button, Hemp arranges crates left to right in a DAG layout with the CLI on the left.
- **HEMP7.** [p] The user can drag nodes on the Hemp canvas.
- **HEMP13.** [p] The user can box-select nodes on the Hemp canvas.
- **HEMP14.** [p] When the user drags a selected node, the selected nodes move together.

- **HEMP21.** [p] Node names, type labels, and action labels use substantially more of the available node area for larger text.

## Descriptions

- **HEMP10.** [p] Hemp renders descriptions as Markdown.
- **HEMP11.** [p] Hemp renders Markdown tables in descriptions.
- **HEMP12.** [p] The user can drag the description sidebar's boundary to resize it for reading.

- **HEMP15.** [p] When the user clicks a node, its description is available in the sidebar.

## Crate-containers

- **HEMP16.** [p] When the user presses the modules button on a crate node, Hemp creates a crate-container on the same canvas instead of opening a separate module screen.
- **HEMP17.** [p] The user can drag modules within a crate-container.
- **HEMP18.** [p] A crate-container does not resize automatically.
- **HEMP19.** [p] A thick dashed Bézier edge connects a crate-container to its crate.
- **HEMP20.** [p] The user can resize a crate-container by dragging its bottom-right corner element.

## CLI access

- **HEMP8.** [p] Hemp provides a CLI.
- **HEMP9.** [p] Hemp does not provide an MCP interface.

## Item graph

The selected-crate example now exercises this scope with Braincrawl's CLI and
CLI-support packages, including references between their source files. See
doc01.13.03 for the generation command and current coverage limits.

- **HEMP22.** [p] Hemp generates a visually projectable graph of Rust items, starting with a module and intended to cover a codebase.
- **HEMP23.** [p] The item graph records logical containment separately from references.
- **HEMP24.** [p] The user can inspect a constant or static and see which functions directly reference it.

### Visual language

- **HEMP25.** [p] Containment is represented by a container, while a module retains its own node.
- **HEMP26.** [p] Module nodes are red.
- **HEMP27.** [p] Module contents containers have a maroon-like background.
- **HEMP28.** [p] Item kinds have distinct background colors to give them distinct visual identities.
- **HEMP29.** [p] Dependency edges remain visible over container backgrounds.
- **HEMP30.** [p] Dependency edges have arrows pointing from the using item to the item it uses.
- **HEMP31.** [p] Constants and other non-function items use smaller stadium-shaped nodes to distinguish them from functions.

- **HEMP38.** [p] Container backgrounds thematically match the node they were spawned from: red for modules, blue for functions, and corresponding colors for other kinds.

- **HEMP40.** [p] Canvas edges have no text labels.
- **HEMP41.** [p] Edges connecting expanded containers to their owner nodes are thick and dashed, with enough spacing for the dashes to remain visually distinct.

- **HEMP42.** [p] All crate nodes are grouped in one container.
- **HEMP43.** [p] Dependency edges between crates and non-crate items are hidden, while dashed owner-to-container connections remain visible.

### Progressive disclosure

- **HEMP32.** [p] The user can collapse and expand module contents in the two-module example.
- **HEMP33.** [p] When module contents are hidden, their cross-module references collect into counted, directed edges between the visible owners.
- **HEMP34.** [p] Expanding module contents reveals the underlying reference endpoints without discarding source evidence.

### Function bodies and source navigation

- **HEMP35.** [p] The user can open an item's source location in Zed or VS Code from Hemp.
- **HEMP36.** [p] The user can expand main and run to inspect nested match expressions and their arms.
- **HEMP37.** [p] The user can inspect a call's dependency on its target function from within a specific match arm.

- **HEMP39.** [p] Open-in-editor links appear at the top of the details component.

- **HEMP44.** [p] A generated artifact supports navigating functions throughout the CLI binary’s dependencies.
- **HEMP45.** [p] The user can navigate nested match statements inside those functions.

## Single-function inspection

- **HEMP46.** [p] Hemp provides a representative single-function view for developing the visual treatment of function internals.
- **HEMP47.** [p] When zoomed into a function, all of its represented internal structure is visible without expansion or hiding.
- **HEMP48.** [p] When zoomed into a function, its internal elements cannot be moved around.

## Searchable code map

- **HEMP49.** [p] The user can search the source collection for an item or symbol.
- **HEMP50.** [p] When the user focuses a function, Hemp brightens its dependency graph and dims other visible nodes.
- **HEMP51.** [p] Items retain persistent locations for a given source collection.
- **HEMP52.** [p] Hemp's artifact experiments remain accessible under one app heading in Luminous.
- **HEMP53.** [p] Hemp preserves explicit data-transformation stages so item properties can be carried through to the UI and changed later.
- **HEMP54.** [p] Zooming out does not hide PCB items or the contents of an open control-flow window.

- **HEMP55.** [p] The default PCB view represents compact items and their connections; ordered function details and control flow are not shown inline.
- **HEMP56.** [p] Information below the PCB's atomic item layer is available through the sidebar or a floating draggable details window.
- **HEMP57.** [p] A function's details window shows ordered control flow with resource blocks in the branches that uniquely consume them.
- **HEMP58.** [p] Resources used in more than one branch appear at function level, even when only a subset of branches uses them.
- **HEMP59.** [p] The static Hemp demo includes the existing Hemp example documents in its document picker.
