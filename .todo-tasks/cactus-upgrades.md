# Cactus Canvas Engine Upgrades for Unfolding Architecture

## Motivation

The cactus canvas engine is domain-agnostic and capable, but the domain layer on top (MapV2, organizerLogic, connectionLogic) restricts it to the schema-first model. Three small upgrades are needed to support the unfolding architecture described in PDR doc01.03.

## Description

Modify cactus primitives and the MapV2 domain layer to support:

1. **Handle-less edges (node-to-node)** — `useConnectionDrag` currently requires handle data attributes on both source and target. For freeform edges, we need node-level connection targets (drag from node body to node body, no port selection).

2. **Universal nesting** — `canNestInOrganizer` in `organizerLogic.ts` restricts `parentId` to organizer nodes only. Any node (note, construct, organizer) should be able to contain children. The containment infrastructure (relative positioning, auto-fit, `findContainerAt`) already supports this — the restriction is policy, not capability.

3. **Note node rendering** — A new node type for the canvas: renders as an index card with title + markdown body. No port handles, no schema header. Visually distinct from constructs but cohesive on the same canvas.

## Prerequisites

- `cactus-independence` must be completed first (inlines geometry, removes `@carta/geometry` dependency)

## Scope

- Modify `useConnectionDrag` to support optional handle IDs (null = connect to node center)
- Modify `canNestInOrganizer` → `canNest` to allow any node as container
- Add `MapV2NoteNode` component for rendering note nodes
- Update `MapV2.tsx` node type registry to include notes
- Update edge rendering to support edges without sourceHandle/targetHandle
- Update `findContainerAt` if needed for note nodes as drop targets

## Out of Scope

- Document layer changes (createNote, connectFreeform operations) — separate task
- Schema/type system changes — separate task
- MCP tool additions — separate task
- Crystallization UI — later milestone
- Schema-pair description UI — later milestone

## Notes

- Cactus is at `/packages/web-client/src/cactus/`
- MapV2 is at `/packages/web-client/src/components/canvas/MapV2.tsx` (~60KB)
- Organizer logic is at `/packages/web-client/src/utils/organizerLogic.ts`
- Connection logic is at `/packages/web-client/src/utils/connectionLogic.ts`
- The engine uses data-attribute hit-testing (`data-connection-target`, `data-drop-target`, `data-container-id`) — note nodes just need to emit these attributes
- See FEEDBACK.md for full design context and PDR at `.carta/01-luminous/03-pdr-unfolding-architecture.md`
- This task still needs full grooming — the plan above is from the original write-up, not yet refined into an executable spec
