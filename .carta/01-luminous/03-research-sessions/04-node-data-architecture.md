---
title: Node Data Architecture Research
status: draft
summary: Research session deriving Luminous's node data model from prior art (tldraw, Notion, Excalidraw, React Flow, Bevy ECS) — separation of structure/content/schema, flat storage with parent pointers, and graceful schema degradation
tags: [research, architecture, data-model, ecs, bevy, tldraw, notion, schema, nodes]
deps: [doc01.02.01, doc01.02.05.01]
date: 2026-04-09
---

# Node Data Architecture Research

Research session exploring how Luminous should model nodes once they need to be more than free-form notes — composite Components with named regions for nested children, schemas that define what a kind of node "is", and a clean separation between the engine, the schema, and the content.

The triggering question was: how do we model a Solid.js Component as a node in a visual graph? It needs a drag bar, a title, a notes section, and at least two regions for nested children (one for child Components, one for hooks/signals/effects/memos). The naive answer — extend the existing flat NoteNode with extra fields — would entangle structure, presentation, and content. The right answer comes from looking at what production graph editors and game engines have already converged on.

## Prior Art

### Notion — single parent pointer, containers are blocks

Notion's data model is the closest analog to what Luminous needs. Every block has a single `parent` pointer (used for permissions and lookups). Blocks that contain other blocks — column blocks, toggle blocks, page blocks — are not a special type of record; they are blocks that happen to render as containers and accept child blocks pointing at them. There is no "slot" concept. A column with three children is one column block plus three child blocks whose `parent` is the column.

This unification means a single storage and rendering pipeline handles documents, databases, wikis, and pages. The trade-off is that queries must handle heterogeneous payloads — the type of each block is not known statically.

Two pointers exist on each block: an upward `parent` (used for permissions) and a downward `content` array of child block IDs (used for ordered rendering). They are kept in sync. The redundancy is intentional — different traversal patterns benefit from each direction.

### tldraw — record store with separate schema package

tldraw is layered into three packages: `@tldraw/state` (reactive primitives), `@tldraw/store` (a generic record store), and `@tldraw/tlschema` (the tldraw-specific record types). This separation is deliberate: the store is a domain-agnostic database; the schema is the tldraw vocabulary built on top.

Records are JSON objects with base properties (id, type, parent) and a `props` sub-object for type-specific data. Shapes, bindings, instances, pages, cameras, and assets are all records. The schema declares the shape of each record type, including migrations for evolving them.

Persistence splits along a meaningful seam: the document part (shapes, pages, bindings) is what you save to a server; the session part (camera, selection, UI state) is per-user local. tldraw treats "what's on the canvas" and "how this user is currently viewing it" as fundamentally different.

### Excalidraw — top-level sectioning

Excalidraw's `.excalidraw` file has three top-level sections: `elements` (the canvas content), `appState` (editor configuration like theme and zoom), and `files` (binary assets like embedded images). Elements share a common base (id, type, x, y, width, height) but have type-specific specialized properties — rectangles store dimensions; lines store an array of points relative to their position.

The lesson here is structural separation by *concern*, not by *kind*: identity/geometry, presentation state, and large binaries each get their own table. Within `elements`, all kinds live together under a common base.

### React Flow — separation of identity from data

A React Flow node has `id`, `type`, `position`, and a `data` property. The framework injects `id`, `position`, and `data` into custom node components and provides selection/dragging/connection mechanics for free. The `type` field maps into a `nodeTypes` registry (keyed by string) which holds the React component to render. Custom data lives in `data` so it can have any shape — the framework doesn't need to know what's in there.

For nodes with multiple connection handles, React Flow recommends splitting `data` by handle id. The pattern: when one node has more than one place to connect, give each place its own slot in the data so they can be addressed individually. This is the same problem as our "two markdown boxes" question, solved by giving each thing its own named field.

### Scene graphs — containers are first-class nodes

JavaFX, Open 3D Engine, Godot, Fyrox, 3ds Max, and Java 3D all converge on the same shape: nodes have one parent and many children. Container nodes (Group, Region, Control, etc.) inherit from a common Parent base class. There is no "slot" — the hierarchy IS the slot. A child belongs to a parent, and where a parent renders the child is up to the parent's class.

