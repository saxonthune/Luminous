---
title: Concept Inventory
summary: Luminous concepts (Jackson framework) — Workspace, Document, Note, Edge, Nesting, Canvas, Selection, Schema, Formalization, Schema-Pair, Verification
tags: [concepts, design, jackson, formalization, unfolding]
deps: [doc01.02.01, doc01.01.01]
---

# Concept Inventory

Luminous concepts analyzed using Daniel Jackson's concept-driven design framework (*The Essence of Software*). Each concept has a purpose, state, actions, and operational principle. Concepts are freestanding and composable — the seed (Milestone 0-1) needs only the first five; later concepts compose on top without breaking earlier ones.

See doc01.02.01 for architectural decisions. See doc01.01.01 for the vision these concepts serve.

## Dependence Diagram

```
Workspace → Document → Canvas ← Note ← Nesting
                         ↑        ↑
                      Selection   Edge
                                     ↘
                                Schema ← Schema-Pair Description
                                  ↑
                             Formalization
                                  ↑
                              Verification
```

Workspace depends on Document (lists what's available). Document depends on Canvas (serializes its state). Concepts below the break (Schema and beyond) depend on concepts above. Concepts above are complete without those below.

---

## Infrastructure Concepts

### Workspace

**Purpose:** Know what documents exist so you can choose one to open.

| | |
|---|---|
| **State** | files: set of `{path, name, lastModified}` |
| **Actions** | `listDocuments()`, `openDocument(path)`, `createDocument(name)` |
| **OP** | User starts the client. Sees a list of available canvases. Picks one. Now they're in the Document concept working on a canvas. |

Workspace is the entry point. It's what the user sees before any canvas. The server implements this by scanning its root directory for `.canvas.json` files.

### Document

**Purpose:** Persist canvas state as a versionable, readable file.

| | |
|---|---|
| **State** | file path, document content (all nodes, edges, schemas) |
| **Actions** | `save`, `load`, `watch` |
| **OP** | User edits canvas. Changes persist to `.canvas.json`. Git tracks versions. AI reads the file for structured context. The document is the bridge between human visual work and AI consumption — it's what makes the canvas useful beyond the screen. |

Document is infrastructure. It has no domain opinions — it serializes whatever the canvas contains. The server debounce-writes on mutation and reloads on external file changes.

---

## Seed Concepts (Milestone 1)

### Note

**Purpose:** Capture thinking without committing to structure.

| | |
|---|---|
| **State** | notes: set of `{id, title, body}` |
| **Actions** | `createNote(title, body?)`, `updateNote(id, title?, body?)`, `deleteNote(id)` |
| **OP** | User creates a note with a title and a few bullet points. It appears on the canvas. They edit it as thinking evolves. It compiles to `{title, body}` — enough for an AI agent to read and reason about. |

A note is always valid. A one-word title with no body is a complete note. There is no "incomplete" state — the note is at the right level of detail for the current forces.

### Edge

**Purpose:** Express that two things are related without saying how.

| | |
|---|---|
| **State** | edges: set of `{id, fromId, toId, label?}` |
| **Actions** | `connect(fromId, toId, label?)`, `disconnect(id)`, `relabel(id, label)` |
| **OP** | User drags from one node to another; a line appears. Optionally they label it. The relationship exists before anyone names it precisely. When both endpoints are later formalized, the edge gains meaning retroactively via Schema-Pair Description. |

Edges are undirected by default. Direction is visual (follows drag gesture) but carries no semantic weight until a Schema-Pair Description assigns it.

### Nesting

**Purpose:** Express that one thing is part of another.

| | |
|---|---|
| **State** | children: relation `parentId → childId[]` |
| **Actions** | `nest(parentId, childId)`, `unnest(childId)` |
| **OP** | User drags a note into another; it becomes spatially contained. Parent auto-resizes to fit. Nesting is structural — "this belongs inside that." A thread screen contains a post list; a post list contains post cards. |

Universal: any node can contain children, any node can be nested. Nesting survives formalization unchanged (doc01.02.01, D7) — when a parent is formalized, children stay as-is.

### Canvas

**Purpose:** Spatially arrange and navigate artifacts so structure is visible.

| | |
|---|---|
| **State** | viewport `{x, y, zoom}`, node positions `{id → {x, y, w, h}}` |
| **Actions** | `pan`, `zoom`, `moveNode`, `resizeNode`, `arrangeLayout(algorithm)` |
| **OP** | User places notes on an infinite surface. Zooms out to see the whole tree, zooms in to work on one branch. Spatial proximity conveys relatedness. When edges imply structure the eye can't see, user hits "tree layout" — nodes reposition to reveal the hierarchy. The arrangement *is* the reasoning — not decoration of it. |

Canvas is the ground concept. All other concepts exist on the canvas. The engine is called cactus (`@luminous/cactus`): custom, domain-agnostic, uses d3-zoom and DOM data-attribute hit-testing.

### Selection

**Purpose:** Designate targets for bulk operations.

| | |
|---|---|
| **State** | selected: set of IDs |
| **Actions** | `select(id)`, `deselect(id)`, `boxSelect(rect)`, `clearSelection` |
| **OP** | User box-selects four similar notes, then applies formalization to all four. Selection bridges pointing and acting — it's how the user says "these ones" before saying what to do with them. |

Selection is consumed by other concepts (delete, move, formalize) but owns no domain behavior itself.

---

## Structure Concepts (Milestone 2-3)

### Schema

**Purpose:** Formalize recurring structure so instances are comparable and machine-readable.

| | |
|---|---|
| **State** | schemas: set of `{name, fields[], displayConfig}` |
| **Actions** | `defineSchema(name, fields)`, `editSchema(name, fields)`, `deleteSchema(name)` |
| **OP** | After creating four screen notes that all have DATA / ACTIONS / UI STATE sections, user (or AI) defines a Screen schema with those three fields. Now all four instances share structure. AI can diff them, find gaps, generate code from them. |

Schemas emerge from patterns in notes — they are never the starting point. A schema without instances is suspicious; instances without a schema are normal.

### Formalization

**Purpose:** Promote informal notes into typed instances when patterns demand it.

| | |
|---|---|
| **State** | promotions: relation `noteId → {schemaName, fieldMapping}` |
| **Actions** | `formalize(noteIds[], schemaName, fieldMapping?)`, `informalize(nodeId)` |
| **OP** | User selects four similar notes. Formalize. System infers schema from shared structure, or user picks an existing schema. Freeform body content maps to structured fields. Edges, nesting, position all preserved. The note didn't disappear — it gained structure. |

This is the central structure-preserving transformation. It synchronizes Note and Schema: a formalized node is simultaneously a note (it still has a title and body) and a schema instance (its fields are queryable). Formalization is reversible — `informalize` strips the schema binding, returning to freeform.

### Schema-Pair Description

**Purpose:** Define what edges mean between typed endpoints without per-node port definitions.

| | |
|---|---|
| **State** | descriptions: relation `(fromSchema, toSchema) → description` |
| **Actions** | `describeSchemaPair(from, to, desc)`, `removeDescription(from, to)` |
| **OP** | After formalizing Screen and Component schemas, user describes the pair: "this screen contains this component." Existing freeform edges between Screen and Component nodes retroactively gain that meaning — no edge was touched, only the lookup table changed. |

Schema-Pair Description synchronizes Edge and Schema. It makes edge meaning emergent rather than pre-declared. The three-polarity port system (in/out/neutral) remains available for domains that need fine-grained connection typing (doc01.02.01, D1, D3).

---

## Verification Concepts (Milestone 4-5)

### Verification

**Purpose:** Surface design gaps by comparing canvas against concept specifications.

| | |
|---|---|
| **State** | audit results: `{gaps[], coverage}` |
| **Actions** | `auditCoverage(nodeId, conceptRefs[])`, `auditInteractions(nodeId)`, `auditConstraints(nodeId, conceptRefs[])` |
| **OP** | AI runs coverage audit: "Post concept has a deletePost action but no screen in the canvas has a delete confirmation component." Each gap is a prompt for the next unfolding step — not a failure, but a thing to consider adding. Verification closes the loop between design and specification. |

Verification synchronizes the canvas with external concept inventories. It's the concept that makes Luminous a *design* tool rather than just a canvas.

---

## Composition Notes

**Free composition (seed):** Note, Edge, Nesting, Canvas, Selection run independently. A note doesn't know about edges; an edge doesn't know about nesting. They compose freely on the canvas.

**Synchronization (formalization):** Formalization synchronizes Note and Schema — it's the action that bridges informal and formal. Schema-Pair Description synchronizes Edge and Schema — it's the action that gives edges meaning. Both are opt-in; nothing breaks without them.

**Existence coupling:** When a note is deleted, edges referencing it must be disconnected, and children must be unnested (or deleted). This is the only mandatory synchronization in the seed.

**No overloading:** Note and Schema are deliberately separate concepts even though a formalized node participates in both. This avoids the anti-pattern of an overloaded concept serving two purposes. The formalization action is the explicit synchronization point.

---

## Direction: Polymorphic Nodes and Modeling Formalisms

*Research session doc01.03.02 explores this in depth.*

The concepts above describe Luminous's own behavior — what the user interacts with (Jackson's domain). But the *content* users create on the canvas often doesn't fit the concept framework. State machines, component trees, transformation pipelines, and resource dependency graphs are structural models, not behavioral concepts. Forcing them into Jackson's template (purpose, actions, operational principle) produces decoration rather than insight.

**Concepts for the tool, formalisms for the content.** The concept inventory describes how Luminous works. Modeling formalisms — state machines, flowcharts, DAGs, decision tables — are what users build *on* Luminous. Each formalism is a configuration of the same primitives: typed nodes + typed edges + structural constraints.

**Polymorphic node model.** The Note concept (above) is one node variant, not the only one. The data model evolves toward a discriminated union: every node shares base properties (position, size, nesting) and a `type` field that determines its rendering and behavior. Notes render title + body. Portals render another canvas's contents. Future types (promoted/schema-bound nodes, custom model nodes) follow the same pattern.

**Progressive structure.** The lifecycle of content on a canvas is: freeform (vocabulary) → typed (formalization) → constrained (model definition) → verified (gap detection). Each layer is useful alone. Users stop where the forces stop.
