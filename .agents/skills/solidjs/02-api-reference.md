# Solid.js API Reference

## Basic Reactivity

### createSignal

```ts
import { createSignal } from "solid-js";

function createSignal<T>(value: T, options?: {
  name?: string;
  equals?: false | ((prev: T, next: T) => boolean);
}): [get: () => T, set: Setter<T>];
```

- Getter is a function: `count()`, not `count`.
- Setter accepts value or `(prev) => next`.
- `equals: false` forces updates even when value unchanged.
- Default equality: `===` (reference equality).

### createEffect

```ts
import { createEffect } from "solid-js";

function createEffect<T>(fn: (prev: T) => T, value?: T, options?: { name?: string }): void;
```

- Runs after rendering phase, before browser paint.
- Re-runs when any tracked dependency changes.
- Receives previous return value as argument.
- **Never runs during SSR or hydration.**
- Do not set signals inside effects (use memos for derived state).

### createMemo

```ts
import { createMemo } from "solid-js";

function createMemo<T>(fn: (prev: T) => T, value?: T, options?: {
  equals?: false | ((prev: T, next: T) => boolean);
  name?: string;
}): () => T;
```

- Returns read-only accessor.
- Caches result; only recomputes when dependencies change.
- Suppresses downstream updates if value unchanged.
- Must be pure (no side effects).

### createResource

```ts
import { createResource } from "solid-js";

// Without source
function createResource<T>(fetcher: () => T | Promise<T>, options?): [Resource<T>, ResourceActions<T>];

// With source (re-fetches when source changes)
function createResource<T, S>(source: () => S, fetcher: (s: S) => T | Promise<T>, options?): [Resource<T>, ResourceActions<T>];
```

Resource properties: `state` (`"unresolved" | "pending" | "ready" | "refreshing" | "errored"`), `loading`, `error`, `latest`.

Actions: `mutate(value)` (optimistic update), `refetch()` (re-run fetcher).

Options: `initialValue`, `storage`, `deferStream`, `ssrLoadFrom`.

```tsx
const [userId, setUserId] = createSignal(1);
const [user] = createResource(userId, async (id) => {
  const res = await fetch(`/api/users/${id}`);
  return res.json();
});

// user() — the data (undefined until resolved)
// user.loading — boolean
// user.error — any error thrown
```

## Lifecycle

### onMount

```ts
import { onMount } from "solid-js";

function onMount(fn: () => void): void;
```

Runs once after initial render. Non-tracking (no dependencies). Equivalent to `createEffect` with no signal reads. Use for DOM setup, initial data fetches.

### onCleanup

```ts
import { onCleanup } from "solid-js";

function onCleanup(fn: () => void): void;
```

Runs when the enclosing scope is disposed (component unmount, effect re-run, root disposal). Use for clearing intervals, removing event listeners, unsubscribing.

```tsx
function Timer() {
  const [count, setCount] = createSignal(0);
  const timer = setInterval(() => setCount(c => c + 1), 1000);
  onCleanup(() => clearInterval(timer));
  return <div>{count()}</div>;
}
```

## Secondary Primitives

### createRenderEffect

Like `createEffect` but runs **synchronously during rendering**. Used by the compiler for DOM bindings. Rarely used directly.

### createComputed

Runs before the rendering phase. Used to synchronize state before rendering begins.

### createSelector

```ts
const isSelected = createSelector(selectedId);
// In <For>: classList={{ active: isSelected(item.id) }}
```

Optimizes selection state: only 2 updates when selection changes (old + new), not n.

### createReaction

```ts
const track = createReaction(() => console.log("changed"));
track(() => s());  // track dependencies
// Fires ONCE on next change. Must call track() again for more.
```

### createDeferred

```ts
const deferred = createDeferred(() => expensiveValue(), { timeoutMs: 500 });
```

Defers updates until browser idle. Forces update after `timeoutMs`.

## Stores

### createStore

```ts
import { createStore } from "solid-js/store";

function createStore<T>(state: T): [get: Store<T>, set: SetStoreFunction<T>];
```

- Proxy-based, fine-grained reactivity per property.
- Access without function calls: `store.name`, not `store.name()`.
- Signals created lazily — only when accessed in tracking scope.
- Setter uses **path syntax**: `setStore("users", 0, "name", "Jane")`.
- Objects are **shallow-merged** automatically.

