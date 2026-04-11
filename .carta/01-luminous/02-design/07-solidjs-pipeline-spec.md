---
title: Solid.js Pipeline Specification
summary: Node types, nesting rules, and edge semantics for the Solid.js static analysis pipeline
tags: [pipeline, solid, static-analysis, milestone-1]
deps: [doc01.01.03]
---

# Solid.js Pipeline Specification

This is the specification for a pipeline that produces specifications — a static analysis script that reads Solid.js source code and emits a `.canvas.json` summarizing the codebase's component architecture, reactive data flow, and external dependencies.

## What Pipelines Are

A pipeline is a compiler whose target architecture is human spatial cognition. Traditional compilers transform source → AST → IR → machine code. Pipelines transform source → AST → semantic graph → canvas. The intermediate representation (the semantic graph) is analogous to a compiler's IR. Layout is code generation. The "instruction set" is nodes, edges, and nesting — the primitives the human visual system can process.

The crucial difference: compiler output runs deterministically; canvas output is a starting point for reasoning. The pipeline compiles code into **mental model scaffolding** — not the mental model itself, but a spatial structure that supports building one. The human rearranges it, stares at it, and has the eureka moment. This is Alexander's generative process: the pipeline produces a seed, the human differentiates it through adaptation.

This clarifies what "correct" means for a pipeline. A compiler is correct when the output executes the same semantics as the source. A pipeline is correct when the output **enables insight** — when the topology supports the arrangements the user needs to see patterns.

## Design Principles

**parentId for containment, edges for cross-boundary flow.** The canvas has two traversal mechanisms that serve different purposes. `parentId` answers "what contains what" — spatial, always a tree. Edges answer "how do things relate across that structure" — semantic, can be a graph. When a relationship is pure containment (component renders child), parentId is sufficient. When a relationship crosses containment boundaries (signal created in A, read in B), use an edge.

**Subnode vs unstructured data: where do edges connect at the schema level?** The test for whether a concept deserves its own node *type*: do edges in general need to connect to this kind of thing specifically, or to the parent that contains it? This is a schema-level decision, not case-by-case. If data sources as a category need edges (they feed signals, they represent system boundaries), then DataSource is a type and every data source is a node. If the data is ad-hoc or highly varying across instances, it stays as body text — forcing it into nodes creates empty structure. This is unfolding design in practice: let the forces at the type level decide.

**Pipeline generates topology, human refines meaning.** The pipeline's job is to get the nodes, edges, and nesting right. Layout is a reasonable default, not a finished product. Edge labels can be partially inferred (read in JSX? in an effect?), but full semantic annotation is a human refinement. The pipeline is the seed; the human shapes it.

## Node Types

The pipeline emits seven node types. All share `NodeBase` properties (position, size, nesting via `parentId`). The pipeline controls the vocabulary — these types are specific to this pipeline, not a universal schema.

### Component

A function that returns JSX. The structural backbone. Components and hooks are the two node types that act as containers.

- **Detected by:** function declarations/expressions that return JSX (heuristic: contains JSX tags or returns `<...>`)
- **Fields:** `name`, `sourceFile`, `props` (parameter type names if inferrable)
- **Nesting:** components nest inside the parent component that renders them in JSX
- **Visual:** distinct color, largest nodes — they are containers

### Signal

A reactive atom — a getter/setter pair created by `createSignal`.

- **Detected by:** `createSignal()` calls
- **Fields:** `name` (destructured getter name, e.g. `count` from `const [count, setCount] = createSignal(0)`), `initialValue` (if literal)
- **Nesting:** nested inside the component that calls `createSignal`
- **Visual:** distinct color, small node

### Store

A reactive proxy over a nested object, created by `createStore`. Like a signal but for structured data.

- **Detected by:** `createStore()` calls
- **Fields:** `name` (destructured variable name), `shape` (top-level keys of initial value if inferrable)
- **Nesting:** nested inside the creating component
- **Visual:** same color family as signal, slightly larger to suggest structure

