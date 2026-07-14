---
title: Background
summary: Why Luminous was split from Rhidoc — separation of the docs system from the visualization tools
tags: [background, history, rhidoc, split]
deps: [doc02.01]
---

# Background

## The Split

Luminous was extracted from the Rhidoc monorepo. Rhidoc began as a single project encompassing both a specification documentation system (the `.rhidoc/` workspace format and its Python CLI) and a TypeScript visual editing environment (canvas engine, schema system, document model, web client, VS Code extension, server).

These are two different things with different concerns:

- **Rhidoc** is a docs system and CLI that lets AI agents manage structured specifications. It is Python-only, with minimal dependencies (`click`, `pyyaml`). Its job is to be the transmission mechanism between AI and SDLC — the gears through which product understanding is actualized into precise, structured specs.

- **Luminous** is the visual layer. It takes the artifacts that Rhidoc (and other tools) produce and makes them visible, navigable, and editable. It is TypeScript, Solid.js, Yjs, and a canvas engine.

The split recognizes that these tools have independent purposes and should develop independently. Rhidoc's docs system should not be burdened by 50,000 lines of TypeScript and 50+ npm dependencies. Luminous should not be constrained by Rhidoc's CLI release cycle.

## What Came Over

The following packages were extracted from `saxonthune/rhidoc`:

- `@rhidoc/geometry` — layout primitives, constraint solver
- `@rhidoc/schema` — core data model (nodes, edges, ports, types)
- `@rhidoc/document` — Yjs CRDT document, compiler, formatters
- `@rhidoc/server` — WebSocket sync, MongoDB persistence, MCP tools
- `@rhidoc/web-client` — canvas editor (the largest package)
- `@rhidoc/vscode` — VS Code extension

The dependency graph is self-contained: `geometry → schema → document → server`, with `web-client` and `vscode` as consumers. Nothing here depends on the Python CLI.

## What Stays in Rhidoc

The Python CLI (`packages/cli/`), the `.rhidoc/` workspace format, the codex docs (doc00), and the Claude Code skills that support docs-development workflows. Rhidoc remains the specification system; Luminous becomes its visual companion.
