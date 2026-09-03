# Solid.js Patterns and Antipatterns

## Critical Rules

These are the most common sources of bugs when writing Solid or migrating from React.

### 1. Never destructure props

```tsx
// BROKEN — captures value once, never updates
function Bad({ name, onClick }) { ... }
function Bad(props) { const { name } = props; }
function Bad(props) { const name = props.name; }

// CORRECT
function Good(props) {
  return <div onClick={props.onClick}>{props.name}</div>;
}

// CORRECT — wrap in function for local derived value
function Good(props) {
  const name = () => props.name;
  return <div>{name()}</div>;
}

// CORRECT — splitProps for grouping
function Good(props) {
  const [local, others] = splitProps(props, ["class", "children"]);
  return <div class={local.class} {...others}>{local.children}</div>;
}
```

### 2. Never put side effects in memos

```tsx
// BROKEN — can cause infinite loops
const bad = createMemo(() => {
  if (count() > 10) setMessage("too high");  // Side effect!
  return count() % 2 === 0;
});

// CORRECT — separate effect for side effects
const isEven = createMemo(() => count() % 2 === 0);
createEffect(() => {
  if (count() > 10) setMessage("too high");
});
```

### 3. Use control flow components, not JS expressions

```tsx
// BROKEN — evaluates once, never updates
return <div>{show() ? <A /> : <B />}</div>;

// CORRECT
return (
  <div>
    <Show when={show()} fallback={<B />}>
      <A />
    </Show>
  </div>
);

// BROKEN — .map() doesn't track changes
return <ul>{items().map(i => <li>{i.name}</li>)}</ul>;

// CORRECT
return (
  <ul>
    <For each={items()}>
      {(item) => <li>{item.name}</li>}
    </For>
  </ul>
);
```

### 4. Async code loses tracking context

```tsx
// BROKEN — count() is NOT tracked inside setTimeout
createEffect(() => {
  setTimeout(() => console.log(count()), 1000);
});

// CORRECT — capture value synchronously, use in async
createEffect(() => {
  const val = count();  // Tracked
  setTimeout(() => console.log(val), 1000);  // Uses captured value
});

// CORRECT — use `on` for explicit dependencies
createEffect(on(count, (val) => {
  setTimeout(() => console.log(val), 1000);
}));
```

### 5. Signals require function calls

```tsx
const [count, setCount] = createSignal(0);

count    // The getter function itself — NOT the value
count()  // The value (0)

// In JSX:
<div>{count()}</div>   // CORRECT — reactive
<div>{count}</div>     // WRONG — renders the function, not the value
```

Store values do NOT require function calls:
```tsx
const [store, setStore] = createStore({ name: "Alice" });

store.name   // CORRECT — reactive (proxy)
```

### 6. `<For>` vs `<Index>` — know which to use

| | `<For>` | `<Index>` |
|---|---|---|
| Item arg | value (not signal) | signal (`item()`) |
| Index arg | signal (`index()`) | number |
| Use when | items add/remove/reorder | fixed positions, content changes |
| Keyed by | reference | index |

```tsx
// For — items reorder, item is value, index is signal
<For each={todos()}>
  {(todo, i) => <li>#{i()} {todo.text}</li>}
</For>

// Index — positions stable, item is signal, index is number
<Index each={inputs()}>
  {(input, i) => <input value={input()} />}
</Index>
```

## Props Patterns

### Default props

```tsx
function Button(props) {
  const merged = mergeProps({ size: "md", variant: "primary" }, props);
  return <button class={`btn-${merged.size} btn-${merged.variant}`}>{merged.children}</button>;
}
```

### Splitting props for forwarding

```tsx
function Input(props) {
  const [local, inputProps] = splitProps(props, ["label", "error"]);
  return (
    <div>
      <label>{local.label}</label>
      <input {...inputProps} />
      <Show when={local.error}><span>{local.error}</span></Show>
    </div>
  );
}
```

### Safe children access

```tsx
function Wrapper(props) {
  const resolved = children(() => props.children);
  // resolved() — the children
  // resolved.toArray() — flattened array
  return <div>{resolved()}</div>;
}
```

## Store Patterns

### Nested updates with path syntax

```tsx
setStore("users", 0, "profile", "name", "Jane");
```

### Batch multiple updates with produce

```tsx
setStore(produce(state => {
  state.users[0].name = "Jane";
  state.users[0].active = true;
  state.count = state.users.filter(u => u.active).length;
}));
```

### Reconcile external data

```tsx
// When receiving full data from an API, diff it into the store
const [data, { mutate }] = createResource(fetchData);
createEffect(() => {
  if (data()) setStore("items", reconcile(data()));
});
```

### Store with on() for explicit tracking

```tsx
// WRONG — store.prop is a static value, not tracked
createEffect(on(store.prop, () => { ... }));

// CORRECT — wrap in arrow function
createEffect(on(() => store.prop, () => { ... }));
```

## Context Pattern

