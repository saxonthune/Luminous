---
name: denim-project-builder
description: Build and improve Denim projects that help people understand software requirements and high-level design. Use for modeling a software system in Denim, especially when discovering useful project-building practices; Tweed is the complementary code-query app.
---

# Denim Project Builder

Help people understand a software system by building a readable, evidence-based
Denim project. Treat the Board as a persistent workspace for reasoning about
requirements and high-level design. The future Tweed app is the complement for
queries over code.

## Working method

1. **Establish the question.** Identify the software, audience, and decision the
   Board should help with. Preserve an existing Board's purpose and useful
   structure; do not start over just because its current shape is imperfect.
2. **Read evidence in context.** Inspect the relevant source, requirements,
   design documents, implementation plans, tests, and Git history. Keep desired
   behavior, intended design, current implementation, and verified evidence
   distinct. A plan is not proof that code implements it; code is not proof that
   it meets the requirement. Give decision-relevant claims a source pointer and
   distinguish implemented behavior from behavior covered by passing evidence.
3. **Model at the useful level.** Capture the important outcomes and
   capabilities, the computational instances that realize them, and the
   resources they read or change. Use concise labels that explain a node without
   requiring the reader to inspect source first. Add code-level detail only when
   it explains a boundary or resolves a real design question. Do not turn the
   Board into a file or symbol inventory.
4. **Make relationships explain something.** Add an edge when its meaning helps
   explain realization, dependency, ownership, data movement, or another
   decision-relevant relation. A `contains` Edge already expresses membership
   in a Container. Do not also connect the Container Node to each contained
   Node with a parent-child Edge by default; add that Edge only when it
   expresses a separate upstream/downstream relationship or the user asks for
   it. Reuse existing Nodes when they already represent the same concept. Keep
   uncertain relationships visibly unresolved in the discussion instead of
   drawing them as fact.
5. **Use Denim's supported interface.** Read the target Board before changing
   it. Use the Denim action/session API for persistent edits when available;
   avoid direct database writes. After editing, read the Board again and check
   that the requested Nodes, connections, and placements are present. Briefly
   report which CLI/session/action/query path you used and whether it was
   straightforward. When repeated low-level operations, brittle scripts, or
   awkward temporary files expose a CLI gap, propose the specific command that
   would simplify it so the user can decide whether to add it.
6. **Create decision aids.** When a system is too large for one Board, split it
   by a user question or decision. Useful companion artifacts can include an
   outcome-to-capability map, a capability-to-resource map, a system boundary
   view, or a gap list. Choose only what helps the current reader make a
   decision.
7. **Learn from project-building work.** Add an entry to [log.md](log.md) only
   when this skill is being used to build or improve a user's Denim project.
   Record relevant project artifacts, what worked or failed, project-building
   capability gaps, and a lesson with its evidence level. Do not add entries for
   developing or maintaining the Denim application itself, its UI, CLI, docs,
   or tooling. Do not add entries for unrelated repository work. Update this
   skill's reusable instructions when evidence from project-building work
   changes a practice; keep session-specific observations in the log. Do not
   copy private source content, credentials, or unnecessary transcript text
   into the log.

## Scope

Build design context for the user. Do not modify the target application's code
unless the user asks for implementation. Do not claim that a proposed design is
implemented without checking source and behavioral evidence. Record missing
Denim actions, queries, or views as capability requests in the log so they can
inform the product roadmap.

## Initial project: Braincrawl privacy rescue

The first project is the Braincrawl privacy update in `../braincrawl-privacy`.
Its goal is to create useful artifacts that guide refactoring decisions and
support a capable architecture. Follow that checkout's `AGENTS.md`, read its
Rhidoc manifest before selecting documents, and respect its existing worktree
and change boundaries. Start by mapping the user outcomes, privacy guarantees,
runtime boundaries, migration responsibilities, and evidence. Read
`.rhidoc/04-privacy/06-implementation-history.md` for the user's corrections and
the requested rescue artifacts, but use docs04.02–04.05 for current intended
behavior. Connect each journey to its modules and routes, each route to its
contracts, and each contract to evidence and runtime boundaries. Surface
unresolved product or architecture choices for user agreement before
implementation. Do not treat the implementation plan as a directive to execute
every listed batch or change Braincrawl code as part of a design-only request.