Hierarchy is conceptually a tree but rarely stored as one. It's typically backed by flat memory and parent pointers, with the tree reconstructed at traversal time.

### Bevy — flat ECS storage with derived hierarchy indices

Bevy stores entities and components in completely flat arrays indexed by entity id. Hierarchy is expressed as components on the entity:

- Pre-0.16: a `Parent` component held the parent entity id; one-way upward.
- 0.16+: replaced with `ChildOf` (on the child) and `Children` (on the parent) — bidirectional.

The bidirectional move was deliberate: hot-path traversal needed both directions for cache locality. Crucially, `Children` is treated as a *cached, automatically-maintained derived structure*, not a second source of truth. The ChildOf component is canonical; Children is built from it and updated as ChildOf changes.

Bevy also makes the broader ECS principles concrete:

- **Composition over inheritance.** An entity is defined by which components it has, not by a class. A "spaceship" is an entity with Transform + Velocity + Sprite + Health components. Add a Player component and it's now player-controlled.
- **Indices, not pointers.** Entities are integer IDs. Components reference each other by ID. No object lifetimes to manage; no aliasing problems; trivially serializable.
- **Systems are pure functions of components.** Layout, physics, rendering, AI — each is a function over the component tables. Systems don't share state with each other; they communicate by reading and writing components.

Godot takes the opposite approach (raw pointers, no acceleration structures, conceptually simpler) and pays for it with worse cache behavior on large hierarchies. The Bevy maintainers note that hierarchy traversal is one of the hot paths where data-orientation pays off.

## Cross-Cutting Lessons

Reading these together, the same shape appears every time:

1. **Source of truth is flat.** Every system stores nodes/blocks/entities/elements in a flat collection keyed by id. None of them nest the canonical data. Nesting is reconstructed at traversal time.

2. **Hierarchy is one parent pointer.** With optionally a derived child list for traversal speed. Nobody uses "slot" or "named child position" as a storage concept — when richer addressing is needed (Notion's column children, tldraw's pages), the container is itself a node.

3. **Identity, structure, and content are separate concerns.** tldraw splits document/session. Excalidraw splits elements/appState/files. React Flow splits id+position from data. The seam between "what is this and where is it" and "what does it contain" recurs everywhere.

4. **Type is a string lookup, renderer is registered separately.** React Flow has `nodeTypes`; tldraw has a record type registry; ECS has component definitions. The instance just carries a string; the renderer/system is held in a registry. Adding a new kind is adding a new entry to a registry, not editing instance code.

5. **Composition over inheritance, in data shape.** Every node is the same shape with optional fields. What differentiates a Component from a Signal is which schema applies and which content fields are populated, not a different record type.

6. **Derived structures are built once, updated incrementally.** Bevy's Children, Notion's render tree, tldraw's reactive computations — all are caches over the canonical store. They are owned by the runtime and never persisted. If they get out of sync, they can be rebuilt from scratch from the source of truth.

## What This Means for Luminous

Translating the lessons into Luminous's specific situation.

### The shape

A canvas file has four top-level tables, all flat hashtables keyed by id:

```
schemas:   id → schema definition (what a kind of node "is")
structure: id → { schemaName, parent, order, geometry }
content:   id → { field values per the schema }
edges:     id → { fromId, toId, label, schemaName }
```

The structure table is the source of truth for hierarchy. `parent` is the only pointer; child lists are derived at runtime. `order` is a fractional index that gives stable, mutation-friendly ordering of siblings without renumbering on insert.

Containers are first-class nodes with `schemaName: "container"`. A Component instance whose schema declares two containers ("Components" and "Members") is, in storage, three records: the component plus two containers. Children of the component are parented to one of the two containers, not to the component directly. There is no slot field on children — Notion's pattern.

### The schema

Schemas live in the canvas file. A schema declares an ordered list of *primitives* — atoms like `drag-bar`, `title`, `markdown`, `container` — with each primitive declaring how it binds to content. A title primitive says "I am rendered by the title renderer, and my content comes from the field `title` in this node's content record." Two markdown boxes get two markdown primitives bound to two different field names.