```tsx
const [store, setStore] = createStore({
  users: [{ id: 0, name: "Alice", active: false }],
});

// Path syntax
setStore("users", 0, "active", true);

// Functional update
setStore("users", 0, "name", prev => prev.toUpperCase());

// Filter-based
setStore("users", u => u.active, "name", "Active User");

// Array of keys
setStore("users", [0, 2, 4], "active", false);

// Range
setStore("users", { from: 0, to: 5, by: 2 }, "active", true);

// Append
setStore("users", store.users.length, { id: 1, name: "Bob", active: true });
```

### produce (Immer-style mutations)

```ts
import { produce } from "solid-js/store";

setStore("users", 0, produce(user => {
  user.name = "Jane";
  user.active = true;
}));
```

### reconcile (diff external data)

```ts
import { reconcile } from "solid-js/store";

setStore("todos", reconcile(newTodosFromAPI));
// Options: { key: "id", merge: false }
```

### unwrap (extract raw object)

```ts
import { unwrap } from "solid-js/store";

const raw = unwrap(store);  // Plain object, no proxy
```

### createMutable

```ts
import { createMutable } from "solid-js/store";

const state = createMutable({ count: 0 });
state.count = 5;  // Direct mutation, automatically reactive
```

Caution: breaks unidirectional flow. Prefer `createStore` + `produce`.

## Control Flow Components

### `<Show>`

```tsx
import { Show } from "solid-js";

<Show when={condition()} fallback={<Loading />}>
  <Content />
</Show>

// Render function (value passed as accessor):
<Show when={user()} keyed>
  {(u) => <div>{u.name}</div>}
</Show>
```

`keyed`: re-renders children when `when` value changes (even if truthy->truthy).

### `<For>` (keyed by reference)

```tsx
import { For } from "solid-js";

<For each={items()} fallback={<div>No items</div>}>
  {(item, index) => <li>{item.name} (#{index()})</li>}
</For>
```

- `item` is the value (not a signal).
- `index` is a **signal** — call `index()`.
- Use for lists where items move/reorder.

### `<Index>` (keyed by index)

```tsx
import { Index } from "solid-js";

<Index each={items()}>
  {(item, index) => <li>{item().name} (#{index})</li>}
</Index>
```

- `item` is a **signal** — call `item()`.
- `index` is a plain number.
- Use for stable-length lists where content at positions changes.

### `<Switch>` / `<Match>`

```tsx
import { Switch, Match } from "solid-js";

<Switch fallback={<NotFound />}>
  <Match when={route() === "home"}><Home /></Match>
  <Match when={route() === "settings"}><Settings /></Match>
</Switch>
```

First truthy `<Match>` renders; rest ignored.

### `<Dynamic>`

```tsx
import { Dynamic } from "solid-js/web";

<Dynamic component={components[selected()]} someProp="value" />
```

Renders a component or HTML element based on runtime data.

### `<Portal>`

```tsx
import { Portal } from "solid-js/web";

<Portal mount={document.getElementById("modal")}>
  <ModalContent />
</Portal>
```

- Default mount: `document.body`.
- `isSVG={true}` for SVG contexts.
- Events propagate through **component tree**, not DOM tree.

### `<ErrorBoundary>`

```tsx
import { ErrorBoundary } from "solid-js";

<ErrorBoundary fallback={(err, reset) => (
  <div>
    <p>{err.message}</p>
    <button onClick={reset}>Retry</button>
  </div>
)}>
  <RiskyComponent />
</ErrorBoundary>
```

Catches errors in rendering and reactive computations. Does NOT catch event handler or setTimeout errors.

### `<Suspense>`

```tsx
import { Suspense } from "solid-js";

<Suspense fallback={<Loading />}>
  <AsyncComponent />
</Suspense>
```

Shows fallback while resources resolve. Nearest Suspense boundary catches.

## Context

```tsx
import { createContext, useContext } from "solid-js";

const MyContext = createContext<MyType>();

function Provider(props) {
  const value = createMyValue();
  return <MyContext.Provider value={value}>{props.children}</MyContext.Provider>;
}

function useMyContext() {
  const ctx = useContext(MyContext);
  if (!ctx) throw new Error("Missing Provider");
  return ctx;
}
```

## Reactive Utilities

### batch

```ts
batch(() => { setA(1); setB(2); });  // Subscribers run once after both updates
```

### untrack

