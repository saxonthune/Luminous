---
title: Reference Graphs and UI Frameworks
status: draft
summary: Research session synthesizing the browser rendering pipeline, Solid's reactive primitives, Qwik's resumability, and the framing of UI frameworks as DSLs over a live reference graph — with implications for Milestone 1's static analysis pipeline
tags: [research, reactivity, solid, qwik, rendering, pipeline, reference-graph, dsl]
deps: [doc01.03.01, doc02.06.01, doc03.01]
date: 2026-04-12
---

# Reference Graphs and UI Frameworks

A research session working from first principles through how a browser turns a URL into pixels, how a JavaScript framework fits into that pipeline, and what a UI framework fundamentally *is* once you see it from the heap's perspective rather than the source code's perspective.

The purpose is not reference material — it is a synthesis that gives Luminous a sharper vocabulary for what Milestone 1 actually produces and why that output is meaningful.

## The Core Observation

Every UI framework — React, Solid, Vue, Svelte, Qwik, Angular — is, underneath its surface API, a machine that constructs and maintains a **reference graph in the JavaScript heap** which drives DOM mutations. The framework's user-facing API (JSX, hooks, signals, templates, directives) is a DSL for describing that graph. The framework's runtime is the machinery that constructs and walks it.

This framing collapses a pile of framework-specific vocabulary into one structural lens. It is especially useful for Luminous because Luminous's mission — making software artifacts legible to both humans and AI — depends on the graph being *inspectable*, not just effective. Different frameworks expose their graph to different degrees, and that degree matters strategically.

## The Full Pipeline, Framed

A clean mental model of "what happens when a user visits a page" threads through the stack:

```
URL → HTTP response (near-empty HTML shell)
    → Browser parses, fetches CSS + JS
    → JS module graph loads
    → Framework bootstrap (root creation, reactive system init)
    → Component setup runs → DOM nodes created
    → Reference graph wired (closures, subscriptions, effects)
    → Browser: style → layout → display list → paint → composite → scan out
    → Pixels on panel
```

Three layers of graph exist simultaneously:

1. **The DOM tree** — owned by the browser (native C++ objects in Blink/Gecko/WebKit), exposed to JS through Web IDL bindings. The framework never "owns" the DOM; it issues mutations via the DOM API.
2. **The JS heap reference graph** — owned by the framework (and by user code). Closures, subscriber sets, effect functions, component instances. This is where reactivity lives.
3. **The browser rendering pipeline** — style, layout, display list, GPU-accelerated paint (WebRender in Firefox, Skia + Viz in Chrome), compositor handoff to the window system (Mutter on GNOME/Pop!_OS), then KMS/DRM to the display.

Frameworks control layer 2 and interact with layer 1 through the DOM API. Layer 3 is entirely the browser and OS. Understanding this stratification is the prerequisite for understanding why frameworks differ in the ways they do.

## The Reference Graph, Precisely

A reference graph is the live picture of which JS objects hold references to which other JS objects at a given moment. Nodes are heap objects (closures, Sets, Maps, instances, DOM node wrappers). Edges are references created by variable bindings, object properties, closure captures, and collection membership.

Roots — module scope, the current call stack, certain browser internals — are always alive. Any object reachable from a root by following edges is alive; the rest is garbage.

This framing is powerful because it makes the question "what keeps this effect alive?" answerable without recourse to framework-specific lore. The answer is always: *some root reaches it via a chain of references.* When you cannot trace such a chain, the object is collected. When you can, it persists. Control flow in reactive systems becomes a consequence of graph shape rather than the other way around.

### The toy Solid model, viewed as a graph

```js
function createSignal(initial) {
  let value = initial;
  const subscribers = new Set();
  const read = () => {
    if (currentListener) subscribers.add(currentListener);
    return value;
  };
  const write = (next) => { value = next; for (const s of subscribers) s(); };
  return [read, write];
}

function createEffect(fn) {
  const run = () => {
    currentListener = run;
    try { fn(); } finally { currentListener = null; }
  };
  run();
}
```

After `createEffect(() => console.log(count()))` runs, the heap contains: the signal's closure environment (holding `value` and `subscribers`); the `read` and `write` closures sharing that environment; the subscriber Set containing `run`; the `run` closure; and the user's `fn` closure which re-captures `read`. `run` is kept alive solely because the subscriber Set holds it. There is no registry, no central list of effects — the dependency graph is literally the JS object graph formed by closure capture and Set membership.

This is the purest possible statement of the reactive model: **the reference graph IS the subscription topology.** Every other framework reproduces this structure in some form, varying in what they expose and what they hide.

## Dynamic Scoping as the Subscription Protocol

The mechanism `createEffect` uses to announce itself — a module-level `currentListener` variable — is not lexical closure in the ordinary sense. It is **ambient / dynamically-scoped state**: a communication channel between functions that never met at authorship time. The effect parks its identity in the global; signal getters deep in the call stack consult the global; the effect clears the global on exit.