Schemas being in the file means a canvas is fully self-describing. You can hand someone a `.canvas.json` and they have everything needed to render it, including the vocabulary it uses. The duplication cost across canvases is small (schemas are ~1KB each); the portability and queryability win is large.

### The three layers, separated

This is the deepest implication and the one that should shape the code:

**Cactus** — the engine — reads only the structure table. Id, schemaName (as an opaque string), parent, order, geometry. It runs layout, hit-testing, drag, selection, edge routing, and parent-relative coordinates using these fields alone. Cactus does not know what `title` or `body` mean. As far as it's concerned, every node is a positioned rectangle with a parent and a string tag. This is what makes cactus a domain-agnostic engine that someone could use for a different application with a different schema vocabulary.

**The schema registry** — a runtime structure built from the canvas's schemas table — maps `schemaName` → `{ primitives, layoutRule, accepts }`. It is the bridge between cactus and content. The schema registry has no knowledge of any specific canvas; it just answers "what does a `component` look like?" when asked.

**The schema-aware renderer** — Luminous's domain layer — reads structure, content, and the registry together. For each node, it looks up the schema, walks the primitives, and dispatches each primitive to its renderer (passing the bound content field). It's the only code that sees all three layers at once.

This means cactus can be tested, refactored, and even ported without touching schemas or content. Schemas can be edited without touching engine code. Content can be migrated without touching either. The boundaries are real, not aspirational.

### The durability invariant

> The data layer is more durable than the schema layer. Content is always preserved on save, even when the schema can't be applied to it.

Or equivalently: structure always works, schema is best-effort, content is sacred.

This invariant has concrete consequences:

- A canvas with no schemas at all still opens. Cactus lays out the boxes; nodes render in a fallback mode showing id + content as raw key-value pairs.
- A node referencing a missing schema renders as a fallback box with a warning glyph. Other nodes are unaffected.
- A primitive whose `bind` references a missing content field renders empty.
- A content field that no primitive currently binds is *preserved on save* — never deleted. Schema evolution is additive by default; old data survives round-trips through new schemas.
- A cycle in the parent graph is detected at load time and broken in memory (the lexicographically larger id has its parent set to null), with the on-disk data preserved for the user to fix.

The architectural payoff: every failure mode becomes "render less of the node, but preserve everything." There is no failure mode that loses data, and no failure mode that prevents the canvas from opening.

### Performance, at our scale

We do not need archetype storage, SoA component layouts, or the rest of the ECS performance arsenal. Our scale is thousands of nodes per canvas, not millions of entities per frame. The lessons that DO apply at our scale:

- **Build derived indices at load time, update on writes.** A `parentToChildren: Map<id, id[]>` (sorted by `order`), a `schemaForNode: Map<id, Schema>`, and a `contentForNode: Map<id, Content>`. Built once when a canvas loads. Updated on every write that affects them. Rebuilt from scratch if they drift. They are caches, not state.
- **Source of truth is shape-stable.** The structure table never holds anything but id, schemaName, parent, order, geometry. Cactus's hot-path code only ever reads these fields. Content lookups are O(1) through the contentForNode index.
- **Pure layout functions.** Tidy and tree layout are pure functions of structure. They do not read content. They can run in a worker, on the server, or in a pipeline without dragging the renderer along — the same way ECS systems are pure functions of components.

### Why this is consistent with Luminous's existing principles

The unfolding architecture PDR (doc01.02.01) and the cactus overview (doc01.02.05.01) already established two stances that this design extends rather than contradicts:

- **Server is storage; client is intelligence.** The new shape strengthens this: the server now has even less it needs to know — it stores four tables and serves them. All schema interpretation, primitive rendering, and validation lives on the client. The server doesn't need to be schema-aware to serve a canvas correctly.
- **Polymorphic nodes via discriminated union, not class hierarchy.** The PDR called for polymorphic nodes; the schema-driven model is the cleanest realization of that. Every node is the same record shape, differentiated by `schemaName` and content. New kinds are added as new schema entries, not as new record types or new TypeScript classes.