### Memo

A derived computation — reads signals/stores, returns a cached value. Both a consumer and a producer.

- **Detected by:** `createMemo()` calls
- **Fields:** `name` (assigned variable name)
- **Nesting:** nested inside the creating component
- **Visual:** distinct color or variant — visually suggests "derived"

### Effect

A side-effectful reactive consumer. Reads signals/stores and does something — but produces no value other things read. A sink.

- **Detected by:** `createEffect()`, `onMount()`, `onCleanup()` calls
- **Fields:** `name` (anonymous unless assigned), `kind` (`effect` | `mount` | `cleanup`)
- **Nesting:** nested inside the creating component
- **Visual:** distinct color or variant — visually suggests "action / side effect"

### Hook

A reusable function that creates and owns reactive primitives — `useViewport`, `useSelection`, `createPerformanceMonitor`, etc. Not a component (doesn't return JSX), but a container that owns signals.

- **Detected by:** functions that call `createSignal`/`createStore`/`createMemo`/`createEffect` but don't return JSX. Naming convention `use*` or `create*` (not `createSignal`/`createStore`/`createMemo`/`createEffect` themselves).
- **Fields:** `name`, `sourceFile`
- **Nesting:** nested inside the component that calls the hook. The hook's internal signals are nested inside the hook.
- **Visual:** distinct color — visually suggests "reusable logic"

Hooks are containers because users need to see where reactive state originates. `useViewport` creates the `transform` signal that's read across the component tree — the hook is the real owner, and edges from its signals need correct origins. Without hooks as nodes, signal ownership is misattributed to the calling component.

### DataSource

An external boundary — where data enters the system from outside. Not a Solid.js concept; an application boundary.

- **Detected by:** `fetch()` calls, `new WebSocket()`, other external API patterns inside effects or component bodies
- **Fields:** `name` (URL if literal, or inferred label), `kind` (`fetch` | `websocket` | `other`)
- **Nesting:** nested inside the effect or component that invokes it
- **Visual:** distinct color — visually suggests "external / boundary"

DataSource is a type because data sources as a category need edges — they feed signals, they represent the system's external boundaries, and users need to see where data enters the system. This is a schema-level decision: once the type exists, every detected data source becomes a node. Individual instances don't get case-by-case promotion.

## Nesting Rules

Solid's reactive ownership tree is rooted in components. Everything is called inside a component function body — that component is the owner.

```
Component (top-level, e.g. App)
  ├── Signal
  ├── Store
  ├── Memo
  ├── Effect
  │     └── DataSource
  ├── Hook (e.g. useViewport)
  │     ├── Signal (transform)
  │     └── Effect
  └── Component (child, rendered in JSX)
        ├── Signal
        ├── Effect
        └── Component (inner, defined inside parent)
              └── ...
```

**Components and hooks are containers.** Components contain everything — signals, effects, hooks, child components. Hooks contain the reactive primitives they create. Three nesting relationships overlap in one `parentId` tree:

1. **Render tree** — component A renders component B in its JSX → B is nested inside A
2. **Reactive ownership** — component A calls `createSignal` → signal is nested inside A
3. **Hook ownership** — component A calls `useViewport()` → hook is nested inside A; hook calls `createSignal` → signal is nested inside the hook

**Inner components are detected.** Functions defined inside other functions that return JSX (e.g. `CanvasContent` inside `CanvasView`) are components. They nest inside their defining component.

**What lives outside components:** Module-level signals/stores/effects — declared at file scope, outside any function (e.g. `theme.ts`). These appear as root-level nodes with no parent, visually distinct because they float.

**Everything else is nested.** Effects, memos, signals, stores, data sources, hooks — all live inside the component or hook that creates them.

## Edge Semantics

Edges represent relationships that cross containment boundaries. `parentId` nesting handles "owns / contains" — edges are only for cross-boundary connections.

### Reactive read edge

A signal, store, or memo is read by a component, effect, or memo *in a different component*.

- **Direction:** from producer (signal/store/memo) → to consumer (component/effect/memo)
- **Detected by:** getter function calls in JSX expressions, effect bodies, or memo bodies where the signal's owning component differs from the consuming component
- **Label:** describes the nature of the consumption — "renders list items", "filters results", "triggers refetch". The pipeline can partially infer this (read in JSX? in an effect? in a memo?); full semantic labels are a human refinement.
- **Visual:** distinct edge color for reactive flow

### Data source edge

A data source feeds data into the reactive graph.

- **Direction:** from DataSource → to the signal/store it populates
- **Detected by:** signal setter called with the result of a fetch or WebSocket message
- **Label:** describes what data flows — "document list", "user profile"
- **Visual:** distinct edge color for external data flow

### Render edges

The `renders` edge schema (`directed: true`, `layoutRole: 'tree'`) connects a parent component to each child component it renders in JSX. These edges drive the tree layout pass and make the component hierarchy explicit as a visible graph, complementing the `parentId` nesting.

### Re-export tracing (datasource proxy edges)

When a module-level function wraps a `fetch()` call (e.g. `api.ts` exporting `listDocuments`, `postAction`), the pipeline traces through the call chain:
1. Phase 1 records `exportedFn` on each `DataSourceInfo` whose owner is `__module__`
2. Phase 1b detects when components import and call these wrapper functions, recording `FnCallRecord` entries
3. After Phase 1b, proxy resolution converts each `FnCallRecord` into a `datasource-read` reactive read from the calling component to the datasource

This ensures datasource edges connect to the components that actually use the data, not to the utility module that wraps `fetch`.

### Module-level effect filtering

Effects with `owner === '__module__'` (declared at file scope, outside any component) are dropped before canvas generation. They have no component to nest under and produce disconnected floating nodes with no edges. Module-level signals are kept (they may be imported by components).

## Output Format

The pipeline emits a standard `.canvas.json` file. Node types are expressed via the existing `NoteNode` type — the `title` carries the name, the `body` carries structured metadata as markdown, and a title prefix convention indicates the kind:

```
[Component] App
[Signal] documents
[Effect:mount] loadDocuments
[DataSource:fetch] GET /api/documents
```

When the canvas engine supports a `kind` field on nodes, the pipeline can emit richer type information. Until then, the prefix convention and body content carry the semantics.

## Source Annotations

The pipeline source uses two annotation tags in JSDoc comments:

- **`@pipeline`** on functions — marks a function as a pipeline stage. One sentence of intent follows.
- **`@pipeline-shape`** on interfaces/types — marks a type as an intermediate data format between stages.

These annotations are minimal breadcrumbs. The AI reads the markers, the actual code, and the type signatures, then synthesizes the diagram. The annotations say "pay attention to me" — the AI does the connecting and describing. Flow ordering, field tracing, and phase grouping are inferred from the code itself (`main()` call order, `analysis.*` mutations, function signatures).

A companion canvas (`pipeline-flowchart.canvas.json`) was generated by AI from these annotations, showing the data-flow through the pipeline's phases.

## Layout

The pipeline provides one default layout: **component tree hierarchy.** Components arranged as a tree reflecting the render hierarchy, with their owned primitives (signals, effects, stores, memos, data sources) nested inside them.

This is the natural primary arrangement because it mirrors the containment hierarchy — which is literally what `parentId` expresses spatially. The user drags nodes to refine the arrangement after generation. Additional layout algorithms (dependency-flow view, file-grouped view) can be added when forces demand them.

**Critical constraint:** the topology must make the eureka moment *possible*. If a developer needs to see all signal consumers laid out to understand a data flow bug, the nesting and edge structure must support rearranging nodes into that view without losing information. The pipeline's default layout is a starting point — but the topology (which nodes exist, how they nest, what edges connect them) determines which arrangements are *reachable*. A topology that buries information in body text instead of nodes and edges forecloses layouts the user might need. Getting the topology right is more important than getting the default layout right.
