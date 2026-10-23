---
title: Portable Recipes
summary: Purpose-driven Recipe concept and requirements, with a proposed flowchart pipeline.
tags: [portable, glossary, requirements, recipes]
---

# Portable Recipes

## Glossary

- **PRTERM1.** [p] **Recipe** — a purpose-driven way to create a diagram that conveys information in a specific way.

## Recipes

```yaml rhidoc-feature
prefix: PREC
name: Recipes
description: Users can create diagrams that convey information for a specific purpose.
```

- **PREC1.** [p] Portable supports Recipes for creating diagrams for specific purposes.
- **PREC2.** [p] The first specialized Recipe is a flowchart Recipe.
- **PREC3.** [p] Portable uses a Standard Recipe by default when the user starts without a specialized Recipe.
- **PREC4.** [p] The Standard Recipe gives agents access to a flexible theme system, including theme slots.
- **PREC5.** [p] Users can build flexible diagrams without first choosing a specialized Recipe.
- **PREC6.** [p] Users can formalize a diagram into a Recipe after building it.

Flowcharts, architecture diagrams, and Denim boards are the user's motivating
examples. The Standard Recipe supplies the flexible default; flowchart is the first
specialized Recipe.

## Design proposal — not requirements or an implemented Recipe engine

A Recipe supplies a reusable interpretation of a graph. A node kind describes
one category of node; a Recipe coordinates kinds and relationships around the
question its reader should be able to answer.

Proposed flowchart purpose: **What can happen next, and under what condition?**

| Recipe responsibility | Proposed flowchart choice |
|---|---|
| Purpose and reading guidance | Follow transitions from entry through decisions to outcomes |
| Vocabulary | Start, step, decision, end; directed transitions with optional labels |
| Checks | Resolve endpoints; report unlabeled decision branches and unreachable steps as warnings; allow loops |
| Presentation | Distinguish decisions, steps and terminals; show branch conditions on arrows |
| Layout defaults | Directed layered layout; accommodate cycles and branches |
| Interaction policy, when needed | Specify what disclosure preserves the meaning of the flow; initially use existing Portable navigation |

Start with a built-in TypeScript definition and named functions, rather than a
plugin language or generic rule interpreter. Selecting `--recipe flowchart` is
proposed CLI syntax, not an available command yet. Recipe checks run after
import and before layout. A malformed reference blocks generation; advisory
checks return diagnostics without pretending to prove the described process
correct or complete.

### Boundaries

- Source document owns this diagram's IDs, text, relationships, and grouping.
- Recipe owns reusable meaning, checks, presentation choices, and layout defaults.
- Theme owns colors and visual tokens. Ground is the initial theme.
- Cactus owns geometry algorithms and canvas interactions.
- Artifact owns the embedded result and separate default/current positions.

Reset layout returns to the computed default. Moving nodes changes current
positions without rewriting transitions. A Recipe is not an instance of a
Denim board; implementing that example would need an explicit adapter for its
semantics and state.

### Proposed pipeline

Source + Standard or selected specialized Recipe → import → interpret/check → visual projection →
compute default layout → bundle one HTML → navigate in the browser.

The Recipe contributes vocabulary/checks at interpretation and presentation/layout
settings at projection. Theme contributes visual tokens at rendering. Preserve
semantic roles through import: today's Portable importer discards Mermaid shape
meaning, so a real flowchart Recipe needs that extension before it can distinguish
a decision from a step. Today's runtime renders rectangular cards; this proposal
does not claim decision shapes or Recipe validation already work.

The illustrative source is `packages/portable/examples/recipe-pipeline.md`.
Generate it with the existing `just portable --input ...` command; it depicts
this design using the current renderer, without executing a Recipe engine.

## Usage: discover the Recipe through diagram building

A user or agent can begin without choosing a specialized Recipe. The Standard
Recipe supplies flexible diagram construction and access to theme slots. The
user builds a diagram, discovers useful conventions, and can then formalize
those conventions into a Recipe for a particular communicative purpose.

This updates the earlier framing: choosing a specialized vocabulary is optional
at the start. Recipe formalization can follow experimentation.

## Revised pipeline proposal: follow the data

The artifact separates stored input, operations, produced data, and browser
state. Solid arrows show data supplied or produced; dashed arrows show a control
condition or event. Containment groups the stages of computation. These are
conventions of this example, not new Portable requirements.

1. Read source text into a graph (IDs, content, links, containment, optional roles).
2. Resolve an explicit specialized Recipe, or use Standard when none is selected.
3. Combine Recipe defaults with diagram-local presentation choices and theme-slot
   bindings. Proposed precedence: diagram-local choices override defaults.
4. Check basic graph integrity. Run additional domain checks only if the selected
   Recipe supplies them. Produce diagnostics and a graph ready for presentation.
5. Project that graph into visual descriptions. Resolve slot names against the
   active theme; use labels and presentation metrics to calculate node bounds.
6. Pass bounds, connectivity and layout settings to cactus. Retain its result as
   default geometry, separate from current browser positions.
7. Bundle graph, visual descriptions, theme values, default geometry and runtime
   code into HTML. Opening the file initializes browser state.
8. Dragging changes current positions; pan/zoom changes the viewport; selection
   changes emphasis. Those values feed the DOM/SVG presentation. Reset copies
   default positions back to current positions. Browser rendering produces pixels.

The proposed theme slots are named visual roles (for example surface, border,
text, accent, and author-defined categories), not mandatory domain meanings.
A diagram can experiment with local slot bindings; extracting a Recipe can move
reusable conventions into defaults while instance-specific content stays in the
diagram. Exact slot schema and formalization tooling remain open.

### Connection to the OOT research

