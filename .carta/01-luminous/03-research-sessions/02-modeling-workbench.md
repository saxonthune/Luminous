---
title: From Concept Design to Modeling Workbench
summary: Research session exploring how Luminous evolves from concept-driven design to a general modeling workbench — vocabulary building, progressive formalization, and verification across multiple modeling formalisms
tags: [research, modeling, concepts, formalization, verification, vocabulary]
deps: [doc01.01.01, doc01.02.01, doc01.02.02]
---

# From Concept Design to Modeling Workbench

Research session, 2026-04-08. Started from the question of canvas composition (embedding one canvas inside another), which led to polymorphic node types, which led to the question: what *kinds* of things should a canvas hold? That question exposed a deeper one about what Luminous is for.

## The Trigger: Concepts vs Entities

Jackson's concept-driven design (doc01.02.02) works well for user-facing behavior. "Upvote" has a purpose, actions, a lifecycle. "Trash" has an operational principle. These are real behavioral concepts.

But much of software design is structural, not behavioral:
- A UI component tree doesn't have "actions" in Jackson's sense
- A data transformation pipeline doesn't have an "operational principle"
- A resource dependency graph doesn't have a "purpose" beyond "this is what exists"
- States in a state machine aren't concepts — the state machine is a *formalism* with rules

Forcing structural entities into the concept template produces decoration. You write "Purpose: represent a state" and it's vacuous. The purpose isn't in the node — it's in the *model* that gives the node structural meaning.