```ts
const value = untrack(() => signal());  // Read without subscribing
```

### on (explicit dependencies)

```ts
createEffect(on(source, (value, prevValue) => { ... }, { defer: true }));
// Tracks only `source`, not other signals read inside
```

With stores, always wrap in arrow: `on(() => store.prop, ...)` not `on(store.prop, ...)`.

### from (external -> signal)

```ts
const signal = from(rxObservable$);
const signal = from(set => { /* subscribe, return cleanup */ });
```

### getOwner / runWithOwner

```ts
const owner = getOwner();
setTimeout(() => {
  runWithOwner(owner, () => {
    // Can use useContext, createEffect here
  });
}, 1000);
```

### children helper

```ts
const resolved = children(() => props.children);
resolved()           // resolved children
resolved.toArray()   // flattened array
```

### splitProps / mergeProps

```ts
const [local, others] = splitProps(props, ["class", "onClick"]);
const merged = mergeProps({ size: "md" }, props);  // Reactive defaults
```

### lazy

```ts
const LazyComp = lazy(() => import("./Heavy"));
LazyComp.preload();  // Optional eager load
```

## Rendering

```ts
import { render } from "solid-js/web";

const dispose = render(() => <App />, document.getElementById("root"));
// dispose() removes all children
```

First argument MUST be a function. `render(<App />, el)` is wrong.

## JSX Attributes

| Attribute | Purpose |
|---|---|
| `ref={el}` | Assign DOM element to variable (at creation time, before DOM mount) |
| `ref={el => ...}` | Callback ref (called at creation time) |
| `class="static"` | Static CSS class |
| `classList={{ active: isActive() }}` | Toggle classes reactively |
| `style={{ color: "red", "font-size": "14px" }}` | Inline styles (dash-case keys) |
| `on:click={handler}` | Native (non-delegated) event |
| `onClick={handler}` | Delegated event |
| `onClick={[handler, data]}` | Bound handler (avoids closure) |
| `use:directive={value}` | Custom directive |
| `prop:scrollTop={val}` | Force DOM property (not attribute) |
| `attr:data-x={val}` | Force HTML attribute |
| `bool:hidden={val}` | Toggle attribute presence |
| `innerHTML={html}` | Raw HTML (XSS risk!) |
| `textContent={text}` | Optimized text-only content |

### Event Handling

Delegated events (`onClick`): attached to document, synthetic delegation. Works for common UI events.

Native events (`on:click`): attached directly to element. Use when you need `stopPropagation`, `capture`, `passive`, `once`.

```tsx
// Delegated (common)
<button onClick={() => doThing()}>Click</button>

// Native with options
<div on:wheel={{ handleEvent(e) { ... }, passive: true }} />

// Bound handler (avoids closure allocation)
<li onClick={[handler, item.id]} />
```

Full list of delegated events: `beforeinput`, `click`, `dblclick`, `contextmenu`, `focusin`, `focusout`, `input`, `keydown`, `keyup`, `mousedown`, `mousemove`, `mouseout`, `mouseover`, `mouseup`, `pointerdown`, `pointermove`, `pointerout`, `pointerover`, `pointerup`, `touchend`, `touchmove`, `touchstart`.

### Custom Directives

```tsx
function tooltip(el: HTMLElement, accessor: () => string) {
  createEffect(() => { el.title = accessor(); });
}

<div use:tooltip={"Hello"} />
```

Directives only work on native elements (not components).

## Testing

```tsx
import { render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";

const user = userEvent.setup();

test("works", async () => {
  const { getByRole } = render(() => <Counter />);  // Must be a function
  const btn = getByRole("button");
  expect(btn).toHaveTextContent("0");
  await user.click(btn);
  expect(btn).toHaveTextContent("1");
});
```

- `render()` requires a **function**, not JSX directly.
- Use `screen` to query Portal content.
- Use `findBy*` (async) when resources or routes are involved.
- `renderHook(createCounter)` for testing custom primitives.
- `renderDirective(directive, initialValue)` for testing directives.

## Tailwind Integration

```css
/* src/index.css */
@import "tailwindcss";
```

```js
// postcss.config.mjs
export default { plugins: { "@tailwindcss/postcss": {} } };
```

```tsx
// Entry point
import "./index.css";
render(() => <App />, document.getElementById("root"));
```

Use `class` (not `className`). Style keys are dash-case: `"background-color"`, not `backgroundColor`.