This pattern recurs:

- React's hooks dispatcher (a current fiber pointer)
- Vue's `activeEffect`
- MobX's `trackingDerivation`
- Angular signals' `activeConsumer`
- Node's `AsyncLocalStorage`
- Python's `contextvars`
- Angular's DI `inject()`

All are variations of "pass a parameter implicitly through any number of call-stack frames." The pattern trades explicitness for ergonomics: the user writes `count()` instead of `count(currentEffect)`, and the reactive machinery flows automatically through arbitrary composition. This is what makes fine-grained reactivity feel natural in authored code.

## Frameworks Positioned by How They Handle the Graph

Once the graph framing is established, framework choice becomes a design axis rather than a tribal preference:

| Framework | Approach to the reference graph |
|---|---|
| **React** | Runtime library. Maintains a parallel Fiber tree as its own graph-about-the-graph. Component functions re-run on every update; diffing reconciles VDOM against DOM. Heavy runtime, flexible semantics. |
| **Solid** | Compiler + reactive library. JSX compiles to direct DOM ops + effect bindings. Components run once. Reference graph IS the reactive graph. No parallel representation. |
| **Svelte** | Compiler-first. Reactivity compiled into targeted assignments. Similar spirit to Solid, different ergonomics. |
| **Vue (non-Vapor)** | Hybrid. Reactive proxies + VDOM. Middle of the spectrum. |
| **Vue Vapor** | Compiler-first like Solid; no VDOM. |
| **Qwik** | Serializes the reference graph on the server, deserializes (resumes) on the client. Eliminates hydration. |
| **Angular** | Heavy DSL (templates + decorators + DI). Elaborate DI graph alongside the view graph. Signals added recently bring it closer to fine-grained. |
| **Lit / htmx / Alpine** | Thin abstractions. Close to vanilla DOM + targeted reactive slots. |

The axis that matters most for Luminous is **how observable and walkable the graph is**. React's graph is buried inside Fibers and internal scheduler state; reconstructing application semantics from it is difficult. Solid's graph is the authored structure; reading the graph is reading the source-level intent. This distinction is the core of why Solid was chosen (see doc02.06.01).

## Qwik and Resumability — the Limit Case

Qwik is worth a separate note because it clarifies the framing. Qwik's central thesis is that *hydration is wasted work*: most SSR frameworks render HTML on the server, then re-run the whole component tree on the client to rebuild the reference graph. Qwik instead **serializes the server's reference graph into the HTML** and resumes it on first interaction.

A Qwik-rendered button carries an attribute like `on:click="chunk-abc.js#handler_xyz[0,3]"` — a URL into code that has not yet been loaded, plus an index into a state blob. A tiny global listener intercepts the click, fetches the chunk on demand, restores captured state, and invokes the handler. The client never re-runs components it does not need. Code downloads lazily per interaction.

The implication for our framing: if a framework is a DSL for constructing a reference graph, Qwik is the variant that **treats the graph as a serializable, transportable document**. It is the extreme endpoint of "build once, reuse forever." The closures that other frameworks rebuild on hydration, Qwik dumps and restores.

The authoring cost is the `$` suffix — every serialization boundary (event handlers, tasks, component boundaries) must be marked for the compiler to extract code chunks and capture state. In exchange, Time-to-Interactive approaches the HTML's arrival time.

For Luminous, Qwik is not a current candidate, but it is an instructive data point: the reference graph can be treated as a first-class artifact, detached from the program that produced it, and this enables capabilities (lazy code loading, zero-hydration) that graph-as-internal-state frameworks cannot offer.

## The Invariants of a UI Framework

With the graph lens in hand, the essential invariants any JS UI framework must satisfy become sharp:

1. **Correctness of DOM output.** The observable effect of a framework is DOM mutation (plus explicit side effects). If the DOM reflects current state, the framework succeeded.
2. **Consistency of internal state with application data.** The reference graph (or whatever internal structure plays that role) must be kept in sync with the state it represents, so that mutations in (1) are derivable.
3. **Performance within frame budgets.** ~16ms at 60Hz, ~7ms at 144Hz. VDOM diffing, fine-grained reactivity, batching, scheduling, concurrent rendering — all variants of "do (1) and (2) fast enough."

The reference graph is the means, not the end. The end is correct DOM that updates quickly. But because the graph is the mechanism that makes (1) tractable under (2) and (3), and because the graph is what Luminous wants to inspect, the graph is the right unit of analysis for our purposes.

## A UI Framework as a DSL over Tree + Mutations

A crisper definition than "DSL over the reference graph":

> **A UI web framework is a DSL for describing an HTML tree and the rules by which it mutates in response to application state, constrained by DOM semantics.**

