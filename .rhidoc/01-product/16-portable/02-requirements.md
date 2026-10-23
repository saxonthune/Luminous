---
title: Portable requirements
summary: User-supported Portable requirements, pending wording review.
tags: [portable, requirements, layout]
---

# Portable requirements

## Default layout

```yaml rhidoc-feature
prefix: PDL
name: Default layout
description: >-
  Users can return node positions to a computed default arrangement.
```

- **PDL1.** [p] Portable computes a default layout for the graph.
- **PDL2.** [p] The user can reset node positions to the computed default layout.

## Artifact generation

```yaml rhidoc-feature
prefix: PGEN
name: Artifact generation
description: Users can generate a portable graph canvas as an HTML file.
```

- **PGEN1.** [p] The generator produces a single self-contained HTML file.
- **PGEN2.** [p] The generator accepts a --debug-performance option to enable performance diagnostics in the generated artifact.

- **PGEN3.** [p] With the debug flag enabled, the artifact logs a size breakdown of its bundled components and dependencies.

## Canvas navigation

```yaml rhidoc-feature
prefix: PNAV
name: Canvas navigation
description: Users can navigate and rearrange the generated graph transiently.
```

- **PNAV1.** [p] The user can drag a node.
- **PNAV2.** [p] The user can pan the canvas.
- **PNAV3.** [p] The user can zoom the canvas.
- **PNAV4.** [p] The user can select multiple nodes.
- **PNAV5.** [p] For now, navigation and dragging changes are transient.
- **PNAV6.** [p] For now, the artifact offers no differentiation or data-editing controls.
- **PNAV7.** [p] A faint background grid is visible in every supported theme.

- **PNAV8.** [p] Node and container borders maintain a consistent visible thickness as the user zooms.
- **PNAV9.** [p] Selection outlines maintain a consistent visible thickness as the user zooms.
- **PNAV10.** [p] Edge labels fade in across a zoom range rather than appearing abruptly at a zoom threshold.

- **PNAV11.** [p] Selecting nodes does not hide or dim unrelated edges.
- **PNAV12.** [p] Edges connected to selected nodes are emphasized with thicker strokes.

- **PNAV13.** [p] During dragging, edges remain attached to their moving nodes.

- **PNAV14.** [p] Box-selection can start inside a container content area.
- **PNAV15.** [p] Scrollable content consumes wheel input before canvas zoom while it can scroll in that direction.
- **PNAV16.** [p] Inputs and resize handles take priority over canvas dragging and selection.
- **PNAV17.** [p] Floating toolbars can extend beyond their owner without clipping.

- **PNAV18.** [p] Middle-button presses inside a canvas do not activate browser page autoscroll; middle-drag pans the canvas.

- **PNAV19.** [p] Nodes do not display a floating Fit button.

## Current input bindings

| Input | Action |
|---|---|
| Left-drag container header | Move the container and its descendants |
| Left-drag container content | Box-select intersecting contents |
| Drag selected item resize handle | Resize that item |
| Wheel over overflowing text | Scroll text; zoom when it cannot scroll further in that direction |
| Canvas Expand width / Restore width | Toggle that canvas between viewport width and article width |
| Click Card footer source link | Open the source using its registered URL handler |
| Left-drag node | Move the selected nodes; a group includes its descendants |
| Left-drag background | Box-select nodes |
| Shift/Ctrl/Command-click node | Add/remove it from selection |
| Right/middle-drag | Pan the canvas; middle press does not activate browser autoscroll |
| Wheel | Zoom when Scroll Zoom is checked; otherwise pan |
| Ctrl+wheel, + / − | Zoom |
| F | Fit selection, or all nodes when none selected |
| 0 | Fit all |
| Escape | Exit fullscreen when fullscreen; otherwise clear selection |
| Ctrl/Command-A | Select all |

The bindings table describes the current implementation. Pending requirements
above capture user intent; the table does not introduce additional requirements.

## Appearance

```yaml rhidoc-feature
prefix: PAPP
name: Appearance
description: Users can view Portable in the Ground theme.
```

- **PAPP1.** [p] Ground is the default theme for Portable.

## Markdown pages

```yaml rhidoc-feature
prefix: PMD
name: Markdown pages
description: Users can combine explanatory Markdown and interactive diagrams in one portable page.
```

- **PMD1.** [p] Portable accepts Markdown (.md) files as its sole document input format.
- **PMD2.** [p] Portable converts Markdown into a formatted static HTML page.
- **PMD3.** [p] Each Mermaid block becomes a canvas component in the page.
- **PMD4.** [p] A page can contain multiple canvases with their own layout controls.
- **PMD5.** [p] A single page header contains the shared theme control.

- **PMD6.** [p] Markdown documents without Mermaid blocks render as formatted HTML pages.

- **PMD7.** [p] The article content has a background distinct from the page body background.
- **PMD8.** [p] The article content background uses a theme token.
- **PMD9.** [p] Users can horizontally expand an individual canvas to the full viewport width.

- **PMD10.** [p] Expanding or restoring a canvas width preserves the screen position of its content and its zoom level.

Canvas Header and Fullscreen Canvas Header glossary and requirements: doc01.16.04.

## Custom node components

```yaml rhidoc-feature
prefix: PCARD
name: Custom node components
description: Users can present node information in separately styled sections.
```