Recovered L3 documents: `runtime-configuration-graphs` (especially enabled
computation) and `feature-formalism-prototyping` (runtime access and placement,
wiring, state, and events). Their lesson for this proposal is to make explicit
what an operation reads, what it creates or changes, and what enables it.
Containment can be a tree; shared inputs and callbacks introduce cross-links.
The diagram is a design-time account of these dependencies, not a captured
execution trace or a literal memory-layout map.

### Current implementation boundary

The artifact below is still built with the existing generator. Theme class
palettes already exist via `--theme`; the richer slot contract, Recipe resolution,
local overrides, and formalization tools are proposed here, not implemented.
Current browser state and navigation are implemented. Build and browser execution
are shown separately so bundled data is not confused with live generator code.

## Action-flow presentation experiment

User feedback on the conversion walkthrough: show a straight line of actions;
place data inputs above the action they feed; use blueish data, red actions, and
yellow invocation/output artifacts. The saved `conversion-walkthrough.md` now
uses `mermaid action-flow` fences with a companion theme JSON. This implements a
small explicit layout convention to evaluate before designing the Recipe API.
The shared cactus geometry helper lays out a row with inputs above each column.
Loops are summarized in action labels in this example, not discarded from the
explanation of the implementation.

The walkthrough now also includes purple `code` cards for modules/functions.
They point to actions with implementation relationships and are positioned like
data attachments. They name actual functions or module-level statements; proposed
Recipe resolution/projection have no implementation cards yet. This is an
authored implementation mapping, not an automatically extracted call graph.

## Proposed semantic validation — October 22, 2026

Motivating failure: the privacy artifact used a blue `contract` node for an
inference-policy decision but omitted that category from its canvas legend.
The current generator checks legend entries against theme classes, but does not
check the reverse direction: used categories against legend entries. A decision
also should not silently acquire the meaning of an API contract just because
both were assigned the same color.

Proposal, not committed input syntax or implementation:

- A vocabulary registry declares stable meaning IDs and human-readable labels.
  A Recipe can supply defaults; the Standard Recipe allows document-local
  declarations. Example IDs: `worker`, `durable-object`, `decision`.
- Nodes and containers reference a meaning ID through semantic metadata.
  Diff status remains an independent dimension, using the existing shared
  `new`, `additive`, and `modified` vocabulary. A component may therefore be
  both a Worker and modified without inventing a combined type.
- Presentation maps meaning IDs to theme slots. Theme slots resolve to palettes,
  borders or shapes. Legend entries reference the same meaning IDs, and obtain
  their labels and swatches through that mapping. Palette changes do not change
  the semantic result of validation; distinct meanings may share a palette.
- Generic decoration such as page surfaces is not a diagram meaning. Meaningful
  color cannot be introduced solely through arbitrary CSS and still be covered
  by this validator. Decorative classes remain separate from semantic uses.

Pipeline: parse source and retain locations → resolve vocabulary and references
→ run core and Recipe checks → project presentation → layout → bundle.
Today `importMarkdown` also computes layout; implementation should separate that
step so semantic errors stop work before geometry and bundling. Parser syntax
errors and unresolved references are structural errors. Recipe rules are
semantic lint checks with configured warning/error severity; both use the same
diagnostic format without pretending that successful lint proves architectural
truth.

Begin with named TypeScript rule functions, not a general-purpose rule language.
Each rule receives a resolved document, selected Recipe and effective policy,
and returns diagnostics without mutating input. Proposed diagnostics contain
rule ID, severity, message, canvas ID, affected element IDs, source location when
available, and a suggested correction. Collect independent failures in one run;
skip dependent checks when resolution failed. Any error prevents publishing or
overwriting HTML; warnings are logged and allow generation. Existing output
must be identified as the previous artifact after a failed generation.

The proposed `legend/coverage` check compares, for each canvas, the set of meaning
references used by nodes/containers and supported semantic badges with the set
explained by that canvas's legend. Missing coverage produces a diagnostic listing
the category and affected elements. A missing legend fails when explainable
meanings are used; another canvas's legend cannot satisfy coverage. Unused legend
entries need not fail this first rule. Unknown meaning IDs are reference errors,
not missing-legend errors.

Recipes supply rule defaults. Explicit artifact policy can select severity for
advisory rules; syntax/reference validity cannot be disabled. For this Braincrawl
artifact, `legend/coverage` is configured as `error`. Exact configuration syntax
and precedence beyond these cases remain implementation choices to review.

Migration should explicitly map current Mermaid classes and `diff` values into
semantic references. Do not infer meaning from hex colors, silently auto-add
missing legend entries before validation, or claim that declarations can detect
arbitrary CSS changes. Automatic legend generation may later be an explicit
mode; the authored-legend mode must retain the requested rejection behavior.


## Implemented semantic subset — October 22, 2026

The earlier sections preserve design history. The current implementation now
supports a Standard Recipe and an architecture Recipe selected in the document's
`portable-model` block (not a `--recipe` flag). It resolves vocabulary, theme-slot
bindings and per-canvas node kinds before running named TypeScript rules. Model
version 1, exact input examples, precedence, extension instructions and limits are
in `.agents/skills/luminous-portable-artifact-generator/references/metamodel.md`.

`importMarkdown` returns parsed data without layout. `validateDocument` checks
references and runs rules; `projectDiagram` derives presentation. Layout and HTML
bundling follow only when no error exists. The architecture Recipe requires node
and container kinds and complete per-canvas legend coverage, including diff badges.
Document rule settings can override Recipe severity defaults; reference validity
cannot be disabled. Legacy class-only inputs keep their old rendering behavior.

Evidence: the migrated Braincrawl privacy input was rejected for missing
`kind:decision` on node `policy` in canvas 2, then generated successfully after the
entry was declared. Portable type checking passed. This establishes the exercised
path, not browser interaction or a complete parser regression suite.
