---
title: Portable overview
summary: Standalone interactive graph artifacts, initially using Solid and shared Luminous packages.
tags: [portable, canvas]
---

# Portable

Luminous Portable converts a Markdown file into a formatted static HTML page.
Mermaid blocks become independent interactive canvas components within the page.
One shared header owns the theme; each canvas owns its layout controls and state.
The output remains a single self-contained file.
The motivating input is the system overview from the Pele Braincrawl artifact.
Private source examples remain outside the public package.

## Current implementation direction

`packages/portable` starts with Solid and existing Luminous packages. Cactus
provides shared canvas machinery. The package separates graph input, Mermaid
import, Markdown document rendering, layout, runtime, and artifact generation.

Compute a default layout, initially taking inspiration from Pele's layout
engine. Keep default positions separate from user-adjusted positions so reset
can restore them. The first implementation uses cactus’s bottom-up compound layered layout: each
group is arranged with ELK, then its size participates in its parent’s layout.
Local Mermaid flow directions and invisible ordering links are retained. This
is inspired by Pele’s layered/compound approach, not its exact routing engine.

Current status: working flowchart importer and standalone HTML generator, Solid
and cactus canvas, default layout reset, transient dragging and navigation.
Pele parses the flowchart; Vite bundles the browser runtime into the HTML.
Run `just portable --help` for the generator options.

The first pass uses direct cactus edge routes. It does not yet reproduce Pele’s
obstacle routing, and a fully expanded large graph requires zooming to read.
Progressive disclosure remains future work, outside this first implementation.

User-supported requirements are recorded in doc01.16.02. Earlier agent proposals
are design discussion, not an adopted requirements list.

## Demo gallery and source access

The static Luminous demo links to `/portable/`, a generated overview of selected
artifacts. `packages/portable/demo/artifacts.json` supplies their order, titles,
input filenames, and optional theme/CSS files; the default input directory is
`packages/portable/examples/`. `just portable-gallery` can build another selection,
and `just build-static` includes the default gallery in the demo output.

Generated pages have a normal-flow footer with generator attribution, GitHub,
and View Source. The source view displays the original embedded Markdown as plain
text and works offline.