- **PCARD1.** [p] A custom node can present a Title section, a Body section, and a Footer section.
- **PCARD2.** [p] The Title, Body, and Footer sections can have separate styling.
- **PCARD3.** [p] When zoomed out sufficiently, a custom node renders only its title.
- **PCARD4.** [p] In the conversion walkthrough, purple code-node footers link to their source files using zed:// anchors.

- **PCARD5.** [p] Card sections use one role color with subtle variations between sections.
- **PCARD6.** [p] Card footer text is larger than in the initial Card presentation.
- **PCARD7.** [p] Card sections have less horizontal padding than in the initial Card presentation.
- **PCARD8.** [p] All nodes in the conversion walkthrough use Cards.

- **PCARD9.** [p] While zoomed out, a Card with hidden content displays an indicator that more content is available by zooming in.

- **PCARD10.** [p] While zoomed out, Card titles are drawn above the ellipsis disclosure indicator; the indicator does not reserve space that clips the title.

## Legend

```yaml rhidoc-feature
prefix: PLEG
name: Legend
description: Users can interpret diagram styles through a compact legend that remains available while navigating the artifact.
```

- **PLEG1.** [p] Authors can declare a legend independently for each canvas.
- **PLEG2.** [p] Each legend remains at the bottom-right of its owning canvas viewport.
- **PLEG3.** [p] The legend header always reads “Legend”.
- **PLEG4.** [p] Users can minimize the legend and expand it again.

- **PLEG5.** [p] Portable has no page-shared legend.
- **PLEG6.** [p] Minimizing one canvas legend does not change another canvas legend.
- **PLEG7.** [p] Canvas legends use a reusable component configured for each canvas.

Implementation: `portable-canvas.legend` declares ordered theme-class entries and
optional label overrides. Fullscreen retains the same canvas-owned component.

## Default wheel behavior

- Portable enables Scroll Zoom by default. An explicit canvas setting can opt
  into wheel panning instead.

## Architecture change indicators

```yaml rhidoc-feature
prefix: PDIFF
name: Architecture change indicators
description: Users can compare a proposed architecture against its current overview.
```

- **PDIFF1.** [p] A proposed architecture view retains the current overview as its base.
- **PDIFF2.** [p] New components have a green indicator.
- **PDIFF3.** [p] Existing components with additive changes have a distinct green indicator.
- **PDIFF4.** [p] Modified components have a combined red and green indicator.
- **PDIFF5.** [p] Change badges are large squares at the right side of Card headers and reserve space with minimal padding.
- **PDIFF6.** [p] Change meanings and styling are defined centrally for reuse.

Implementation vocabulary and authoring syntax are documented in
`.agents/skills/luminous-portable-artifact-generator/references/diff-language.md`;
`packages/portable/src/diff.ts` defines the shared badge labels, symbols and palettes.

## Generation validation

```yaml rhidoc-feature
prefix: PVAL
name: Generation validation
description: Authors receive actionable diagnostics for invalid or unexplained diagram declarations before an artifact is generated.
```

- **PVAL1.** [p] Portable checks artifact input against validation rules during generation.
- **PVAL2.** [p] Validation reports violations as warnings or errors.
- **PVAL3.** [p] When validation reports an error, Portable rejects generation.
- **PVAL4.** [p] The validation system supports adding rules over time.
- **PVAL5.** [p] Recipes can supply rules specific to their diagram purpose.
- **PVAL6.** [p] Input can declare semantic categories or tokens and identify their uses independently of concrete colors and styling.
- **PVAL7.** [p] When a box uses a declared visual meaning that is absent from its owning canvas's legend, validation reports a violation.
- **PVAL8.** [p] For the Braincrawl privacy-boundary artifact, missing legend coverage is an error that prevents generation.
- **PVAL9.** [p] Legend coverage is checked using declared meaning references rather than comparing rendered colors.

Implementation (October 22, 2026): semantic documents use `portable-model` and
canvas `kinds`; the architecture Recipe enables error-level legend coverage.
`packages/portable/src/semantics.ts` owns resolution, diagnostics and rule/Recipe
registries. Errors stop before layout/output; warnings allow generation. Legacy
class-only documents must explicitly migrate to receive semantic coverage checks.
The implemented metamodel is documented in
`.agents/skills/luminous-portable-artifact-generator/references/metamodel.md`.
Source locations currently identify the Mermaid block, not individual fields.

## Extended Info Plugin

```yaml rhidoc-feature
prefix: EIP
name: Extended Info Plugin
description: Users can inspect extra information and source-code links from diagram Cards as needed.
```

- **EIP1.** [p] Card footers provide a `[more]` hyperlink to their defined extended information.
- **EIP2.** [p] When the user presses `[more]`, a floating Extended Info component opens.
- **EIP3.** [p] Extended information is defined in the artifact input data.
- **EIP4.** [p] The Extended Info component has a container appearance.
- **EIP5.** [p] The Extended Info component displays a Markdown body.
- **EIP6.** [p] The user can drag the Extended Info component.
- **EIP7.** [p] The user can resize the Extended Info component.
- **EIP8.** [p] The user can scroll the Extended Info component body.
- **EIP9.** [p] The Extended Info Component Header has a minimize button that makes the component header-only.
- **EIP10.** [p] The Extended Info Component Header has a close button.
- **EIP11.** [p] Extended information supports Zed links to relevant source files.


Implementation: `portable-info` defines document-level Markdown entries; Card
`info` references them. The reusable `runtime/ExtendedInfo.tsx` component is owned
by each canvas. Unknown references reject generation. Input and interaction
contracts are documented in the Portable skill's `references/metamodel.md`.
