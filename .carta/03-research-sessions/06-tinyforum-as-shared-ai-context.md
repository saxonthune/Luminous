---
title: tinyForum as Shared AI Context
status: draft
summary: "Framing Milestone 2: Luminous makes tinyForum easier to build with AI by producing artifacts that humans read spatially and AI agents read as rich structured context — canvases as the shared medium between both consumers"
tags: [research, tinyforum, milestone-2, dogfooding, ai-context, canvas, mcp]
deps: [doc01.01, doc01.03.02, doc02.01]
date: 2026-04-12
---

# tinyForum as Shared AI Context

## Thesis

Luminous is being applied to tinyForum not as a documentation exercise but as a **context-engineering exercise**. The goal is to make tinyForum easier to build with an AI agent by producing artifacts that serve two consumers simultaneously:

- **Humans** see a spatial canvas: component trees, screen flows, data relationships — laid out so the eye can scan and the hand can arrange.
- **AI agents** read the same canvas as structured data: JSON nodes and edges with typed relationships that ground the agent's reasoning in the project's real shape rather than a freshly-summarized guess.

The single artifact is the bridge. Neither a wiki (which humans tolerate but agents over-summarize) nor a JSON spec (which agents like but humans won't maintain). A canvas that encodes both geometry *and* structure is the thing that keeps both consumers engaged and aligned.

## Why tinyForum

tinyForum is the first Luminous consumer because it meets three conditions that make it a useful testbed:

1. **Real, not a toy.** A working forum application with a client, server, API, database, and product specs. Anything that breaks when Luminous runs outside its own repo will break here.
2. **Small enough to see whole.** Not so large that the canvas output is incomprehensible, not so trivial that pipelines have nothing to extract.
3. **Paused on a concrete UI-tooling problem.** Development slowed when component and screen structure became hard to reason about in code alone — the exact problem Luminous wants to address. Dogfooding isn't manufactured; the consumer has a real need.

The third condition is the most important. If tinyForum's UI work resumes because Luminous produced artifacts that made it tractable, that is a strong signal for the tool's thesis. If it doesn't, the friction uncovered is diagnostic.

## What Milestone 2 delivers to tinyForum

Milestone 2 (doc01.03.02) spells out the consumer-side infrastructure: a `.canvases/` directory, a launch script to run Luminous from a local checkout, MCP configured in Claude Code, and the `@luminous/skill` installed so agents arrive in tinyForum's working directory already knowing what canvases are and how to work with them.

The outputs tinyForum accumulates:

- **Pipeline-generated canvases** — static-analysis output from tinyForum's Solid client and Node server. Component tree, API endpoints, module graph, database schema. These refresh when the pipeline re-runs; they are derived artifacts.
- **Human-authored canvases** — product-level thinking, screen flows, decisions, design rationale. Built via MCP (agent-assisted) or the Luminous UI (direct manipulation). These are primary artifacts — they carry information that is nowhere else.
- **Hybrid canvases** — generated scaffolds that humans then annotate, arrange, and extend. A pipeline produces the component tree; a human adds freeform nodes describing why a particular screen exists or what the next refactor should look like.

## Canvases as context, not documentation

The framing matters. A wiki entry is written to be read linearly. A spec is written to be authoritative. A canvas is written to be **referenced in context** — opened next to the code an agent is about to touch, or consulted when a human is orienting themselves before a session of changes.

This changes what belongs in the artifact:

- **High signal density** — each node is a concrete object (component, endpoint, screen, decision), not a paragraph.
- **Spatial grouping** — related things are visually near each other; the arrangement itself carries information that prose cannot.
- **Edges that mean something** — "this calls that," "this renders that," "this depends on that decision." An agent can query the edge graph; a human can trace it with their eyes.
- **Willingness to be stale.** Canvases drift; some are rebuilt by pipelines; some are discarded. They don't need to be canonical — they need to be useful *now*.

This is different from the spec-driven discipline in `.carta/`, which aims at authoritative bridges between product expectations and source. Canvases are working context. Both roles matter; neither replaces the other.

## The two-consumer test

A good Luminous canvas passes a simple test: **does it help both consumers in the same session?**

- A developer opens the canvas to understand a region of the codebase. They see the component tree and its reactive dependencies laid out spatially. They orient in seconds.
- They ask an agent to make a change. The agent reads the same canvas through MCP and knows immediately which components are affected, which signals flow where, and which screens will render differently.

If either consumer needs a different artifact for the same task, the canvas has failed the test. The shared artifact is what makes the collaboration fluent: no translation step, no out-of-date prose, no risk of the agent and the human reasoning from different models.

tinyForum is where this test gets run for the first time. Each friction point — a canvas that helps the human but is opaque to the agent, or vice versa — tells us something about what the canvas format, the MCP surface, or the skill should look like.

## What "easier to build with AI" actually means

Concretely, the kinds of tasks tinyForum development hopes Luminous will improve:

- **Orientation.** "Where does subforum moderation happen? What components render it?" A canvas answers this visually and structurally in one lookup.
- **Change scoping.** "If I rename this action, what's affected?" The agent queries the edge graph instead of grepping and guessing.
- **Design reasoning.** "Why does the thread view look this way?" A decision node on the canvas points to the rationale; both human and agent can follow it.
- **Screen-level modeling.** (Current gap.) A tree of screens and their components, annotated with the state each interaction requires. This is the problem that paused tinyForum UI work and a plausible next pipeline to build after the Solid component one lands.

None of these are impossible without Luminous. All of them are slower and lossier without a shared canvas to anchor them.

## Versioning and observability

The per-commit versioning scheme in M2 (commit hash visible in `/api/health`, UI About modal, and MCP server version) exists because tinyForum will be running a locally-checked-out Luminous. When something misbehaves in the consumer, the developer needs to know *which* Luminous they're running without ceremony. This is consumer-ergonomic debugging — one of the friction surfaces this milestone specifically targets.

## Feedback loop

Every observation that surfaces in tinyForum — "the agent couldn't figure out what a portal node means," "the human never opens the generated canvas because it's too dense" — lands in tinyForum's own `.carta/` as an observation, then becomes either a Luminous issue or a pipeline refinement. The feedback path is codified so dogfooding isn't decorative; it's a source of direction.

## What this milestone is not

- **Not a public launch.** Distribution is local checkout + launch script. `npx @luminous/server` is the eventual form; the milestone doesn't require it.
- **Not a general integration guide.** The MCP + skill + launch-script pattern is specific to Claude Code consumers right now. Other IDE integrations can follow once the pattern is validated with one real consumer.
- **Not a measurement exercise.** There are no quantitative gates. The question is whether tinyForum's developer keeps using Luminous after the friction round, and whether the artifacts produced are the kind that make future sessions faster. That's qualitative and sufficient.

## Open questions

- **Canvas granularity.** When does a project have "too many" canvases and lose the whole-project view? Is there a meta-canvas (index, overview) and when does it emerge?
- **Canvas freshness.** How often are pipeline canvases rebuilt, and by whom? Manually, on save, on CI, on demand by the agent? Different answers imply different pipeline ergonomics.
- **Screen + state modeling.** The pending tinyForum need — modeling screens and their required state — is a specific pipeline we haven't built. What should its node types be (screen, component, state source, interaction)? How does it interact with the existing component-tree pipeline from Milestone 1?
- **Friction captured where?** Observations live in tinyForum's `.carta/`. Should they also surface back into Luminous's `.carta/` as a durable record of what real usage revealed, or is the issue tracker enough?
- **The symmetry hypothesis.** Does the two-consumer test actually hold up? It's plausible that humans and agents want *related but different* artifacts, and Luminous's job is really to make the shared-enough artifact plus the per-consumer view. tinyForum is where this gets tested.
