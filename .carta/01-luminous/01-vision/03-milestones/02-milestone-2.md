---
title: Milestone 2: Dogfooding with tinyForum
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

2. **Luminous server + client running.** The consumer project has a gitignored launch script that runs Luminous from a local checkout via `npx /path/to/Luminous/packages/server-next`. This simulates the eventual `npx @luminous/server` experience without publishing. The script also starts the client. No Luminous dependency appears in the consumer's `package.json`.

3. **MCP configured in Claude Code settings.** The `@luminous/mcp` package translates MCP tool calls into HTTP requests against the running server. The consumer project's `.claude/settings.json` (or the user's global settings) needs an MCP server entry pointing at the luminous-mcp binary, with `LUMINOUS_SERVER_URL` set to the running server.

4. **Claude Code skill installed.** The `@luminous/skill` package provides a skill template (`SKILL.md`) that the consumer copies into `.claude/skills/luminous/`. This gives the agent session context on what Luminous is, how canvases work, and how to write pipeline scripts — without access to the Luminous repo. The skill works alongside MCP tool descriptions: MCP tells the agent *what each tool does*, the skill tells it *what Luminous is and why*.

5. **Pipeline scripts** (optional). For code-generated canvases, the consumer runs pipeline scripts that analyze their codebase and emit `.canvas.json`. These scripts live in Luminous and are parameterized by target directory.

## How a consumer agent gets context

The consumer agent has no access to the Luminous repo. Context arrives through two channels:

- **MCP tool metadata.** Tool names, descriptions, and parameter schemas are sent during MCP tool discovery. Well-written descriptions make the tools self-documenting at the action level.
- **Claude Code skill.** The `/luminous` skill explains what Luminous is, what canvases contain, how to use MCP tools in combination, and how to write pipeline scripts. This is the "user manual" that lives in the consumer project.

These two layers complement each other: MCP descriptions are tool-level ("what does `node.create` do?"), the skill is concept-level ("what is a canvas and why would I build one?").

## Versioning

Luminous uses per-commit versioning for consumer debugging. No semver bumps or frequent merges required — the git commit hash is the version identifier.

- **Server** includes the commit hash in `/api/health` responses (`{ status: "ok", commit: "467bc6c" }`).
- **Client UI** shows the commit hash in the About modal alongside the semver version.
- **MCP** reports the server's commit hash in its MCP server version string (`0.1.0+467bc6c`), visible during tool discovery.

A consumer can always check what version they're running from any surface — UI, MCP, or a direct health check.

## Resolved questions

- **Distribution.** For dogfooding: gitignored launch script in the consumer that runs Luminous via `npx /path/to/local/checkout`. No publishing required. Simulates the eventual `npx @luminous/server` experience.
- **Skill vs. MCP.** Both. MCP for tool-level access, skill for concept-level context. The `@luminous/skill` package provides a template that consumers copy into `.claude/skills/luminous/`.

## Open questions

- **Canvas discovery.** Should the server scan the whole project tree for `.canvas.json` files, or only a designated `.canvases/` directory? A designated directory is cleaner — canvases are artifacts, not source code.

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
