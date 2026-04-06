# Luminous Feedback: Unfolding UI Design

This document captures feedback and feature proposals for Luminous, gathered from a design session exploring how Luminous could support **UI screen design as an unfolding process**. The motivating project is tinyForum, a forum application built with concept-driven design. The goal is to make Luminous the tool that bridges product concepts → screen structure → component trees → code generation.

An AI agent should read this document and use it to produce a roadmap of improvements to Luminous. The feedback is organized from motivation → problems → proposals → detailed examples.

---

## Table of Contents

1. [Terminology and Definitions](#1-terminology-and-definitions)
2. [Background: tinyForum and Its Design Methodology](#2-background-tinyforum-and-its-design-methodology)
3. [The Use Case: UI Screen Design](#3-the-use-case-ui-screen-design)
4. [Core Problem: Luminous Is Anti-Unfolding](#4-core-problem-luminous-is-anti-unfolding)
5. [Proposal 1: Untyped Nodes and Edges as First-Class Citizens](#5-proposal-1-untyped-nodes-and-edges-as-first-class-citizens)
6. [Proposal 2: Schema Crystallization](#6-proposal-2-schema-crystallization)
7. [Proposal 3: Simplified Connection Semantics (Schema-Pair Descriptions)](#7-proposal-3-simplified-connection-semantics-schema-pair-descriptions)
8. [Proposal 4: Interaction Modeling](#8-proposal-4-interaction-modeling)
9. [Proposal 5: Verification and Audit Tools](#9-proposal-5-verification-and-audit-tools)
10. [Detailed Timeline: Screen Design in Practice](#10-detailed-timeline-screen-design-in-practice)
11. [Reference: tinyForum Concept Inventory](#11-reference-tinyforum-concept-inventory)
12. [Summary of MCP Operations Needed](#12-summary-of-mcp-operations-needed)

---

## 1. Terminology and Definitions

These terms are used throughout this document. Some come from Christopher Alexander's architectural theory, some from Daniel Jackson's software design methodology, and some are specific to the tinyForum/Luminous workflow.

### From Christopher Alexander (*The Nature of Order*, *The Luminous Ground*)

- **Center**: A coherent region of space (or structure) that has some degree of life or wholeness. In UI terms, a visual element that holds attention — a post body, a thread title, a screen. Centers exist in hierarchies: strong centers are supported by weaker ones.

- **Structure-preserving transformation**: A change to a structure that strengthens its existing centers rather than destroying them. The key constraint on unfolding — every step must preserve and enhance what's already there, not replace it. In software: a refactor that clarifies existing behavior, an addition that extends existing patterns.

- **Unfolding**: The process of developing a structure through successive structure-preserving transformations. Starting from a seed, each step responds to the forces present in the current state. The structure "unfolds" like a biological organism — it doesn't get assembled from a blueprint.

- **Ornament**: In Alexander's theory, ornament is not decoration — it is "the structural inner life of a building becoming visible." In UI: progressive disclosure is ornament when the hidden content is the element's inner life revealed (e.g., expanding a reply section reveals structure that was always part of the post).

- **The luminous ground**: Alexander's term for the quality that emerges from the relationships between parts, not from individual parts. Luminous (the tool) is named after this — the value is in the connections and relationships the canvas makes visible, not in any single node.

### From Daniel Jackson (*The Essence of Software*)

- **Concept**: A purpose-driven design abstraction with explicit state, actions, and an operational principle. Concepts are freestanding (they don't know about users, permissions, or other concepts) and composable. Example: the Post concept has state (posts map), actions (createPost, editPost, deletePost), and an operational principle ("a post contributes to a discussion and can be edited by its author or deleted").

- **Concept action**: A named operation on a concept's state. In tinyForum, these map directly to API actions. Example: `react(targetId, author, emoji)` is an action on the Reaction concept.

- **Operational principle**: The behavioral contract of a concept — what a user can expect. Example: "after creating a post in a thread, viewThread returns that post in the thread's post list."

- **Concept composition**: The layer where freestanding concepts are wired together with ownership, permissions, and cross-concept synchronizations. This is where "only the post author can edit" lives — not in the Post concept itself.

### Unfolding Design / Embryonic Design

This is the user's synthesis of Alexander and Jackson applied to software development. The key principles:

- **Start with a seed, not a blueprint.** A one-line document is a valid, finished document. A screen with just a title and three bullet points is a valid, finished screen spec. Nothing is "incomplete" — it's at the right level of development for the forces currently acting on it.

- **Differentiate, don't fill in blanks.** An embryo doesn't have blank spaces where organs will go — it's a complete organism at every stage, and new structures differentiate from existing ones when forces demand them. Documentation, code, and design artifacts work the same way.

- **A change in quantity begets a change in quality.** When enough similar things accumulate (enough similar nodes, enough similar connections), the pattern becomes visible and earns formalization. You don't create a "Screen" schema before you have screens — you create plain nodes, and when you've made four of them with the same structure, you crystallize the schema.

- **No empty scaffolding.** Don't create groups, categories, or schemas "because we'll need them later." Create them when the work demands them. The happy path is minimal and end-to-end.

### tinyForum-Specific Terms

- **Action-based API**: tinyForum uses a tRPC/actions pattern, not REST. Each API endpoint corresponds to a product-level action (e.g., `startThread`, `react`, `viewThread`), not a CRUD operation on a database table. Actions map to concept actions.

- **Contract package**: A shared TypeScript package (`packages/contract`) that defines the `ActionMap` type — a mapping from action names to their request/response types. Both client and server import from this package for type safety.

- **Screen**: A route-level view in the React app. tinyForum currently has 5 screens (Home, SubforumView, ThreadView, Login, Register). In the proposed UI design workflow, screens are the top-level "centers" that receive ornamentation over time.

- **Region**: A structural zone within a screen (header, main content, sidebar, compose area). Not a pixel-level layout — a conceptual grouping of related UI elements.

- **Responsibility**: What a screen or component lets the user do. Responsibilities connect to concept actions (what API calls are needed) and data sources (what data must be fetched). Example: "Reply to the thread" is a responsibility of the Thread screen, which requires the `createPost` action and the `viewThread` data source.

- **UI state**: Local state that doesn't exist in any concept — it's purely about the interface. Examples: which post is being replied to, whether a tinypost section is expanded, whether the emoji picker is open, scroll position. UI state is discovered during screen design but doesn't map to any backend concept.

### Luminous-Specific Terms

- **Construct schema**: Defines a node type in Luminous (e.g., "controller", "db_table"). Each schema has fields (with types and display tiers), port configurations, and compilation settings. Schemas are defined in the document's metamodel before instances can be created.

- **Port schema**: Defines a connection type with polarity (source/sink/bidirectional/relay/intercept) and compatibility rules. Ports must be defined before connections can be made between nodes.

- **Organizer**: A container node in Luminous that groups other nodes visually. Organizers provide spatial structure (freeform layout) and can be nested.

- **Construct instance**: A node on the canvas that is an instance of a construct schema. It has field values, connections, and a semantic ID.

- **Schema crystallization** (proposed): The process of promoting untyped nodes into typed construct instances by inferring a schema from their shared structure. This does not exist in Luminous today — it is the central proposal in this document.

- **Schema-pair description** (proposed): A lookup-based approach to connection semantics where the meaning of an edge is determined by the schemas of its two endpoints plus polarity, rather than by explicit port definitions. This replaces the current port schema system for most use cases.

---

## 2. Background: tinyForum and Its Design Methodology

tinyForum is forum software built with React (client) and Node.js (server). It is a vehicle for exploring unfolding design — the methodology matters as much as the product.

### Architecture

- **Client**: React SPA served as a PWA. Routes: Home (subforum list with thread previews), SubforumView (thread list), ThreadView (posts with tinyposts and reactions), Login, Register.
- **Server**: Node.js, hosts an action-based API and serves the PWA.
- **Contract**: Shared TypeScript package defining action types. The client calls `callAction(actionName, request)` and gets typed responses.
- **Concepts**: 14 freestanding concepts implemented as TypeScript types with property-based tests (fast-check). Concepts define state and actions but not ownership or permissions.

### Development methodology

1. **Spec-driven development (SDD)**: Two sources of truth (product expectations and source code) bridged by four spec groups (product strategy, product design, architecture, code shape). AI is integrated across the entire pipeline, not just code generation. Documentation lives in `.carta/` (a structured documentation workspace).

2. **Concept-driven design**: Product behavior is modeled as composable concepts. Each concept has a purpose, state, actions, and an operational principle. Concepts are tested with property-based tests. The API contract derives from concept actions.

3. **Unfolding process**: Start minimal (hello world), grow complexity only when forces demand it. Every change is a structure-preserving transformation. No empty scaffolding, no premature abstraction.

### Why this matters for Luminous

The user wants to extend this methodology to UI design. Currently, the pipeline is:

```
Product expectations → Concept design → API contract → Code
```

The missing piece is:

```
Concept design → Screen design → Component design → Code
```

Screen design should unfold the same way concepts do — start with a title and a few responsibilities, differentiate into regions and components as forces demand, and eventually produce a component tree detailed enough for an AI agent to implement. Luminous is the proposed tool for this screen design phase.

---

## 3. The Use Case: UI Screen Design

### The end goal

A Luminous canvas that represents a **component tree** for each screen, annotated with:

1. **Concept actions** each component can trigger (maps to API calls)
2. **UI actions** each component handles (expand/collapse, cancel, navigate — local state machine behavior)
3. **Data sources** required by each component/screen (which an AI coding agent can translate into React hooks)
4. **Interaction scenarios** between components (when component A does X, what happens to component B?)
5. **Concept constraints** that affect the UI (max 5 reactions, 140-char tinypost limit, thread lock disables compose)

### The process to get there

The component tree should NOT be designed upfront. It should unfold:

1. **Start**: Screens are just titles with index-card-like notes (responsibilities as bullet points)
2. **Flesh out**: Add data sources and concept actions to each screen (derived from the concept inventory)
3. **Discover regions**: Group responsibilities into structural zones (header, content, compose)
4. **Discover components**: Each region's responsibilities suggest components
5. **Decompose recursively**: Components contain sub-components (PostCard contains ReactionBar, TinypostSection, etc.)
6. **Add interactions**: Describe how components affect each other
7. **Crystallize schemas**: When patterns repeat across screens, formalize them into typed constructs
8. **Verify**: Audit for missing concept actions, unexamined interactions, unaddressed constraints

Each step is a small, atomic operation on the canvas. An AI agent (via MCP) should be able to perform each step, and a human should be able to review the result visually.

---

## 4. Core Problem: Luminous Is Anti-Unfolding

Luminous currently requires **construct schemas and port types to be defined before any nodes or connections can be created**. This is the fundamental tension with unfolding design:

### What Luminous requires today

1. Define a `ConstructSchema` with fields, display tiers, compilation config, and port configurations
2. Define `PortSchema` entries with polarity and compatibility rules
3. Only then can you create instances of that schema and connect them via defined ports

### Why this is anti-unfolding

- **You must commit to vocabulary before understanding the domain.** When starting screen design for a new project, you don't know what node types you'll need. You discover them by working.
- **You must define connection semantics before understanding relationships.** Port schemas require polarity and compatibility rules. But early in the design, you just want to say "these two things are related" — you don't know what kind of relationship it is yet.
- **Freeform exploration is impossible.** You can't put a sticky note on the canvas and draw a line to another sticky note. Everything must be a typed construct connected via typed ports.
- **The schema system front-loads complexity.** Even for a simple "four screens with bullet points" starting point, you'd need to define a Screen schema, a Responsibility schema, and a "has-responsibility" port type. This is speculative abstraction — the exact thing unfolding design rejects.

### The desired experience

The canvas should support **mixed-maturity artifacts**. A canvas should comfortably hold:
- Typed constructs with structured field display (the crystallized end state)
- Freeform notes with just a title and body text (the embryonic starting state)
- Half-crystallized proto-schemas (some nodes typed, some not, all coexisting and connected)

**Every schema started as a sticky note. Luminous should make that literal.**

---

## 5. Proposal 1: Untyped Nodes and Edges as First-Class Citizens

### Untyped nodes

A user should be able to create a **plain node** — just a title and a freeform body. No schema, no ports, no fields. Just a thing on the canvas.

This is the embryo. It is a valid, finished artifact until forces demand more structure.

Visual treatment: untyped nodes should look like text cards or index cards — visually distinct from typed constructs (which have structured field display, colored headers, port handles). The distinction should be subtle enough that mixed-maturity canvases feel cohesive, not like two different tools were used.

### Untyped edges

A user should be able to draw a line between **any two nodes** — typed or untyped. No port definition required. The edge optionally has a freeform text label ("needs," "contains," "triggers"), but it's just a string, not a port schema reference.

### Nesting

A user should be able to nest any node inside any other node (containment). This is the "index card inside a screen card" pattern. Nesting is structural — it means "this is part of that" — and doesn't require a port or schema definition.

### MCP operations

The MCP server should support these operations for untyped artifacts:

- `create_note(title, body?)` — create an untyped node
- `connect(fromNodeId, toNodeId, label?)` — create an untyped edge
- `nest(parentNodeId, childNodeId)` — move a node inside another (containment)
- `update_note(nodeId, title?, body?)` — edit an untyped node's content

These are the minimal operations for Snapshot 1 (see Section 10).

### Relationship to existing organizers

Luminous already has organizer nodes for grouping. The question is whether untyped nodes should be organizers, a new node type, or something else. The key requirements:

1. Untyped nodes should be nestable (contain children)
2. Untyped nodes should be connectable (have edges to/from other nodes)
3. Untyped nodes should be promotable to typed constructs (see Proposal 2)
4. Untyped nodes should appear in compilation output (so AI can consume them as context)

Currently, organizer nodes are purely spatial grouping — they don't have fields, don't compile, and are separate from semantic (construct) nodes. Untyped nodes need to be semantic (they carry meaning, not just layout), so they're likely a new concept or an evolution of constructs to support a "no schema" state.

---

## 6. Proposal 2: Schema Crystallization

### The concept

When multiple untyped nodes share the same structure — they all have similar bullet points, they're all connected to similar things, they all play the same role — the system should help the user **crystallize** them into a typed schema.

This is a structure-preserving transformation: the nodes don't move, their connections don't change, their content doesn't change. They just gain a type, and their freeform content maps to structured fields.

### The workflow

1. User creates several untyped nodes over time (e.g., four screen descriptions)
2. User (or AI) notices they all have the same structure (title, route, responsibilities)
3. User selects the nodes and triggers "Crystallize into schema"
4. The system (or AI via MCP) infers fields from the nodes' freeform content:
   - Title → `name` field (string, pill tier)
   - Route → `route` field (string, summary tier)
   - Bullet points → could become a `responsibilities` field or remain as nested child nodes
5. A new `ConstructSchema` is created
6. The selected nodes are upgraded from untyped → instances of the new schema
7. All existing edges to/from these nodes are preserved

### MCP operation

- `crystallize(nodeIds[], schemaName, fieldMapping?)` — promote selected untyped nodes to a new or existing schema

The `fieldMapping` parameter is optional. If omitted, the AI should infer the mapping from the nodes' content. If provided, it maps freeform content regions to field names.

### When to crystallize

Crystallization should be prompted by **pattern repetition**, not by upfront planning. Heuristics for when the MCP or UI could suggest crystallization:

- 3+ nodes with similar structure (same bullet-point categories, same kinds of connections)
- Multiple nodes connected to the same kinds of targets with similar labels
- User explicitly asks ("make these all Screens")

The system should never require crystallization. Untyped nodes remain valid indefinitely.

### Edge crystallization

The same principle applies to edges. When multiple untyped edges have the same label and connect the same schema pair (e.g., many edges labeled "needs data" from Component nodes to DataSource nodes), the system can suggest promoting them to a typed port relationship.

---

## 7. Proposal 3: Simplified Connection Semantics (Schema-Pair Descriptions)

### The current port model

Luminous currently requires:
1. A `PortSchema` with id, polarity, and `compatibleWith` rules
2. A `PortConfig` on each construct schema referencing the port schema
3. Edges connect specific port configs on specific constructs

This is powerful but heavyweight. It means you need to define the full connection vocabulary before you can model relationships.

### The proposed model: schema-pair descriptions

**Edges connect nodes. Period.** If both nodes have schemas, the edge's meaning is determined by a **lookup table** of schema-pair descriptions:

| From schema (out) | To schema (in) | Description |
|---|---|---|
| Screen | Component | "this screen contains this component" |
| Component | Component | "this component contains this child component" |
| Interaction | Component | "this interaction involves this component" |
| Component | Action | "this component can trigger this action" |
| Component | DataSource | "this component requires this data" |
| Constraint | Component | "this concept constraint affects this component's behavior" |

The polarity (out/in, i.e. which node is source and which is target) disambiguates direction. The schema pair disambiguates meaning.

### Key properties

1. **No port definitions needed.** You never need to define a `PortSchema` or `PortConfig` for this to work. The meaning comes from context.

2. **Untyped edges gain meaning retroactively.** An edge between two untyped nodes means nothing specific — just "related." When one node is crystallized into a `Component` and the other into an `Action`, the edge now means "triggers" based on the schema-pair table — without anyone touching the edge.

3. **Schema-pair descriptions are themselves an unfolding artifact.** You start with no entries (all edges are freeform). As you crystallize schemas, Luminous can prompt: "You've created the Interaction schema. There are 12 edges from Interaction nodes to Component nodes. What does this connection mean?" You write one sentence, and all 12 edges gain that semantics retroactively.

4. **Number of connection types scales with schema pairs, not with individual ports.** You don't end up with dozens of port types. You have schemas and a small table of what it means when they're connected.

### The edge case: same schema pair, different meanings

Component → Component could mean "contains" or "navigates to." If this arises, options:
- Split into two schemas (Container vs NavigationTarget)
- Allow multiple labeled edges between the same pair (the label disambiguates)
- Allow a single schema-pair entry to have sub-types

This should be handled when the force appears, not designed upfront.

### Relationship to current port system

This proposal doesn't necessarily replace the current port system — it could coexist. Ports remain available for domains that genuinely need fine-grained connection typing (e.g., database schema modeling where foreign keys vs. joins vs. inheritance are all distinct). But for the UI design use case (and likely many others), schema-pair descriptions are sufficient and dramatically simpler.

The key question for the Luminous roadmap: should this be the default (with ports as an advanced feature) or an alternative mode?

---

## 8. Proposal 4: Interaction Modeling

### The problem

UI screens have interaction complexity that doesn't exist in concept design. When a user clicks "reply" on a post, several things happen across multiple components:
- ComposePost gets a replyToId
- A ReplyIndicator appears
- The view scrolls to the compose area
- If the user was already replying to a different post, that reply-to is replaced
- If the thread is locked, the reply button shouldn't exist at all

These cross-component interactions are where UI bugs live. They're also hard to discover — you only find them by systematically asking "when component A is in state X, what happens if the user does Y in component B?"

### Proposal: interactions as sibling notes

Interactions should start as **untyped notes nested alongside components** within a screen:

```
Thread Screen
  ├── PostCard           (component)
  ├── ComposePost        (component)
  ├── ReactionBar        (component)
  │
  └── interactions/
        ├── "reply: PostCard → ComposePost"
        │     • sets replyToId to this post
        │     • scrolls to compose area
        │     • replaces existing reply-to
        │     • hidden if thread is locked
        │
        ├── "cancel reply: ComposePost → ComposePost"
        │     • clears replyToId
        │     • clears draft text
        │
        └── "react: PostCard → ReactionBar"
              • opens picker anchored to post
              • disabled if 5 reactions reached
              • disabled if thread is locked
```

Each interaction note names two components and describes the scenarios. It's just text — no special schema, no port type.

### Promotion path

When interactions repeat across screens (e.g., "navigate" interactions, "expand/collapse" interactions), they can be crystallized into a schema. The interaction note becomes a typed `Interaction` node connected to the two components it describes. The connection semantics come from the schema-pair table:

- `Interaction (out) → Component (in)` = "this interaction involves this component"

### Why not state machines?

Full statecharts (Harel, XState) are exhaustive but exhausting. They're the right tool for mature, stable interfaces, but they're anti-unfolding — they require knowing all states and transitions upfront. Interaction notes are the embryonic form. They can be promoted to statecharts later if a component's interaction complexity warrants it.

---

## 9. Proposal 5: Verification and Audit Tools

### The problem

When designing screens, how do you know you haven't missed something? Concept actions that no component triggers? Components connected to each other with no description of what happens? Concept constraints (max 5 reactions, 140-char limit) that no component accounts for?

### Three verification passes

All can be run from the canvas JSON + external source files (concept definitions, API contract):

#### Pass 1: Coverage Diff (concept actions vs. component tree)

For each concept the screen touches, list its actions. Check whether each action appears somewhere in the screen's component tree (either as a direct annotation or as an interaction trigger).

**Output**: "These actions exist in concepts but have no component that triggers them."

**Example**: Thread screen references the Post concept but no component mentions `editPost`. Is editing intentionally excluded, or was it forgotten?

#### Pass 2: Bare Edges (connections without scenario annotations)

Find edges in the graph that have no label or description. These represent unexamined relationships.

**Output**: "These components are connected but the interaction is unexamined."

**Example**: PostCard is connected to ReactionBar but there's no interaction note describing what happens when max reactions are reached.

#### Pass 3: Constraint Audit (concept invariants vs. component annotations)

Extract constraints from concept definitions:
- Numeric limits (tinypost body ≤ 140 chars, max 5 reactions per author per target)
- Conditional guards (thread lock prevents new posts, at least one authenticator must remain)
- State-dependent rendering (deleted post retains structure, shows placeholder)

Check whether each constraint is accounted for in some component's annotations.

**Output**: "These constraints exist in concepts but no component accounts for them."

**Example**: The Reaction concept enforces max 5 reactions per author per target. Does any component show feedback when this limit is reached?

### MCP operations

These could be exposed as MCP tools:

- `audit_coverage(screenNodeId, conceptRefs[])` — returns unaccounted actions and data sources
- `audit_interactions(screenNodeId)` — returns edges and connections missing scenario annotations
- `audit_constraints(screenNodeId, conceptRefs[])` — returns concept invariants with no corresponding component annotation

Each returns a list of gaps — prompts for the next unfolding step. The human decides whether a gap is real or intentional, and adds a note either way. The audit tools never prescribe solutions; they surface what hasn't been examined yet.

### Integration with external sources

The audit tools need access to concept definitions and API contract types. These could be:
- Read from the filesystem (if Luminous workspace is colocated with the codebase)
- Provided as context via MCP resources
- Imported as a schema package (concept schemas as Luminous constructs)

The cleanest path is probably MCP resources — the concept definitions are already structured TypeScript, and the Luminous MCP server could read them and use them for auditing.

---

## 10. Detailed Timeline: Screen Design in Practice

This section walks through the full unfolding sequence for designing tinyForum's UI in an idealized future Luminous. Each snapshot shows what the canvas looks like and what operations were used.

### Snapshot 1: Four screens as index cards

The canvas has four untyped nodes. Each has a title and bullet-point notes. No connections, no schemas, no ports.

```
┌─────────────────────┐   ┌─────────────────────────┐
│ Server List         │   │ Homepage                │
│                     │   │                         │
│ • browse servers    │   │ • see all subforums     │
│ • add a server      │   │ • preview recent threads│
│ • notification      │   │ • navigate to subforum  │
│   counts per server │   │                         │
└─────────────────────┘   └─────────────────────────┘

┌─────────────────────┐   ┌─────────────────────────┐
│ Subforum            │   │ Thread                  │
│                     │   │                         │
│ • browse threads    │   │ • read conversation     │
│ • start new thread  │   │ • reply                 │
│ • see thread        │   │ • react to posts        │
│   previews          │   │ • tinyposts             │
└─────────────────────┘   └─────────────────────────┘
```

**Operations used**: `create_note` × 4

**What's here**: Seeds. Each screen is a center that will develop ornamentation. The bullet points are responsibilities — what the screen lets the user do. They're freeform text, not structured fields.

**What's intentionally absent**: No connections between screens (navigation isn't the focus yet). No data sources. No components. No schemas.

### Snapshot 2: Fleshing out the Thread screen

Pull on the Thread card. Ask: "What does this screen need to do, and what data does it need?"

The concept inventory directly answers this. The Thread screen touches these concepts: Thread, Post, Tinypost, Reaction, Identity, Ordering, Content Removal, Thread Lock. Each concept's actions enumerate the screen's responsibilities.

Add child notes to the Thread card, organized into three natural categories that emerge from the question (not planned upfront):

```
┌──────────────────────────────────────────────────────┐
│ Thread                                               │
│                                                      │
│ DATA                                                 │
│ • viewThread → posts[] with tinyposts, reactions     │
│ • me → current user identity                         │
│ • isLocked? → controls whether compose is available  │
│                                                      │
│ ACTIONS (from concepts)                              │
│ • createPost(threadId, body, replyToId?)             │
│ • editPost(postId, body)                             │
│ • deletePost(postId)                                 │
│ • createTinypost(postId, body)                       │
│ • editTinypost / deleteTinypost                      │
│ • react(postId, emoji) / removeReaction              │
│ • reactToTinypost / removeReactionFromTinypost       │
│                                                      │
│ UI STATE (not from concepts — local to screen)       │
│ • which post is being replied to                     │
│ • which post is being edited                         │
│ • tinypost section expanded/collapsed per post       │
│ • scroll position / "jump to latest"                 │
│ • emoji picker open/target                           │
│ • compose draft text                                 │
└──────────────────────────────────────────────────────┘
```

**Operations used**: `update_note` (add structured body content to Thread card), or `create_note` + `nest` for each section as a child note.

**What emerged**: Three categories (DATA, ACTIONS, UI STATE) appeared naturally from asking "what does this screen need?" They were not planned. If the same three categories appear when fleshing out the other three screens, that's a crystallization signal — they could become structured fields on a Screen schema.

**How concepts helped**: The concept inventory was directly consulted. Every action in the ACTIONS section comes from a specific concept. Every data source comes from a specific API action. The UI STATE section is the residual — what the concepts don't cover, the screen must manage locally.

### Snapshot 3: Regions and components emerge

Ask: "What regions does the Thread screen have?" Each region groups related responsibilities. Regions become their own nodes connected to the Thread screen.

```
                    ┌──────────────┐
                    │ Thread       │
                    │ (screen)     │
                    └──┬───┬───┬──┘
            ┌──────────┘   │   └──────────┐
            ▼              ▼              ▼
   ┌─────────────┐ ┌────────────┐ ┌──────────────┐
   │ ThreadHeader│ │ PostList   │ │ ComposePost  │
   │             │ │            │ │              │
   │ • title     │ │ • scrolls  │ │ • body input │
   │ • subforum  │ │ • ordered  │ │ • replyTo    │
   │   back-link │ │   posts    │ │   indicator  │
   │ • lock      │ │            │ │ • disabled   │
   │   indicator │ │            │ │   if locked  │
   └─────────────┘ └─────┬──────┘ └──────────────┘
                          │
                          ▼
                  ┌──────────────┐
                  │ PostCard     │
                  │              │
                  │ • author     │
                  │ • body       │
                  │ • actions:   │
                  │   edit,delete│
                  │   reply,react│
                  │ • tinyposts  │
                  │   (collapse) │
                  └──────┬───────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
        ┌──────────┐┌──────────┐┌───────────┐
        │TinypostSe││ReactionBa││ReplyIndica│
        │ction     ││r         ││tor        │
        └──────────┘└──────────┘└───────────┘
```

**Operations used**: `create_note` for each component, `connect` to link parent → child, `nest` for containment.

**What emerged**: A component tree. The hierarchy is "contains." Some annotations reference concept actions (edit, delete, reply, react), some reference UI behavior (scrolls, collapse, disabled if locked). It's mixed maturity — some nodes are detailed, some are just names. That's fine.

### Snapshot 4: Interactions added

Add interaction notes as siblings to the components:

```
Thread Screen
  ├── ThreadHeader
  ├── PostList
  │     └── PostCard
  │           ├── TinypostSection
  │           ├── ReactionBar
  │           └── ReplyIndicator
  ├── ComposePost
  │
  └── interactions/
        ├── "reply: PostCard → ComposePost"
        │     • sets replyToId
        │     • scrolls to compose
        │     • replaces existing reply-to
        │     • hidden if locked
        │
        ├── "cancel reply: ComposePost → ComposePost"
        │     • clears replyToId and draft
        │
        ├── "react: PostCard → ReactionBar"
        │     • opens picker anchored to post
        │     • disabled at 5 reactions
        │
        ├── "expand tinyposts: PostCard → TinypostSection"
        │     • toggles visibility
        │     • shows compose tinypost input when expanded
        │
        └── "edit post: PostCard → PostCard"
              • replaces body with editable textarea
              • shows save/cancel buttons
              • hides other actions while editing
```

**Operations used**: `create_note` + `nest` for each interaction. Optionally `connect` from the interaction note to the two components it references.

### Snapshot 5: Crystallization

After repeating Snapshots 2-4 for all four screens, patterns emerge:

- Every screen has DATA / ACTIONS / UI STATE sections → crystallize into a **Screen** schema with those as structured fields
- PostCard, ThreadListItem, etc. all have "actions" and "data dependencies" → crystallize into a **Component** schema
- Interaction notes all name two components and list scenarios → crystallize into an **Interaction** schema
- "react," "createPost," etc. keep appearing as text → link them to concept nodes (if concepts are also on the canvas) rather than repeating strings

**Operations used**: `crystallize(nodeIds[], schemaName, fieldMapping)` for each schema. Existing edges preserved.

### Snapshot 6: Verification

Run the three audit passes:

1. **Coverage**: "The Thread screen references the ContentRemoval concept, but no component handles the 'removed post' rendering. The Post concept has `deletePost` but no component shows a confirmation dialog."
2. **Bare edges**: "PostCard → ComposePost edge exists but has no interaction note. What happens when the user clicks reply while already editing a post?"
3. **Constraints**: "Tinypost body ≤ 140 chars — no component shows a character counter. Reaction max 5 — ReactionBar has no annotation for limit-reached state."

Each gap prompts the user to either add an annotation (if the gap is real) or mark it as intentional (if the feature is excluded by design).

---

## 11. Reference: tinyForum Concept Inventory

This section lists all 14 tinyForum concepts with their actions. This is the source material that the screen design process draws from. Each concept is freestanding — it doesn't know about users, permissions, or other concepts.

### Thread
**Purpose**: Host a focused discussion with a clear topic.
- `startThread(subforumName, title) → threadId`
- `viewThread(threadId) → postIds[]`

### Post
**Purpose**: Contribute to a discussion.
- `createPost(threadId, author, body, replyToId?) → postId`
- `editPost(postId, body)`
- `deletePost(postId)`
- `viewPost(postId) → Post`

### Tinypost
**Purpose**: Quick reactions that don't clutter the main thread (max 140 characters).
- `createTinypost(postId, author, body) → tinypostId` — fails if body > 140 chars
- `editTinypost(tinypostId, body)` — fails if body > 140 chars
- `deleteTinypost(tinypostId)`

### Reaction
**Purpose**: Express quick sentiment without words.
- `react(targetId, author, emoji)` — max 5 reactions per author per target
- `removeReaction(targetId, author, emoji)`

### Subforum
**Purpose**: Organize discussions by topic.
- `createSubforum(name, description)`
- `listSubforums() → Subforum[]`
- `listThreads(subforumName) → threadIds`

### Identity
**Purpose**: Distinguish who said what.
- `createIdentity(name) → identityId` — name must be unique
- `rename(identityId, newName)` — newName must be unique
- `getIdentity(identityId) → {name}`

### Membership
**Purpose**: A person participates in the forum.
- `enroll(membershipId?) → membershipId`
- `getMembership(membershipId) → {identityId}`

### Session
**Purpose**: Permit actions by an authenticated member for a bounded duration.
- `openSession(membershipId) → token`
- `closeSession(token)`
- `getSession(token) → {membershipId}`

### Ordering
**Purpose**: Present items in a useful sequence.
- `rank(collectionKey, itemId, signal)`
- `list(collectionKey) → itemIds[]` (sorted ascending by sort key)

### Appointment
**Purpose**: Designate users for privileged roles.
- `appoint(identityId, role)`
- `revoke(identityId, role)`
- `holds(identityId, role) → boolean`

### Content Removal
**Purpose**: Remove harmful content from the forum.
- `removePost(postId, originalBody, reason, removedBy)`
- `restorePost(postId) → Removal`

### Thread Lock
**Purpose**: Freeze a discussion to prevent escalation.
- `lockThread(threadId, reason, lockedBy)`
- `unlockThread(threadId) → Lock`
- `isLocked(threadId) → boolean`

### Authenticator
**Purpose**: A proof-tool bound to a membership.
- `enrollAuthenticator(membershipId, type, config)`
- `getAuthenticators(membershipId) → Array<{type, config}>`
- `revokeAuthenticator(membershipId, type)` — at least one must remain
- `findByAuthenticator(type, config) → membershipId?`

### Challenge
**Purpose**: Demand and verify proof of authenticator possession.
- `issueChallenge(membershipId, authenticatorType, expectedAnswer, ttlMs?) → challengeId`
- `respondToChallenge(challengeId, answer) → Attestation`

### API Actions (25 total)

The full list of API actions derived from these concepts:

**Queries (GET)**: `sayHello`, `listSubforums`, `listThreads`, `viewThread`, `me`, `getAuthConfig`, `listDevUsers`

**Mutations (POST)**: `startThread`, `createPost`, `editPost`, `deletePost`, `createTinypost`, `editTinypost`, `deleteTinypost`, `react`, `removeReaction`, `reactToTinypost`, `removeReactionFromTinypost`, `createSubforum`, `register`, `verifyRegistration`, `login`, `verifyLogin`, `logout`, `devSelectLogin`, `devCreateUser`

---

## 12. Summary of MCP Operations Needed

### Core operations (enable unfolding)

| Operation | Purpose | Snapshot |
|---|---|---|
| `create_note(title, body?)` | Create an untyped node (index card) | 1 |
| `update_note(nodeId, title?, body?)` | Edit an untyped node's content | 2 |
| `connect(fromId, toId, label?)` | Create a freeform edge between any two nodes | 3 |
| `nest(parentId, childId)` | Containment — move a node inside another | 2, 3, 4 |

### Crystallization operations (formalize patterns)

| Operation | Purpose | Snapshot |
|---|---|---|
| `crystallize(nodeIds[], schemaName, fieldMapping?)` | Promote untyped nodes to a typed schema | 5 |
| `describe_schema_pair(fromSchema, toSchema, description)` | Define what an edge means between two schema types | 5 |

### Verification operations (find gaps)

| Operation | Purpose | Snapshot |
|---|---|---|
| `audit_coverage(screenNodeId, conceptRefs[])` | Find concept actions not accounted for in the component tree | 6 |
| `audit_interactions(screenNodeId)` | Find connections without scenario annotations | 6 |
| `audit_constraints(screenNodeId, conceptRefs[])` | Find concept invariants not addressed by any component | 6 |

### Existing operations that remain useful

All current MCP batch operations (create, update, delete, connect, disconnect, move, arrange) remain useful for typed constructs. The proposals above extend Luminous downward (toward less structure) and upward (toward verification), but don't replace the existing typed workflow.
