---
title: Source analysis and FunctionInfo
summary: Rust syntax and semantic vocabulary, source-to-artifact pipelines, FunctionInfo extraction, and the soldered PCB principle for function inspection.
tags: [hemp, rust, static-analysis, function-info, syntax, semantics]
deps: [doc01.13.01, doc01.13.03, doc01.13.04, doc01.13.05]
---

# Source analysis and FunctionInfo

Hemp turns Rust source structure and resolved relationships into visual artifacts.
This document records the conceptual model behind extraction. It distinguishes
established analysis techniques, product intent, and implementation experiments.
The static inspector's commands and coverage are described in doc01.13.03.

## Purpose and scope

Hemp serves the north star in doc01.13.01: understanding software through visual
tools, with implementation work delegated to coding agents. The inquiry here is
static: what source says, how definitions connect, and what execution paths are
possible. It does not depend on running the inspected application.

A visual IDE is the proposed direction. Item/symbol search and inspection of
relevant relationships support that direction; it does not by itself prescribe
source editing or debugging features. The proposed documentation verb
“distinguish” means asking what a function needs to execute, or seeing a struct's
usages, with other graph elements darkened. The user excludes this verb from UI
labels and code naming. Its precise visual treatment remains a design question.

## Syntax vocabulary

### Crates, modules, items, and files

A crate is a compilation unit with a module tree. A Cargo package can provide
both library and binary crate targets. Modules contain items; functions contain
blocks, statements, and expressions. An `impl` associates methods with a type
or trait implementation rather than creating another module.

One file can contain many items and inline modules. An out-of-line `mod name;`
loads a module body from another file; `#[path]` can change that file location.
Importing a definition does not move it into the importing module. Reusing the
same physical source in two crate contexts produces distinct definitions, not
one definition jointly owned by two crates. Physical files therefore remain
separate from the containment hierarchy.

Ordinary function syntax has one body, not C#-style partial declarations.
Macros and `include!` can assemble source from elsewhere, so source provenance
after expansion can be more complicated than one contiguous file range.
Multiple `impl` blocks can supply methods for a type; that is separate from
splitting a struct's field declaration across files.

### Inside a function

| Construct | Meaning |
|---|---|
| Token | A lexical unit, such as an identifier, keyword, or punctuation. |
| Abstract syntax tree (AST) | A tree representing the grammatical structure of source. |
| Item | A definition such as a function, struct, constant, or module. |
| Block | A brace-delimited sequence of statements, potentially ending in a value-producing expression. |
| Statement | A local binding, nested item, expression statement, or macro invocation. |
| Expression | A computation, including calls, assignments, blocks, `if`, and `match`. |
| Pattern | A form matched against a value; it can introduce bindings. |
| Match arm | A pattern, optional guard, and body expression. |
| Span | The source range occupied by a construct. |
| Visitor | A traversal that inspects selected kinds of syntax nodes. |

An AST already preserves statement order. “Ordered syntax tree” describes that
property, not another standard intermediate representation. A function's
extracted tree can select and simplify AST structure while retaining ordering.
Rust's `if` and `match` are expressions and can appear inside bindings or arguments.

### Why branches alone are insufficient

```rust
let limit = DEFAULT_LIMIT;
let result = match command {
    Fetch if enabled => fetch(limit),
    _ => fallback(),
};
save(result);
```

This block contains three ordered statements. The second binding contains a
match expression; its first arm contains a guard and a call. A branch-only
inventory loses the bindings and the final call's position in the sequence.
Syntax nesting is not a guarantee of execution: a closure body is deferred,
and returns or `?` can prevent subsequent statements from executing.

## Semantic vocabulary

- Name resolution connects a name occurrence to the definition it denotes.
- Type inference determines types that source does not explicitly state.
- Type checking checks operations against types; method resolution depends on
  the receiver's type and applicable implementations.
- A symbol identifies a definition. An occurrence is a particular use of it.
- Logical ownership and physical source location are separate facts. Module
  membership is not reducible to a directory tree.
- A source coordinate locates a fact in a snapshot; it is not durable identity
  across arbitrary edits.

Semantic analysis operates on parsed/internal representations plus project
context, not raw text alone. `syn` parses syntax; it does not resolve names or
infer types. rust-analyzer builds its own syntax and semantic representations
from source and Cargo configuration. Hemp does not feed a `syn` AST into it.

### Usages of a struct

LSP's `textDocument/references` accepts a source position on the struct's
identifier and returns reference locations. Hemp maps those locations to
containing items, statements, or expressions. Definition resolution can check
that an occurrence denotes the expected definition, rather than merely sharing
its spelling. Aliases and identically named definitions require semantic lookup.

References to a struct definition are not all operations on values of its type.
`client.send()` can reference a local binding and a method without explicitly
naming `Client`. Finding every operation involving `Client` values requires
type-aware analysis beyond the ordinary references query. “All usages” is always
qualified by the analyzed source/configuration and the kind of usage requested.

## Compiler representations

The simplified Rust compiler progression is:

```text
source → tokens → AST
  → macro expansion and name resolution
  → HIR → type checking/inference → THIR → MIR
```

- HIR is a compiler-oriented, partly desugared representation of source.
- THIR is fully typed and makes more implicit operations explicit.
- MIR represents typed operations in basic blocks connected by control flow.
- A control-flow graph (CFG) records possible successors, including branches,
  loop backedges and exits. It is not an execution trace.
- Dataflow analysis reasons about values across those paths.
- Control dependence relates an operation's execution to controlling decisions.