```tsx
// counter-context.tsx
import { createContext, useContext, createSignal } from "solid-js";

const CounterContext = createContext<ReturnType<typeof createCounterValue>>();

function createCounterValue(initial = 0) {
  const [count, setCount] = createSignal(initial);
  return {
    count,
    increment: () => setCount(c => c + 1),
    decrement: () => setCount(c => c - 1),
  };
}

export function CounterProvider(props) {
  const value = createCounterValue(props.initial);
  return <CounterContext.Provider value={value}>{props.children}</CounterContext.Provider>;
}

export function useCounter() {
  const ctx = useContext(CounterContext);
  if (!ctx) throw new Error("useCounter must be used within CounterProvider");
  return ctx;
}
```

## Event Handling Patterns

### stopPropagation — use native events

```tsx
// BROKEN — delegated events are on document, stopPropagation won't help
<button onClick={e => { e.stopPropagation(); handle(); }}>

// CORRECT — native event, attached to element
<button on:click={e => { e.stopPropagation(); handle(); }}>
```

### Don't mix reactive class and classList

```tsx
// BROKEN — reactive class overwrites classList additions
<div class={dynamicClass()} classList={{ active: isActive() }} />

// CORRECT — static class + reactive classList
<div class="base-class" classList={{ active: isActive(), highlight: isHighlight() }} />
```

## Refs Pattern

```tsx
function MyComponent() {
  let canvas!: HTMLCanvasElement;  // Definitive assignment (TypeScript)

  onMount(() => {
    // Safe to use ref here — DOM is connected
    const ctx = canvas.getContext("2d");
  });

  return <canvas ref={canvas} />;
}
```

Forwarding refs:
```tsx
function Child(props) {
  return <canvas ref={props.ref} />;  // ref is always a callback internally
}

function Parent() {
  let canvasRef!: HTMLCanvasElement;
  return <Child ref={canvasRef} />;
}
```

## External Library Integration (Yjs, d3, CodeMirror)

### Pattern: Bridge external subscriptions to signals

```tsx
function createYjsSignal<T>(ymap: Y.Map<any>, key: string): () => T {
  const [value, setValue] = createSignal<T>(ymap.get(key));
  ymap.observe((event) => {
    if (event.keysChanged.has(key)) setValue(ymap.get(key));
  });
  onCleanup(() => ymap.unobserve(/* ... */));
  return value;
}
```

### Pattern: d3-zoom on a Solid element

```tsx
function ZoomableCanvas(props) {
  let container!: HTMLDivElement;

  onMount(() => {
    const zoom = d3.zoom().on("zoom", (event) => {
      // Update a signal with the transform
      props.onTransform(event.transform);
    });
    d3.select(container).call(zoom);
  });

  return <div ref={container}>{props.children}</div>;
}
```

### Pattern: CodeMirror with solid-codemirror

```tsx
import { createCodeMirror, createEditorControlledValue } from "solid-codemirror";
import { markdown } from "@codemirror/lang-markdown";

function Editor(props) {
  const { ref, editorView, createExtension } = createCodeMirror({
    onValueChange: (v) => props.onChange(v),
  });
  createExtension(() => markdown());
  createEditorControlledValue(editorView, () => props.value);

  return <div ref={ref} />;
}
```

## Async Patterns

### Owner preservation in async callbacks

```tsx
function MyComponent() {
  const owner = getOwner();

  async function handleClick() {
    const data = await fetchSomething();
    // Lost tracking context — restore it:
    runWithOwner(owner, () => {
      createEffect(() => { /* can use context, create effects */ });
    });
  }

  return <button onClick={handleClick}>Load</button>;
}
```

### createResource with Suspense

```tsx
function UserProfile() {
  const [userId] = useParams();
  const [user] = createResource(() => userId, fetchUser);

  return (
    <Suspense fallback={<Skeleton />}>
      <ErrorBoundary fallback={<ErrorView />}>
        <div>{user().name}</div>
      </ErrorBoundary>
    </Suspense>
  );
}
```

## React Migration Checklist

When porting a React component to Solid:

1. Remove all `useCallback` — plain functions are stable
2. Remove all `useMemo` — replace with `createMemo` (no dep array) or plain derivation
3. Remove all `useRef` for values — use `let` variables
4. Keep `ref` for DOM elements — use `let el!: HTMLElement` with `ref={el}`
5. Replace `useState` with `createSignal` — remember getter is a function call
6. Replace `useEffect(fn, [deps])` with `createEffect(fn)` — no dep array
7. Replace `useEffect(fn, [])` with `onMount(fn)`
8. Replace `useEffect(() => { return cleanup })` with `onCleanup(cleanup)`
9. Stop destructuring props — use `props.x` or `splitProps`
10. Replace ternaries/map in JSX with `<Show>`, `<For>`, `<Switch>`/`<Match>`
11. Replace `ReactDOM.createRoot(el).render(<App />)` with `render(() => <App />, el)`
12. Replace `React.createContext` with `createContext` (nearly identical API)
13. Remove `React.memo` — not needed, updates are granular
14. Remove `key` props on list items — `<For>` handles identity by reference
15. Audit all `className` to `class`
16. Audit all style objects: `backgroundColor` to `"background-color"`
