# Control-tree diagram — exploratory recipe

Status: authoring recipe, not a registered or executable program model. A first example uses Mermaid, Cards, schema Cards and spine layout. The name is provisional.

## Purpose and user requirements

Provide an inspectable starting point into the code relevant to a question; it may be an intentionally chosen interior code location rather than a real module or program entry point. Show function nodes inside containers naming their owning modules, arranged as a largely vertical control path. Place relevant contracts beside the steps that use them. Support exploring the control path and the state relevant at each point, inspired by navigating points of interest in an adventure game. The user has not settled what constitutes a “room”; do not equate it with a basic block or code between control statements as a requirement.

The central question is: **what is needed to perform this operation?** Trace relevant inputs, state, computations, source data, and connectors to the sources until the operation has what it needs at the relevant point in the control path. Make unavailable, optional, conditional, and unresolved dependencies visible. A developer must be able to inspect definitions and nested schema trees and then hide them to recover focus; Schema-card fields with explicitly authored nested schemas can reveal and hide connected type cards; REST API Tree is an interaction precedent. Definitions are not automatically extracted from code.

## Semantics and authoring

- Name the question, selected entry, scope and source revision or checkout. Mark a selected entry as such, not as a program entry point unless verified.
- A module container means code ownership; it does not mean execution order. A function card identifies a code definition or an explicitly named local callback. Control edges indicate the depicted possible progression, with guards or callback invocation labeled where needed. Do not imply straight-line execution for callbacks, loops, async dispatch or alternate branches.
- Distinguish a verified function, a call site, and an operation whose implementation is undecided; do not present an invented operation as an implemented function. Show proposed modules, adapters, API endpoints and storage dependencies when supported, or make alternatives and gaps explicit rather than inventing a route.
- Use source-backed code type names or actual type expressions in schema fields. Do not put explanatory prose in type labels. Develop concrete proposed types and make their definitions inspectable; identify proposed definitions as design choices rather than existing code. Do not use placeholder types as a substitute for design work.
- Attach contracts, state, or inputs near operations that read, validate or change them; distinguish schemas from runtime instances. Add read/write/validate labels where necessary. Source-link code and contracts where possible. Identify omissions and distinguish source-inferred possibilities from observed traces. Never imply this static view is a snapshot of an entire runtime configuration or proves which branch is enabled.
- Choose the default code path to answer the reader’s specific question. Include the source and connectors needed to explain how the required data reaches the operation; identify existing code, changed code, new code and genuinely unresolved alternatives. Attach lower-priority code for on-demand disclosure where supported, rather than hiding essential dependencies by default. Current Portable has no general expandable code-tree component; say so instead of implying one exists.
- Begin with a single useful path. Expand branching, shared functions, callback scheduling, relevant state, and alternative paths when the question calls for them. A function may recur in the display if needed to preserve control ordering; explain what recurrence represents.
- Use the existing composable change language if comparing implementations; ownership, control, data and change status have independent meanings. Preserve current nodes in a proposal, including explicitly removed nodes marked as removed.
- Current spine layout supports containers of consecutive steps only; separate nonconsecutive occurrences of a module into labeled containers, or choose another layout. Side attachments sit outside containers. Do not assert validation or runtime navigation beyond what the renderer provides.

## Rust command walkthrough

This projection uses existing default Cards. It is an authoring convention, not a registered parser recipe or a static analyzer.

- **CT-R1.** The diagram places the selected CLI entry point at the top and shows the relevant control path downward.
- **CT-R2.** In the ordered-call projection, each function Card identifies its crate/target and module ownership. Ownership containers are omitted so they do not constrain execution-order placement. A separate ownership view may use crate and module containers; a file path alone shall not establish module nesting.
- **CT-R3.** Individual code Cards identify relevant functions or methods, including private helpers when they explain the selected command. Public visibility does not establish an entry point.
- **CT-R4.** A function Card uses its function or qualified method name as its title. The Card identifies its repo-relative source filename and provides a source link when that file exists.
- **CT-R5.** A function Card contains a brief purpose and exposes its relevant signature, contracts and errors in Extended Info.
- **CT-R6.** Call arrows point from caller to callee; numbered calls explain order where needed. Container ownership shall not imply execution order.
- **CT-R7.** Change badges distinguish new, additive, modified and removed code. Proposed functions and paths are distinguished from existing definitions.
- **CT-R8.** The initial walkthrough follows one concrete command and omits unrelated functions.

