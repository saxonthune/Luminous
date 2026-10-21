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

## Sequence Containers

- A Sequence Container is a Graph Primitive owned by a Node. It presents an
  ordered, nested sequence of Nodes; those Nodes retain their normal types and
  can be reused elsewhere in the graph.
- Sequence structure uses `parent-child` Edges, with sibling order supplied by
  edge priorities. Nesting follows those Edges. Display labels such as `2a` and
  `2b-i` are derived from the sequence, not part of Node text or identity.
  These Edges express sequence structure; regular Container membership instead
  uses `contains` Edges.
- The primitive identity is persistent and shared across Boards. Each Board
  stores its placement and Special/Graph Presentation choice. Special
  Presentation shows the ordered list; Graph Presentation shows a canvas
  container. Default/Drafting are editing states of Special Presentation.
- Read before proposing changes: `just denim sequence read <database> <owner-id>`
  returns ordered entries with Node/Edge IDs, parent IDs, depth, and display
  labels. UI and CLI use the same sequence projection. `container.members.list`
  reads `contains` Edges and is not a sequence reader.
- Use `sequence insert <database> <owner-id> --text TEXT [--type TYPE]`
  with `--before ID` or `--after ID`, or `--parent ID` to append a child.
  `--placement below|right` places the new card relative to its anchor (default
  below); this is simple relative placement, not collision avoidance.
  Without an explicit type it copies the anchor's type, or the parent's type
  for an unanchored insertion.
- `sequence indent|outdent <database> <owner-id> <node-id>` matches Tab/Shift+Tab.
  `sequence move` accepts `--from-parent ID --parent ID` and before/after.
  These operations change shared edges; they are not Board-local formatting.
- `sequence layout <database> <owner-id> --board ID` loads all sequence entries
  onto that Board and arranges them in depth rows. The first child sits beneath
  its parent; sibling subtrees are separated only as needed to prevent overlap.
  Container bounds expand as needed to fit; layout never shrinks either dimension.
  It updates Board positions without changing
  sequence order. Add `--layout` to insert/indent/outdent/move to perform both in
  one server batch. `--board` can be omitted only when exactly one Board has
  the Sequence Container loaded. Discover action JSON forms with `just denim actions`.
- From another repo, invoke `just --justfile /path/to/Luminous/justfile denim …`.
  The running storage server defaults to port 4080; the client on port 5200
  does not serve the action API. Preserve existing Node IDs when refining a
  sequence so its other graph relationships remain intact.

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