The new piece is the explicit separation of structure/content/schema as three tables that the runtime composes. Until now, Luminous nodes have mixed all three (a NoteNode record carries identity, geometry, parent, title, and body in one bag). The mixed shape was fine for the freeform note use case; it does not scale to the schema-driven Component use case the next milestone needs.

## Decisions Reached in This Session

1. Three (now four) top-level tables in the canvas file: `schemas`, `structure`, `content`, `edges`. Flat hashtables keyed by id.
2. UUIDs for all node ids, including auto-created containers.
3. `parent` as the single source-of-truth pointer. No childIds on disk.
4. Fractional indexing for sibling order.
5. `geometry` as a nested object: `{ x, y, w, h }`.
6. Containers are real nodes with `schemaName: "container"`. No slot field anywhere.
7. Schemas live in the canvas file (not external), to keep canvases self-describing.
8. Schemas declare ordered `primitives`. Each primitive has a `type` (renderer dispatch) and a `bind` (content field name). Two markdown boxes are two primitives bound to two different field names.
9. Title and notes are distinct primitive types, not just two string fields.
10. `parentToChildren`, `schemaForNode`, and `contentForNode` runtime indices, built at load and updated incrementally.
11. The durability invariant: structure always works, schema is best-effort, content is sacred.

## Open Questions Deferred to Implementation

- **Schema migration tooling.** When a schema's primitive list changes between canvas saves, the dark-matter rule means data is preserved but invisible. A "schema doctor" tool that reports orphaned content fields and offers manual rename/promote could be useful — not blocking.
- **Edge schemas.** Edges have a `schemaName` field in the shape, but we have not yet built an edge schema registry. For now, edges are styled by ad-hoc rules; the field is forward-looking.
- **Library schemas.** Once schemas in canvases are working, a `schemas/` directory of reusable schema definitions that get imported into a canvas at edit time becomes interesting. Out of scope for now.
- **CRDT mapping.** The flat-map shape is the right shape for Yjs. Mapping the four tables to Yjs `Y.Map`s is straightforward but has not been spec'd. Touched on by the existing live overlay; not yet a full design.

## Sources

- [Exploring Notion's Data Model: A Block-Based Architecture](https://www.notion.com/blog/data-model-behind-notion)
- [Parent Object — Notion API](https://developers.notion.com/reference/parent-object)
- [Store and Schema | tldraw DeepWiki](https://deepwiki.com/tldraw/tldraw/2.3-tools-system)
- [Shapes • tldraw Docs](https://tldraw.dev/docs/shapes)
- [Persistence • tldraw Docs](https://tldraw.dev/docs/persistence)
- [JSON Schema — Excalidraw developer docs](https://docs.excalidraw.com/docs/codebase/json-schema)
- [Element Types and Creation — Excalidraw DeepWiki](https://deepwiki.com/excalidraw/excalidraw/3.1-element-binding-and-geometry)
- [Custom Nodes — React Flow](https://reactflow.dev/learn/customization/custom-nodes)
- [Node — React Flow API Reference](https://reactflow.dev/api-reference/types/node)
- [Bevy Relationships | Tainted Coders](https://taintedcoders.com/bevy/hierarchy)
- [Bevy's Next Generation Scene/UI System (discussion #14437)](https://github.com/bevyengine/bevy/discussions/14437)
- [Entity component system — Wikipedia](https://en.wikipedia.org/wiki/Entity_component_system)
- [Managing game object hierarchy in an ECS — IceFall Games](https://mtnphil.wordpress.com/2014/06/09/managing-game-object-hierarchy-in-an-entity-component-system/)
- [Scene graph — Wikipedia](https://en.wikipedia.org/wiki/Scene_graph)
- [Working with the JavaFX Scene Graph](https://docs.oracle.com/javase/8/javafx/scene-graph-tutorial/scenegraph.htm)
- [Realtime editing of ordered sequences — Figma blog (fractional indexing)](https://www.figma.com/blog/realtime-editing-of-ordered-sequences/)