This progression is explanatory, not a claim of a strictly sequential compiler:
Rust uses interacting, cached queries. rust-analyzer has its own internal model;
its representations are not interchangeable with rustc's similarly named ones.

## Source-to-artifact pipelines

```text
Source files + Cargo manifests + dependency/configuration context
│
├─ Syntax extraction (syn)
│    functions, ordered statements/expressions, bindings,
│    patterns, branches, source spans, line counts
│
├─ Semantic extraction (rust-analyzer)
│    definitions, resolved references, types, module ownership
│
└─ Deeper flow analysis (optional compiler MIR adapter)
     basic blocks and typed operations
       → additional data/control-dependence analysis

Syntax facts + semantic facts [+ flow facts]
  → FunctionInfo and other item records
  → .hemp.json
  → visual projection
```

Source is the root resource, but semantic answers also depend on Cargo targets,
features, dependencies, macros, generated code, and target platform. An artifact
describes an analysis context, not every possible build configuration.

Hemp integrates extraction tools rather than implementing a Rust parser and
type checker. The syntax and semantic paths join through source locations:
the parser identifies an expression and its containing region; the analyzer
resolves identifiers there to definitions. Both paths must read the same source
snapshot. Source spans and position encodings require explicit conversion.

### FunctionInfo

`FunctionInfo` is the experimental per-function extraction record. Its shape is
open to changes as visual inspection reveals what information is useful. The
user's candidate contents are an ordered control-flow tree, variable bindings
and other statements, line count, namespace, and a table of connections to other
graph items. The internal atomic unit remains an open question.

| Information | Extraction |
|---|---|
| Ordered source-shaped tree | AST traversal, retaining statements and nesting |
| Line count | Source span, with an explicit counting convention |
| Namespace | Semantic ownership informed by crate context |
| Connections to items | Resolved source references |
| Incoming usages | Reverse lookup of references |
| Execution successors | CFG/MIR analysis |
| Value origins and controlling conditions | Additional dataflow/dependence analysis |

The source-shaped tree and references are sufficient for the single-function
experiment. They do not establish complete execution prerequisites. Constants,
environment inputs, and dependency-injection wiring require different evidence:
wiring involves construction and value passing, while environment values enter
through calls or generated configuration. A reference edge is not proof of
execution, value flow, or a concrete dynamic-dispatch target.

### Identities and connections

A function definition and its call sites are distinct. Two calls in different
match arms can supply different arguments to the same function. Aggregating
them into an item-level edge must preserve their separate locations and evidence.
Syntax regions such as arms are not Rust items, but can still have artifact IDs.

Useful record data includes kind, name, containing item, source range, identifier
range, signature/type information, and analysis context. LSP queries start from
identifier positions; their returned locations map back to extracted regions.
Unresolved or excluded targets remain coverage limits, not invented connections.

## Visual design inquiry

The micro view is developed before semantic abstraction on zoom-out, even if
the user's eventual entry view is abstract. The soldered PCB principle
(doc01.13.05) gives the zoomed-in view semantic flatness: nothing to expand,
hide, or move around. Structural nesting can remain visible without interactive
disclosure. Camera pan and zoom do not rearrange the structure.

The circuitboard overview and log-scaled node size based on LOC or complexity
are exploratory ideas, not a settled visual mapping. LOC and complexity are
different measurements. Raw metrics remain distinct from display geometry.

## Related techniques

- Polymetric views encode software metrics through visual properties.
- CodeCity maps software entities and their hierarchy into spatial regions.
- Program/system dependence graphs support static slicing within and across
  procedures. A slice addresses a defined question, not general visual proximity.
- Code property graphs combine syntax, control flow, and dependence relations.
- SCIP separates semantic symbols from source occurrences for code navigation.

These are reference techniques, not commitments to a particular framework.
Containment plus typed relationships is sufficient descriptive vocabulary;
the informal “bigraph” analogy does not imply an implementation of formal bigraphs.

## Sources

- [Rust crates and source files](https://doc.rust-lang.org/reference/crates-and-source-files.html) and [modules](https://doc.rust-lang.org/reference/items/modules.html).
- [syn statements](https://docs.rs/syn/latest/syn/enum.Stmt.html), [expressions](https://docs.rs/syn/latest/syn/enum.Expr.html), and [blocks](https://docs.rs/syn/latest/syn/struct.Block.html).
- [rust-analyzer architecture](https://rust-analyzer.github.io/book/contributing/architecture.html).
- [Rust compiler overview](https://rustc-dev-guide.rust-lang.org/overview.html), [THIR](https://rustc-dev-guide.rust-lang.org/thir.html), and [MIR](https://rustc-dev-guide.rust-lang.org/mir/index.html).
- [LSP document symbols](https://raw.githubusercontent.com/microsoft/language-server-protocol/gh-pages/_specifications/lsp/3.17/language/documentSymbol.md) and [references](https://raw.githubusercontent.com/microsoft/language-server-protocol/gh-pages/_specifications/lsp/3.17/language/references.md).
- [Polymetric Views](https://www.cs.kent.edu/~jmaletic/cs63902/Papers/Lanza03.pdf), [CodeCity](https://wettel.github.io/codecity.html), [system dependence graphs](https://research.cs.wisc.edu/wpis/papers/pldi88.retrospective.pdf), [code property graphs](https://www.ieee-security.org/TC/SP2014/papers/ModelingandDiscoveringVulnerabilitieswithCodePropertyGraphs.pdf), and [SCIP](https://github.com/scip-code/scip/blob/main/docs/scip.md).
