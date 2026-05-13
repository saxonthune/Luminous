---
title: "ADR: React to Solid.js Migration"
status: accepted
summary: Architecture decision record for migrating Luminous client-next and cactus from React to Solid.js
tags: [adr, architecture, solid, react, performance, reactivity]
deps: [doc02.01, doc02.05]
---

# ADR: React to Solid.js Migration

## Status

Accepted — migration complete.

## Context

Luminous is a visual canvas tool where humans see spatial arrangements and AI reads structured context. The client is built with React 19, using a custom canvas engine (cactus) with d3-zoom, DOM-based hit-testing, and Yjs CRDT sync.

React's re-render model creates systemic friction in this codebase:

1. **Edge sync bugs.** During node drags, edges render from stale committed positions because React's async state updates and component-scoped re-renders can't propagate live position data to edge components without explicit lifting, memoization, and ref duplication. The `cactus-edge-bugs` fix (b230656) required three layers of workaround: state lifting, `useMemo` merging, and `useRef` duplication for synchronous access.

2. **Memoization pyramid.** Hooks like `useMapNodePipeline` contain layers of `useMemo`, `useCallback`, and `useRef` caching solely to prevent React re-render cascades. This is accidental complexity — the code exists to work around the framework, not to express domain logic.

3. **Opaque data flow for AI.** Luminous's mission is bridging human visual thinking and AI structured context. React's virtual DOM and implicit re-render model hide the data dependency graph. An AI agent reading the canvas cannot inspect what depends on what without reconstructing it from source code analysis.

## Decision

Migrate `@luminous/cactus` and `@luminous/canvas` (client-next) from React to Solid.js.

### Why Solid

**Fine-grained reactivity eliminates the re-render problem.** Component functions run once. Signals push updates directly to the DOM nodes that read them. No virtual DOM, no diffing, no memoization pyramid. The edge sync bug class disappears: a drag handler writes to a position signal, and every edge reading that signal updates its DOM node directly.

**The reactive graph is the data model.** Signals, memos, and effects form an explicit, inspectable dependency graph at runtime. This aligns with Luminous's mission: the canvas renders from the graph, the AI reads the graph. Same underlying structure, two consumers. This is architectural alignment, not just a performance gain.

**Less code.** React-specific workarounds (useCallback, useMemo, useRef duplication, state lifting for cross-component sync) are deleted, not translated. The Solid equivalents are structurally simpler because the problems they solved don't exist in Solid's model.

**Framework-agnostic dependencies transfer.** d3-zoom operates on DOM elements directly. CodeMirror 6 is framework-agnostic (`solid-codemirror` provides the bridge). Yjs is framework-agnostic. Playwright E2E tests test the DOM. The migration surface is the React glue, not the core libraries.

### Why not other options

- **Stay on React with optimizations.** Zustand selectors, `useSyncExternalStore`, and targeted `React.memo` can reduce re-renders, but they add more framework-workaround code rather than removing it. The memoization pyramid grows; it doesn't shrink.
- **Rust/WASM hybrid.** Good for compute-heavy math (spatial indexing, layout algorithms), but doesn't address the rendering model problem. Could be a future optimization on top of Solid.
- **Svelte.** Comparable performance to Solid, but different syntax and less explicit reactive graph. Solid's JSX syntax makes the migration from React more direct.

## Migration Plan

### Phase 0: Archive legacy packages

Remove `document`, `geometry`, `schema`, `server`, `vscode`, `web-client` from the workspace. These carry schema-first assumptions superseded by the unfolding architecture (doc02.01). No active packages depend on them.

### Phase 1: Toolchain

Add `solid-js`, `vite-plugin-solid`, `solid-codemirror`. Remove `react`, `react-dom`, `@vitejs/plugin-react`. Update Vite configs.

### Phase 2: Port cactus

The canvas engine (~800 lines). Key translations:
- `useRef` → `let` variables (component function runs once, closures are stable)
- `useCallback` → plain functions (same reason)
- `useEffect` → `onMount`/`onCleanup` or `createEffect`
- `useState` → `createSignal`
- React context → Solid context (near-identical API)
- d3-zoom integration unchanged (DOM-direct)

### Phase 3: Port client-next

The application layer (~2000 lines). Key translations:
- Live position state → signals (delete ref duplication)
- Edge rendering → `<For>` over edges, each subscribing to node position signals directly
- Yjs bridge → `createYjsSignal` utility (~30 lines, replaces adapter subscription + useState pattern)
- MarkdownEditor → `solid-codemirror` wrapper (`livePreview.ts` and `markdownTheme.ts` transfer unchanged)
- Props destructuring → `props.x` or `splitProps` (mechanical, high-volume)
- Control flow → `<Show>`, `<For>`, `<Switch>`/`<Match>` (mechanical)

### Phase 4: Verify and clean

Update Playwright E2E tests. Delete React dependencies. Update carta docs.

## Consequences

### Positive

- Edge sync bugs and similar cross-component state coordination issues are structurally eliminated.
- ~30% less application code (memoization and re-render prevention code deleted).
- Reactive dependency graph is inspectable at runtime, enabling future AI introspection of canvas structure.
- Performance improvement from fine-grained DOM updates (relevant for large canvases with many nodes/edges).

### Negative

- One-time rewrite cost across cactus and client-next.
- Smaller ecosystem than React (fewer component libraries, less community support).
- Team must learn Solid's mental model (signals, tracking contexts, no prop destructuring).
- Some React-specific debugging tools and patterns no longer apply.

### Risks

- `solid-codemirror` is community-maintained; if abandoned, fallback is direct CM6 integration (~30 lines).
- Solid's SVG support has minor TypeScript namespace edge cases (documented, not blocking).
- No production-ready Solid canvas library exists — but we already built cactus custom, so this is the status quo.

## References

- Solid.js docs: solidjs.com
- Cactus engine contract: doc02.05
- Unfolding architecture PDR: doc02.01
- Edge sync fix: commit b230656