**Resolution:** Use concepts for Luminous itself (the tool's behavior). Use modeling formalisms for what users create with the tool (the content). These are different levels. The concept inventory (doc01.02.02) describes how Luminous works. The modeling formalisms are what users build *on* Luminous.

## All Models Are Constrained Graphs

Every modeling formalism the tool should support shares a common shape: nodes with types, edges with types, structural constraints, and verification rules.

| Model | Nodes | Edges | Key Constraint |
|-------|-------|-------|----------------|
| State machine | States | Transitions (w/ guards) | One start, all reachable, deterministic |
| Component tree | Components | Containment | Acyclic, single root |
| Resource graph | Resources | Dependencies | DAG, satisfiable |
| Flowchart | Actions, decisions | Control flow | Start-to-end path, complete branching |
| Decision table | (matrix, not graph) | N/A | Complete coverage, no contradictions |
| Concept (Jackson) | Structured description | N/A | Purpose exists, OP demonstrates it |
| Transformation pipeline | Stages, artifacts | Data flow | Every stage has I/O, pipeline is a DAG |

The canvas engine (cactus) already provides: positioned nodes, edges between nodes, nesting. What's missing is: node type polymorphism, edge typing, structural constraints, and verification. Each of these can be added as a layer without disturbing what's below.

## Grounding Example: Payroll

Consider a company doing household payroll and taxes. The domains: enrollment, account management, payroll management, tax account management, money movement, tax filing, back-office (compliance, KYC, AML, billing).

A designer needs to model how data transforms through the system: payroll entry becomes tax liability, becomes outstanding balance, becomes collection information, becomes money movement, becomes completed transaction. At each step there are preconditions, edge cases, and failure modes.

**Phase 1 — Vocabulary.** Create notes on a canvas: "Payroll Entry", "Tax Liability Calculation", "Outstanding Balance", "Collection Record", "Money Movement", "Transaction Completion." Draw labeled edges: "calculate", "generate", "collect", "move", "complete." Also: domain entities like "Employer", "Employee", "Tax Agency" with relationship edges.

This is already useful. A new team member sees the visual vocabulary and understands the domain. No types, no constraints — just named things and named relationships.

**Phase 2 — Emerging patterns.** The user notices: some notes are things-that-exist (Employer, Employee), some are things-that-happen (Tax Calculation, Money Movement), some are intermediate state (Outstanding Balance). Three kinds of thing. This is the moment for promotion.

**Phase 3 — Progressive typing.** Promote: Resource, Transformation, Artifact schemas. Promote individual notes to instances. Schema fields emerge from what notes already contain — a Transformation has {input, output, preconditions, postconditions}. An Artifact has {data_shape, produced_by, consumed_by}.

**Phase 4 — Constraints.** "Every Transformation must have at least one input and output Artifact." "The transformation graph must be a DAG." "Every terminal Artifact must be consumable by an external system."

**Phase 5 — Verification and edge case enumeration.** AI traverses the typed graph. At each Transformation: "What happens when the input is missing? Malformed? Edge-case values?" At Tax Calculation: employee is tax-exempt, employer is in multiple states, this is a correction run. At Money Movement: bank rejects the pull, but taxes were already filed. Each scenario is a prompt for design work — add a step, add a constraint, or mark as out-of-scope.

The user never "switched modes." They started freeform, added structure when patterns demanded it, and eventually had a model formal enough for AI to generate test scenarios.

## The Lifecycle: Vocabulary, Formalization, Verification

The payroll example illustrates a general three-phase lifecycle:

### 1. Vocabulary — name things, relate them
Notes and edges on a canvas. No types, no rules. The value is shared language and visual overview. This is what Luminous does today.

### 2. Formalization — type things, constrain them
Promote notes to typed constructs. Type edges via schema-pair descriptions. Add structural constraints. The value is comparability (all Transformations have the same fields) and machine-readability (AI can query the graph). This is what the PDR milestones 2-4 describe.

### 3. Verification — test the model
Given types and constraints, check for violations and enumerate scenarios. AI reads the structured graph and asks "what if?" at each node and edge. Humans review and refine. Eventually, AI can generate formal specifications (state machine definitions, type schemas, test suites) from the model. Humans approve. This is what milestone 5 describes, but broader than "coverage audits" — it's systematic scenario generation from structural models.

**Each phase is useful alone.** The user stops where the forces stop. A vocabulary canvas with no types is valuable for team alignment. A typed canvas with no constraints is valuable for AI context. A constrained canvas is valuable for verification. You never have to reach phase 3 to get value from phase 1.

**Transitions are gradual.** You promote one note at a time. You add one constraint at a time. There's no "switch to formal mode." The canvas smoothly becomes more structured as understanding deepens.

## The AI-Mediated Testing Loop

The most ambitious part of the vision: "let AI write the tested formalization."

The flow:
1. Human builds vocabulary visually (phase 1)
2. Human promotes key nodes to types (phase 2)
3. AI reads the typed graph and generates formal specifications — state machine definitions, transformation contracts, type schemas
4. These specs are themselves testable: state machines can be model-checked, type schemas can be type-checked, transformation contracts can have test cases generated
5. Human reviews the generated formalization on the canvas
6. AI writes tests against the formalization
7. Human and AI iterate

Luminous is the front-end of this pipeline. The canvas is where thinking happens. The structured data is what AI consumes. The generated specs and tests are what makes the model trustworthy.

This is the original vision — "humans reason well with spatial tools, AI performs well with structured context" — taken to its full implication. The bridge isn't just for communication. It's for *verification*.

## Implications for the Node Model

This research session started from the question of canvas composition, which revealed that notes shouldn't be the only node type. A **discriminated union** node model supports this:

```
NodeBase = { id, x, y, w, h, parentId }

NoteNode    = NodeBase & { type: 'note',   title, body }
PortalNode  = NodeBase & { type: 'portal', title, canvasRef }
```

Future node types follow the same pattern. A promoted/typed node is a note that gained a schema — the `type` field could become the schema name, or promotion could add a `schema` field while preserving the base. The discriminated union is the extensibility point for everything described here.

## Implications for the PDR Roadmap

The existing milestones (doc01.02.01) still hold. What changes is how they're framed:

- **Milestone 1 (seed)** is the vocabulary layer — notes, edges, nesting
- **Milestone 2-3 (schemas, crystallization)** is the formalization layer — typed nodes, typed edges
- **Milestone 4 (schema-pair descriptions)** is edge formalization — giving relationships meaning
- **Milestone 5 (verification)** expands from "coverage audits" to "model verification" — structural constraint checking and AI-assisted scenario enumeration

A new milestone emerges between 3 and 5: **model definitions** — named bundles of schemas + constraints that define what a "valid state machine" or "valid transformation pipeline" looks like. This is the leap from "typed graph" to "verifiable model."

## What Luminous Is

The vision doc (doc01.01.01) says: "Luminous bridges human visual thinking and AI structured context." That's still true. The fuller picture:

> Luminous is a modeling workbench where humans express structural hypotheses about software visually, progressively formalize them, and verify them — first by making structure visible (so humans spot flaws), then by checking structural constraints, and ultimately by generating testable specifications from the models.

The canvas is the substrate. Models are what users build on it. Verification is the payoff.
