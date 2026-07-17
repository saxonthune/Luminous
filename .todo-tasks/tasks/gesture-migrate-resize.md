# Migrate node-resize into the Gesture machine

## Motivation

Chain phase 3 (final). Builds on `gesture-migrate-connection` (phase 2). With drag,
marquee, and connect in the `Gesture` machine, `useNodeResize`
(`packages/cactus/src/interactions/useNodeResize.ts`), entered via `ResizeHandle`,
is the last pointer-drag hook owning its own `pointerdown` + `window` listeners.
Moving it in completes the consolidation: every mutually-exclusive pointer gesture
is one variant of one signal.

## Do NOT

- **Do NOT** touch drag / marquee / connect logic beyond adding the resize variant.
- **Do NOT** change resize behavior: preserve the per-direction
  (`ResizeDirection`) delta math (`useNodeResize.ts:55-62`) and any host min-size
  clamping (clamping lives in the host callback — keep the callback contract).
- **Do NOT** attempt the single root-arbiter refactor as required work — it is an
  optional consideration at the end (see Out of Scope).

## Plan

### 1. Extend the union (`useGesture.ts`)

Add `{ kind: 'resizing'; nodeId: string; dir: ResizeDirection; startX: number;
startY: number }`. Re-export `ResizeDirection` (keep its current definition; move it
next to the union or import it — do not duplicate the type).

### 2. Move the resize lifecycle into the machine

Port `onResizePointerDown` and its `handlePointerMove/Up` into `useGesture`, driven
by a `beginResize(nodeId, direction, event)` entry called from `ResizeHandle`'s
native `on:pointerdown`. Keep the per-direction `deltaWidth`/`deltaHeight` math and
the `onResizeStart` / `onResize` / `onResizeEnd` callbacks.

### 3. Wire `ResizeHandle`

`ResizeHandle.tsx:17` already stamps `data-no-pan`. Switch its resize entry to a
native `on:pointerdown` calling `beginResize`.

### 4. Tests

Add jsdom coverage: `beginResize` with `{horizontal:'right', vertical:'none'}` →
`gesture().kind === 'resizing'`; move fires `onResize` with the right signed
`deltaWidth`/`deltaHeight`; a `left`/`top` direction inverts the sign; pointerup
fires `onResizeEnd` and returns to `idle`; zoom scale divides the delta.

## Files to Modify

- `packages/cactus/src/interactions/useGesture.ts` — add `resizing` variant + lifecycle + `beginResize`; host `ResizeDirection`.
- `packages/cactus/src/ResizeHandle.tsx` — native `on:pointerdown` calling `beginResize`.
- `packages/cactus/tests/useGesture.test.tsx` — resize coverage.
- `packages/cactus/src/interactions/useNodeResize.ts` — remove if no remaining importers; else leave.

## Verification

```bash
pnpm -C packages/cactus exec tsgo --noEmit
pnpm -C packages/client exec tsgo --noEmit
pnpm -C packages/cactus exec vitest run
```

Existing suites stay green; resize coverage passes.

## Out of Scope

- **The single root `on:pointerdown` arbiter.** Now that the union covers
  idle/pressing/draggingNode/marquee/connecting/resizing, a root handler could
  classify the target once and dispatch to the right `begin*`, retiring the
  per-handle entry points. File this as a separate follow-up after reviewing how
  much it actually simplifies — do NOT bundle it into this phase.
- Any change to resize behavior, min-size rules, or handle visuals.

## Surface after this phase

- `Gesture` gains `{ kind: 'resizing'; nodeId; dir; startX; startY }`; the machine
  owns the lifecycle via `beginResize(...)` and calls
  `onResizeStart/onResize/onResizeEnd`. `ResizeDirection` is exported from the
  gesture module.
- `ResizeHandle` enters via native `on:pointerdown`.
- The `Gesture` union now covers all pointer gestures:
  idle, pressing, draggingNode, marquee, connecting, resizing — each entered by a
  `begin*` method, each rendered (where it has a preview) from `gesture()`.
- Candidate next step (not done here): a single root arbiter replacing the
  per-handle `begin*` entry points.
