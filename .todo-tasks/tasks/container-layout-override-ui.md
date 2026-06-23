# Per-container layout-override UI (floating picker)

## Motivation

The merged stack-modes work (commit `1132850`) lets a pipeline author set a container's child
arrangement via the `childLayout` graph node prop (`pack` | `grid` | `stack-v` | `stack-h`),
resolved in `PgCanvasView`'s `resolveChildLayout` (`PgCanvasView.tsx:320-326`) — whose comment
already reserves the insertion point: *"Future: check a transient session-override overlay here
before falling back to the graph prop."* This task adds the user-facing half: a small floating
picker on container nodes that overrides the resolved policy for that container, transiently (not
persisted).

## Do NOT

- Do NOT put the control in `NodeShell` — `NodeShell` is exported but NEVER instantiated by the app
  (`grep` confirms only `index.ts` re-exports it). The app renders nodes via `NodeContainer`
  (`packages/cactus/src/NodeContainer.tsx`) wrapping `resolveNodeRender`. The picker goes in
  `NodeContainer`.
- Do NOT persist the override or write it back to the graph. It is ephemeral session state in
  cactus. (Design for later: the `childLayout` graph prop is the persisted source of truth; a future
  "save" writes the overlay value into that prop via the existing Yjs sync. Not this task.)
- Do NOT let the picker overhang the node — `NodeContainer` sets `overflow: hidden` (line 50), so
  position it INSET (e.g. top-right corner, a few px in), never with negative offsets.
- Do NOT show it on leaf nodes or always-on. Containers only (`hasChildren`), revealed on
  hover/selection.
- Do NOT override the ELK algorithm or `direction` — this is child-arrangement policy only.
- Do NOT introduce a separate collapse/expand state machine — the opacity hover-reveal IS the
  expand.

## Plan

### 1. Export the policy type — `packages/cactus/src/layout-types.ts`

Extract the inline union into a named export:
`export type ChildLayoutPolicy = 'pack' | 'grid' | 'stack-v' | 'stack-h';`
and use it in `LayoutRequest.layoutPolicy`'s value type. Re-export from `index.ts`.

### 2. Transient override state in context — `packages/cactus/src/CanvasContext.ts` + `Canvas.tsx`

- `CanvasContext.ts`: add to `CanvasContextValue`:
  - `layoutOverride: (id: string) => ChildLayoutPolicy | undefined`
  - `setLayoutOverride: (id: string, policy: ChildLayoutPolicy | undefined) => void` (passing
    `undefined` clears the override for that id, reverting to the prop default).
- `Canvas.tsx`: back it with a signal holding a `Map<string, ChildLayoutPolicy>` (mirror how
  `useSelection`/other transient state is created), and wire the two accessors into `contextValue`
  (the object built near line 258 before `<CanvasContext.Provider>`). Keep it reactive — reads in a
  memo must re-run when an override changes (return a NEW map from the setter, or use a version
  signal).

### 3. The picker component — `packages/cactus/src/LayoutPicker.tsx` (new)

A small segmented control: four icon buttons (`pack`, `grid`, `stack-v`, `stack-h`) in a row. Props:
`nodeId`, `current: () => ChildLayoutPolicy` (the effective policy, for highlighting the active
button). On click, call `ctx.setLayoutOverride(nodeId, policy)` from `useCanvasContext()`. Use
simple inline SVG/Unicode glyphs (e.g. ▦ grid, ▤ stack-v, ▥ stack-h, ▢ pack) — keep it tiny; this is
an affordance, not a design centerpiece. Mark the root `data-no-pan="true"` and
`pointer-events: auto` so clicks don't pan the canvas. Active button gets the accent token
(`var(--cactus-accent-subtle, #3b82f6)`); others muted.

### 4. Mount it in NodeContainer — `packages/cactus/src/NodeContainer.tsx`

- Add props: `isContainer?: () => boolean` and `layoutPolicy?: () => ChildLayoutPolicy` (the
  effective policy for this node, supplied by the domain).
