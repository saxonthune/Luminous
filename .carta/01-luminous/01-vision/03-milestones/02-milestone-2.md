---
title: Milestone 2: Dogfooding with tinyForum
status: draft
summary: Use Luminous alongside a real project to validate the tool and surface friction
tags: [milestones, dogfooding, tinyforum]
deps: [doc01.01.03]
---

# Milestone 2: Dogfooding with tinyForum

**Goal:** Use Luminous alongside a real project — tinyForum — to validate the tool end-to-end and surface friction that only shows up in real usage.

## What the user sees

tinyForum gets a `.canvases/` directory containing project canvases. These canvases are built two ways:

- **Human-authored via MCP and UI.** An agent or developer builds canvases from product documentation, architecture decisions, and design reasoning — the kind of context that lives in `.carta/` specs but benefits from spatial arrangement and visual relationships.
- **Generated from code via pipeline scripts.** Scripts perform static analysis of tinyForum's codebase and emit `.canvas.json` files: its Solid.js component tree, API endpoints, backend module tree, database schema, etc. Each pipeline is a reusable artifact, just as in milestone 1.

The canvases become working context — something a developer or agent opens alongside the code to understand relationships, trace data flow, or plan changes.

## What a consumer project needs

For a project outside the Luminous repo to use Luminous, it needs:

1. **A `.canvases/` directory** with `.canvas.json` files. These can be hand-authored, MCP-built, or pipeline-generated.

2. **Luminous server + client running.** The server (`@luminous/server`) serves canvas files and syncs edits; the client (`@luminous/canvas`) renders them in a browser. Both always run together — the whole point is spatial visual thinking alongside AI context. Start with:
   ```
   luminous-server --dir /path/to/project/.canvases
   ```

3. **MCP configured in Claude Code settings.** The `@luminous/mcp` package translates MCP tool calls into HTTP requests against the running server. The consumer project's `.claude/settings.json` (or the user's global settings) needs an MCP server entry pointing at the luminous-mcp binary, with `LUMINOUS_SERVER_URL` set to the running server.

4. **Pipeline scripts** (optional). For code-generated canvases, the consumer runs pipeline scripts that analyze their codebase and emit `.canvas.json`. These scripts live in Luminous and are parameterized by target directory.

## Versioning

Luminous uses per-commit versioning for consumer debugging. No semver bumps or frequent merges required — the git commit hash is the version identifier.

- **Server** includes the commit hash in `/api/health` responses (`{ status: "ok", commit: "467bc6c" }`).
- **Client UI** shows the commit hash in the About modal alongside the semver version.
- **MCP** reports the server's commit hash in its MCP server version string (`0.1.0+467bc6c`), visible during tool discovery.

A consumer can always check what version they're running from any surface — UI, MCP, or a direct health check.

## Open questions

- **Distribution.** How does a consumer install the server and MCP? Options: npm package, standalone binary, or "clone Luminous and run from there." The npm path is simplest but requires publishing. For now, running from a sibling checkout works.
- **Canvas discovery.** Should the server scan the whole project tree for `.canvas.json` files, or only a designated `.canvases/` directory? A designated directory is cleaner — canvases are artifacts, not source code.
- **Skill vs. MCP.** Should Luminous expose a Claude Code skill alongside or instead of MCP? A skill could bundle setup instructions, common workflows, and canvas bootstrapping into a single `/luminous` command.

## Feedback loop

Usage in tinyForum will surface friction: missing features, awkward workflows, things that break outside the Luminous repo. This feedback needs a path back into Luminous development:

1. **Friction noted in tinyForum's `.carta/`** as observations — what didn't work, what was confusing, what was missing.
2. **Issues filed in Luminous** for anything that requires code changes.
3. **Pipeline scripts refined** based on what the generated canvases actually look like for a real project (not just Luminous's own codebase).
4. **This milestone doc updated** as open questions get answered through usage.

## Done when

- tinyForum has a `.canvases/` directory with at least one human-built canvas (from product docs) and one pipeline-generated canvas (from code).
- A developer can start the Luminous server, open the UI, and browse tinyForum's canvases.
- An agent can use MCP tools to read and modify tinyForum's canvases from within the tinyForum working directory.
- At least one round of friction → feedback → fix has completed.
