# Solid.js Mental Model

## The Core Idea

A Solid app is a **setup phase** that builds real DOM and wires a reactive graph, followed by a **steady state** where signals push changes through that graph directly to DOM nodes.

- Components are constructors, not render functions.
- The compiler connects JSX expressions to specific DOM mutations at build time.
- The runtime maintains signal->effect->DOM subscriptions.
- There is no re-rendering, no diffing, no virtual DOM.
- The unit of update is the individual expression, not the component.

## The Three Primitives

### Signal — a reactive value

```tsx
import { createSignal } from "solid-js";

const [count, setCount] = createSignal(0);

count()        // read (getter) — returns 0
setCount(1)    // write (setter) — updates to 1
setCount(c => c + 1)  // functional update
```

When you read a signal inside a **tracking context** (JSX, effect, memo), the reader is recorded as a subscriber. When the signal updates, only those subscribers re-execute.

### Memo — a cached derived value

```tsx
import { createMemo } from "solid-js";

const doubled = createMemo(() => count() * 2);
doubled()  // read the cached value
```

- Auto-tracks dependencies (no dependency array).
- Only recomputes when dependencies change.
- Suppresses downstream updates if the computed value hasn't changed (`===`).
- Must be **pure** — no side effects.

### Effect — a side effect

```tsx
import { createEffect } from "solid-js";

createEffect(() => {
  console.log("Count is now", count());
});
```

- Auto-tracks dependencies.
- Re-runs when any tracked dependency changes.
- Runs once on initialization, then on each change.
- Scheduled after the rendering phase (not synchronous with component setup).
- Execution order among multiple effects is **not guaranteed**.

## Component Lifecycle

```tsx
function Counter() {
  // 1. SETUP PHASE — runs ONCE
  const [count, setCount] = createSignal(0);

  console.log("I run once");  // Not tracked — runs once

  createEffect(() => {
    console.log(count());     // Tracked — re-runs on change
  });

  // 2. JSX — compiled into DOM creation + reactive bindings
  return (
    <div>
      <p>Count: {count()}</p>  {/* This expression becomes a tiny effect */}
      <button onClick={() => setCount(c => c + 1)}>+</button>
    </div>
  );
  // Component function NEVER runs again
}
```

## What the Compiler Does

Solid's JSX compiler (Vite plugin) transforms JSX into direct DOM instructions at build time:

```tsx
// What you write
<p class={style()}>Hello {name()}</p>

// What the compiler emits (simplified)
const p = _tmpl$.cloneNode(true);     // Clone a <template>
const text = p.firstChild.nextSibling;

createRenderEffect(() => p.className = style());  // Reactive binding
createRenderEffect(() => text.data = name());      // Reactive binding
```

Key points:
- **Templates are cloned**, not constructed. Static HTML becomes a `<template>` element, cloned via `cloneNode(true)`.
- **Dynamic expressions become `createRenderEffect` calls**, each bound to a specific DOM node.
- **Static content is never touched again.**
- No virtual DOM tree. No diffing.

## What Happens at Startup

1. `render(() => <App />, root)` — calls `App()` once.
2. `App()` creates signals, clones templates, registers effects, returns real DOM nodes.
3. `render()` appends those nodes to the root element.
4. The reactive graph is now alive — signals push updates to effects, which update DOM nodes directly.

## What Happens on Update

```
User clicks button
  → setCount(1)
    → Signal notifies subscribers
      → RenderEffect re-runs: textNode.data = count()
        → Text node updates from "0" to "1"
```

No component re-runs. No tree diffing. Only the signal's subscribers are notified.

## Tracking Contexts

A **tracking context** is any scope where signal reads are recorded as subscriptions:
- `createEffect(() => ...)`
- `createMemo(() => ...)`
- `createRenderEffect(() => ...)`
- `createComputed(() => ...)`
- JSX expressions (compiled into `createRenderEffect`)

**Outside a tracking context**, reading a signal returns the value but creates no subscription:
- Event handlers
- `setTimeout` / `setInterval` callbacks
- `async` code after the first `await`
- Top-level component body (runs once at setup)

```tsx
createEffect(() => {
  setTimeout(() => {
    console.log(count());  // NOT tracked — subscriber context is gone
  }, 1000);
});
```

## Synchronous Reactivity

Solid's reactivity is synchronous by default. When you call a setter, subscribers run immediately in a predictable order. Use `batch` to defer updates:

```tsx
import { batch } from "solid-js";

batch(() => {
  setA(1);  // doesn't trigger updates yet
  setB(2);  // doesn't trigger updates yet
});          // NOW all subscribers run once
```

Solid auto-batches inside `createEffect`, `onMount`, and store setters.

## React vs Solid Comparison

| Concept | React | Solid |
|---|---|---|
| Component function | Re-runs on every update | Runs once |
| State | `useState` — snapshot values | `createSignal` — reactive getters |
| Derived state | `useMemo` + dep array | `createMemo` — auto-tracked |
| Effects | `useEffect` + dep array | `createEffect` — auto-tracked |
| DOM updates | vDOM diff -> patch | Direct signal -> DOM binding |
| Control flow | JS expressions (ternary, map) | Components (`<Show>`, `<For>`) |
| Props | Destructurable snapshots | Live accessors — don't destructure |
| Refs | `useRef` | `let` variable (stable closure) |
| Callbacks | `useCallback` to stabilize | Plain functions (stable closure) |
| Memoization | `React.memo`, `useMemo` | Not needed — updates are granular |

### Key Migration Translations

| React | Solid | Why |
|---|---|---|
| `useRef(x)` | `let x` | Component runs once, so closures are stable |
| `useCallback(fn, [deps])` | `fn` (plain function) | Same reason — no stale closures |
| `useMemo(fn, [deps])` | `createMemo(fn)` | Auto-tracked, no dep array |
| `useEffect(fn, [deps])` | `createEffect(fn)` | Auto-tracked, no dep array |
| `useEffect(fn, [])` | `onMount(fn)` | One-time setup |
| `useEffect(() => { return cleanup }, [])` | `onCleanup(cleanup)` | Cleanup on disposal |
| `useState(x)` | `createSignal(x)` | Getter is a function call |
| `ReactDOM.createRoot(el).render(<App />)` | `render(() => <App />, el)` | Must pass function, not JSX |
| `{cond && <A />}` | `<Show when={cond}><A /></Show>` | Reactive control flow |
| `{items.map(i => <X />)}` | `<For each={items()}>{i => <X />}</For>` | Keyed reactive list |
| `const {a, b} = props` | `props.a`, `props.b` (no destructuring) | Destructuring breaks reactivity |