A crate can have separate binary and library targets: use separate labeled containers when that distinction matters. Methods may name their owning type in the Card title. An optional `impl Type` container groups method definitions; it does not represent an allocated object. Type/schema Cards are distinct from executable functions. Calls across processes are labeled as HTTP or another transport, not ordinary Rust calls. Numbering describes the authored path, not a measured runtime trace.

For this function-level projection, filename-only titles are superseded by function titles. A separate file-change inventory can summarize affected files without treating files as execution units. A function badge describes that definition; a packaging-only move need not imply that its body changes. Current code links may point at the old location when a move is proposed, with the destination explicitly identified.

## Vertical flow with grouped side calls — current convention

- **CT-R9.** Retain a vertical progression with called functions and resources placed to its sides.
- **CT-R10.** Group consecutive operations into a meaningful central block rather than creating a dummy node for each call. One block may connect to several side Cards through numbered edges.
- **CT-R11.** Put module ownership inside function Cards; do not enclose this projection in ownership or nested-invocation containers.
- **CT-R12.** A side Card without displayed descendants does not assert that its implementation has no further calls.
- **CT-R13.** When expanding a nested call along the vertical line, identify entry into the callee and return to the caller. Repeated caller blocks represent resumption in the same function, not separate definitions.

Use existing spine layout with side attachments. Central Cards represent meaningful stages; numbered side arrows show the order of their calls. Numbering is local to the named caller. Solid arrows describe progression, including explicit call and return boundaries; dashed side arrows identify the functions/resources accessed. Avoid one `function · n` pill per operation. Multiple side Cards can share one stage; layout reserves space for them.

This is an authored successful-path view, not compiler-extracted basic blocks. Rust `?`, exceptions, loops and early returns can split actual basic blocks; disclose omitted branches. The nested-invocation-container experiment is not the default for this projection. Keep type/schema data distinct from executable code, and HTTP exchanges distinct from Rust calls.

## Side-column placement

- **CT-R14.** All side-related nodes belonging to one central stage appear on the same side.
- **CT-R15.** The first side node aligns with the stage's top; subsequent side nodes stack below it in declaration order.
- **CT-R16.** Later stages move down sufficiently to clear the complete side-node stack.

Spine layout reuses the REST API Tree's `leadingTreeLayout` for alignment and height demand. The first attachment declaration chooses its stage's side; later declarations for that stage are normalized to the same side. Authors should declare that side consistently. Different stages may use different sides.

## Open design questions

What should a navigable “room” represent: a function, a basic block, a meaningful operation with relevant state, or a zoom-dependent unit? How should loops, concurrent work, conditional reachability, state changes and repeated calls be unfolded? Which runtime observations are available and how should unknowns be shown? These are exploration questions, not decided semantics. The related Research Documents distinguish possible progression, runtime configuration, and an observed execution trace.

## Candidate code-graph projection

A future source index could provide definitions with repository, revision, file, span and symbol identity; module containment, imports and exports; call sites and possible callees (including async callbacks and dynamic dispatch with uncertainty); control branches, guards, loops and exceptional returns; type declarations, fields, optionality, unions, generic arguments and type references; function parameters and return types; reads, writes and provenance of state; endpoint callers, routes, handlers, storage operations and external services. Include evidence and analysis confidence, distinguish declared, inferred, proposed and observed facts, and keep runtime values and traces separate from static code. Query backward from a selected operation for its inputs and sources, and forward for effects, projecting only the paths and expandable types needed to answer the question. Preserve unknowns and do not claim a static reference proves execution, reachability or readiness.
