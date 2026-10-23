# Ground runtime explanations in the actual caller and code

User correction: “Namespace lookup returns a stub: a remote handle” failed to
explain which stub, who obtains it, where it exists, or what the caller does next.
The user wants a mental model and explicitly rejects passive, ungrounded prose.

Artifact: braincrawl-service-standardization/.luminous/worker-runtime/2026-10-23-runtime-and-api.md.
Generator: luminous-portable/packages/portable.

Authoring guidance from this correction:
- Name the actor, concrete function, argument and returned value before introducing jargon.
- Trace one actual request through the code; explain where each object lives and who creates it.
- Introduce “stub” as the client returned by namespace.get(objectId) in dispatchRequest.
- Distinguish an explanatory variable from one that actually appears in source.
- Use active subjects: Cloudflare calls; dispatchRequest selects; the constructor creates.
- A short label is not useful if it merely replaces one unexplained term with another.

Updated the prose and runtime cards accordingly. Retained the same HTML path;
no second Firefox tab. Semantic validation checks diagram declarations, not
whether the prose teaches effectively. User review remains the evidence for that.

## Containment correction after inspecting the diagram

User rejected “Worker HTTP invocation” nested under deployment as a container for
code. It mixes a temporal event with the location of instruction-data. Changing
prose did not repair the diagram's ontology.

Read L3 `runtime-configuration-graphs`, `feature-formalism-prototyping` and
`runtime-visualization-for-software-comprehension`. The last calls the proposed
combined artifact a “state-conditioned execution map”: a place graph plus
separate possible/observed execution and selected-state layers. The OOT notes
separate actor allocations, shared callback definitions and callback invocation.

Retained a recipe proposal at braincrawl-service-standardization/.luminous/worker-runtime/recipe-proposal.md.
It is not an implemented recipe. Proposed checks require typed relations and
scenario references beyond Portable's existing node-kind and legend validation.

## First compiler-generated control tree

User chose “runtime control tree diagram,” defined by control-based reachability,
then requested a vertical entry column with functions expanding rightwards.
Braincrawl's generate-control-tree.mjs now uses TypeScript 7 compiler symbols and
AST control statements. Portable renders the generated Markdown with semantic
kinds; a reviewed adapter connects Cloudflare binding delivery across type-only
boundaries. It does not implement a new Portable Recipe.

Explicit TB subgraphs within an LR graph keep every entry at one x-coordinate.
The three-level overview has about 200 nodes, so fit-all makes labels very small.
A separate dispatch canvas supplies a smaller branch-specific view. Headless
Chromium rendered without page errors and opened Extended Info successfully.
Potential improvement (not agreed requirement): user-selected root expansion
would preserve the inventory while avoiding an unreadable full-graph fit. The
current renderer does not expose that authoring control; do not claim it does.

## Dense graph performance

User reported poor interaction performance. Profiled the generated ~200-node
control tree: line routing was under 1–2 ms per update; downstream label/render
work dominated. EdgeLayer eagerly placed even hidden labels and line-only layers.
Fixed that, omitted hidden label renderers, and retained unchanged route geometry
identities in Canvas. The artifact generator also merged repeated overview edges
without deleting the original conditional call sites from the JSON inventory.

Headless Firefox scripted group-drag frame p95 improved 133.7→50.3 ms, synchronous
update p95 121→32 ms. This is still above a smooth-frame budget, and one local
measurement is not a universal guarantee. 41 focused tests and cactus typecheck
passed. See braincrawl-service-standardization/.luminous/worker-runtime/performance-2026-10-23.md.