This captures three things at once:

- The **static shape** the DSL describes (the tree).
- The **dynamic behavior** the DSL describes (how the tree changes over time).
- The **platform constraints** (HTML element semantics, DOM property vs. attribute distinctions, event bubbling, SVG/MathML quirks).

The reference graph is the *implementation mechanism* for the mutation half. The framework's user-facing DSL speaks in terms of UI (elements, events, state); the framework's runtime speaks in terms of graph construction and traversal. Every framework can be placed on a 2×2 of (compiler vs. runtime) × (VDOM vs. fine-grained) and that placement predicts most of its behavior.

## Implications for Milestone 1

Milestone 1 (doc01.03.01) specifies a pipeline that performs static analysis of a Solid.js codebase and emits a canvas showing the component tree, signals, and external data sources with reactive-dependency edges. Viewed through the reference-graph lens, Milestone 1 is **a static extraction of the runtime reference graph** — a picture of what the heap *will contain* after the program bootstraps.

There are two graphs in play, and it is worth naming them explicitly:

- **Graph A (runtime).** The live heap: signal cells, subscriber Sets, effect closures, DOM references, event handler closures. Dynamic, mutating over program execution.
- **Graph B (static).** The source-level shadow of Graph A: component files, `createSignal` call sites, JSX nesting, signal reads inside reactive scopes. Statically inferable by AST analysis.

For most frameworks, the mapping B → A is lossy because runtime behavior (re-rendering, diffing, conditional hook calls) diverges from source-level structure. **For Solid, B is an unusually high-fidelity approximation of A**, because:

- Components run once, so JSX nesting directly determines the mount-time DOM structure.
- Signals are literal, findable call sites.
- Reactive dependencies are just "what getter is called inside what tracked function," which is AST-visible.
- There is no reconciliation layer occluding the mapping.

This is a deeper reason to build Milestone 1 against Solid first than just "Solid is our stack." It is the framework whose source-level structure most closely mirrors its runtime reference graph, which means a pipeline reading source can emit a canvas that accurately reflects what the program actually does. A React pipeline with the same goal would have to model Fibers, hook orderings, and conditional renders — fundamentally harder and less faithful.

### What Milestone 1 should emit, in graph terms

- **Component nodes** → nodes in the static mount tree. Each corresponds to a setup-function closure that will exist at runtime.
- **Signal nodes** → nodes in the heap that each carry a value cell and a subscriber Set. Their containment inside a component node corresponds to the component closure holding them.
- **Reactive dependency edges** → entries in signal subscriber Sets. Statically: signal reads inside tracked scopes (JSX expressions, effects, memos) owned by other components.
- **External data source nodes** → `fetch`, WebSocket, `onMount` side effects. Edges to them represent the runtime references from effects holding network operations.

The canvas is therefore not a "diagram of the code." It is a **projection of the heap structure the code will produce**. This reframing matters: it suggests future pipelines should also be understood as heap projections, and the question "what does a good node/edge mean in this pipeline?" becomes answerable by asking "what heap structure does this authoring idiom produce?"

## Connections to Existing Research and Decisions

- **doc03.01 (Declarative Paradigms).** The declarative/structured axis argued there is the same axis as "how observable is the reference graph." Solid is chosen not only because it is structured but because its structure coincides with its runtime memory topology.
- **doc02.06.01 (Solid Migration ADR).** Gains an additional rationale: Solid is the framework whose static analysis most cleanly yields a runtime-faithful reference graph — a direct enabler of Milestone 1.
- **doc01.03.01 (Milestone 1).** Is a pipeline for extracting a static approximation of the runtime reference graph. This framing tightens the spec: node/edge choices should be justified by the heap structures they correspond to.

## Open Questions

- Can a runtime probe into Solid's reactive graph complement the static pipeline, producing a "Graph A" canvas that can be diffed against the "Graph B" canvas? When they disagree, the disagreement is interesting: either the static analysis missed a dynamic edge, or the runtime produced an edge the author did not intend.
- Does the pipeline pattern generalize beyond Solid? What would a React pipeline look like — and would its accuracy ceiling (owing to Fiber-layer opacity) be informative in itself about the cost of framework choice?
- Should Luminous's own internal data model (canvas nodes, edges, nesting) be expressed as Solid signals and stores, so that Luminous's runtime graph is itself inspectable by the same machinery? The reactive graph becomes the document, and the document is queryable the same way every other Solid program is.
- How does this framing interact with Qwik's serialized graph? Is there a version of Luminous in which the reactive graph of an authored canvas can be serialized and resumed across sessions or users — treating the graph itself as the exchange format?
- What does a "reference graph" canvas look like for non-UI code (servers, CLIs, libraries)? Is the pattern specific to UI, or does every garbage-collected program have a reference graph worth visualizing under the right projection?
