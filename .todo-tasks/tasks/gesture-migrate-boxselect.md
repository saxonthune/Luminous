# Migrate box-select (marquee) into the Gesture machine

## Motivation

Chain phase 1 of the gesture consolidation. `gesture-machine-node-drag` (this
chain's predecessor, standalone) introduced the `Gesture` discriminated-union
signal in `packages/cactus/src/interactions/useGesture.ts` and routed node
dragging through it. `useBoxSelect`
(`packages/cactus/src/interactions/useBoxSelect.ts`) is the marquee — a second
independent `pointerdown` + `window` listener coordinating with the rest only
through `data-*` checks. Fold it into the machine so marquee is one variant of the
one gesture signal.

## Do NOT

- **Do NOT** touch node dragging, connection-drag, or resize in this phase.
- **Do NOT** change marquee semantics: preserve both `trigger` modes
  (`'shift-drag'` default, `'drag'`), the plain-background-click-clears behavior in
  `'drag'` mode, and the `onBoxSelectHits` callback contract.
- **Do NOT** re-invert or touch `shouldViewportPan` / `data-pan-surface`.
- **Do NOT** remove `useBoxSelect` if another package still imports it — check
  first; only remove once Atlas and Dataflow both route through the machine.

## Plan

### 1. Extend the union (`useGesture.ts`)

Add `{ kind: 'marquee'; startX: number; startY: number; rect: { x; y; width; height } | null }`
to `Gesture`. `startX/startY` are container-relative screen coords (matching
`useBoxSelect`'s existing math); `rect` is the live selection rectangle.

### 2. Move the marquee lifecycle into the machine

Port `useBoxSelect`'s `handlePointerDown/Move/Up` (currently bound to the container
in `onMount`) into `useGesture`. Entry: a plain-left or shift-left press on the pan
surface (target has no `[data-container-id]` and no `[data-no-pan]`). Reuse the
existing `rectsIntersect` hit-test and the `transform`/`getNodeRects` inputs. Keep
the trigger gate (`shift-drag` needs Shift; `drag` needs neither and clears on a
no-move click). The machine exposes the live rect and calls the host's
`onBoxSelectHits(ids)`.

### 3. Render the marquee from machine state (`Canvas.tsx`)

Replace the standalone `selectionRect()` render block (`Canvas.tsx:591-606`) with a
`<Switch>/<Match when={gesture().kind === 'marquee'}>` (or a `<Show>` keyed on the
marquee variant) reading the rect off the gesture. Remove the `useBoxSelect` call
and its `selectionRect` plumbing from `Canvas.tsx`.

### 4. Tests

Port `tests/useBoxSelect.test.tsx` to drive the machine (same jsdom
`pointerdown/move/up` harness). Preserve every existing assertion: `'drag'`
marquees without Shift, no-move click clears, non-left ignored, default
`'shift-drag'` needs Shift.

## Files to Modify

- `packages/cactus/src/interactions/useGesture.ts` — add `marquee` variant + lifecycle.
- `packages/cactus/src/Canvas.tsx` — render marquee from machine state; drop `useBoxSelect` wiring.
- `packages/cactus/tests/useGesture.test.tsx` (or a new `marquee` section) — port box-select coverage.
- `packages/cactus/src/interactions/useBoxSelect.ts` — remove if no remaining importers; else leave.

## Verification

```bash
pnpm -C packages/cactus exec tsgo --noEmit
pnpm -C packages/client exec tsgo --noEmit
pnpm -C packages/cactus exec vitest run
```

Existing cactus + client suites stay green; ported marquee assertions pass.

## Out of Scope

- Connection-drag and resize migration (later chain phases).
- Any change to selection or marquee visuals/semantics.

## Surface after this phase

- `Gesture` gains `{ kind: 'marquee'; startX; startY; rect }`; the machine owns the
  marquee lifecycle and calls `onBoxSelectHits`.
- The marquee rect renders from `gesture()` in `Canvas.tsx`; the standalone
  `selectionRect` path and the `useBoxSelect` call are gone from `Canvas.tsx`.
- Both `trigger` modes and click-to-clear preserved.
- Still present and relied on: node drag via the machine, `useConnectionDrag`,
  `useNodeResize`, `useSelection`, `shouldViewportPan`/`data-pan-surface`.
- Not yet migrated: connection-drag, resize.