- Render the picker only when `isContainer?.()` is true. Wrap it in an absolutely-positioned div in
  the top-right INSET corner (`position:absolute; top:2px; right:2px; z-index: above content`).
- Reveal pattern: the wrapper is `opacity-0` by default, `hover:opacity-100`, AND forced visible
  when the node is selected (`useCanvasContext().isSelected(props.nodeId)`). Use a `transition-opacity`
  like the existing handles. The picker's effective `current` is
  `ctx.layoutOverride(nodeId) ?? props.layoutPolicy?.() ?? 'pack'`.
- The `softContainer` tint already uses `renderCtx.hasChildren` — `isContainer` is the same signal;
  the domain passes it explicitly (next step).

### 5. Wire the domain — `packages/client-next/src/PgCanvasView.tsx`

- `resolveChildLayout` (line 322): consult the override FIRST —
  `const o = canvasCtx.layoutOverride(id); if (o) return o;` then fall through to the existing
  prop/`'pack'` logic. (`canvasCtx` is already available in `CanvasInner` via `useCanvasContext()`.)
  This makes `layoutPolicy()` recompute when an override changes, re-running layout.
- `renderNodes` (around line 160): pass `isContainer={() => renderCtx.hasChildren(nodeId)}` and
  `layoutPolicy={() => resolveChildLayout(nodeId)}` into `<NodeContainer>`. NOTE: `renderNodes` is a
  module-scope function — thread `resolveChildLayout` (or the resolved policy) in via a parameter
  rather than closing over component scope, matching how the other callbacks are passed.

### 6. Tests — `packages/cactus/tests/`

- New `layoutOverride.test.ts`: exercise the context override map logic if extracted into a small
  pure helper/hook — set → get returns it; set `undefined` → get returns `undefined`; independent
  per id. (If the state is inlined in `Canvas.tsx` and not unit-testable in isolation, extract a tiny
  `createLayoutOverrides()` hook in `interactions/` and test that instead.)
- Do NOT attempt a full DOM render/hover test of the picker.

## Files to Modify

- `packages/cactus/src/layout-types.ts` — export `ChildLayoutPolicy`
- `packages/cactus/src/CanvasContext.ts` — add `layoutOverride` / `setLayoutOverride`
- `packages/cactus/src/Canvas.tsx` — back the override signal, wire into context value
- `packages/cactus/src/LayoutPicker.tsx` — new segmented picker component
- `packages/cactus/src/NodeContainer.tsx` — mount picker (containers only, inset, hover/selection reveal)
- `packages/cactus/src/index.ts` — export `ChildLayoutPolicy` (and `LayoutPicker` if useful)
- `packages/client-next/src/PgCanvasView.tsx` — `resolveChildLayout` reads override; `renderNodes` passes props
- `packages/cactus/tests/layoutOverride.test.ts` — override-state unit test

## Verification

```bash
pnpm --filter @luminous/cactus test
pnpm --filter @luminous/cactus typecheck
pnpm --filter @luminous/canvas typecheck
```

## Out of Scope

- Persistence / write-back of the override to the graph (separate follow-on).
- Overriding ELK algorithm/direction; any leaf-node control; always-on chrome.
- Reworking `NodeShell` (unused) — leave it as-is.

## Notes

- Engine/domain boundary (PDR D8): the layout policy vocabulary (`pack`/`grid`/`stack-v`/`stack-h`)
  is cactus layout vocabulary (defined in `gridLayout`/`layout-types`), so cactus legitimately owns
  both the override state and the picker. The domain only maps the `childLayout` prop and reads the
  override back in `resolveChildLayout`.
- Reactive loop (intended, not circular): override set → `layoutPolicy()` memo recomputes →
  `resolveChildLayout` returns the override → layout re-runs → `current` passed back to the picker
  highlights the new active button.
- `overflow: hidden` on `NodeContainer` clips overhang — keep the picker inset.
- Companion task: [[edge-connected-highlight]].
