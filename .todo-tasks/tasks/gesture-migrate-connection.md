# Migrate connection-drag into the Gesture machine

## Motivation

Chain phase 2. Builds on `gesture-migrate-boxselect` (phase 1), which added the
`marquee` variant to the `Gesture` union in
`packages/cactus/src/interactions/useGesture.ts`. `useConnectionDrag`
(`packages/cactus/src/interactions/useConnectionDrag.ts`) drives edge creation —
press a connection handle, drag to a target Node, release to connect — as one more
independent pointer-gesture hook. Fold it into the machine so connect is mutually
exclusive with drag/marquee by construction.

## Do NOT

- **Do NOT** touch node drag, marquee, or resize logic beyond adding the new variant.
- **Do NOT** change connection validation or edge semantics: preserve
  `isValidConnection` gating and the `onConnect(connection)` contract exactly.
- **Do NOT** drop the `requestAnimationFrame`-throttled cursor tracking — the
  preview updates once per frame (`useConnectionDrag.ts:71-86`); keep that.
- **Do NOT** change how the drop target is found (`document.elementsFromPoint` +
  `data-connection-target` / `data-node-id` / `data-handle-id`).

## Plan

### 1. Extend the union (`useGesture.ts`)

Add `{ kind: 'connecting'; sourceId: string; sourceHandle: string | null;
startCanvasX: number; startCanvasY: number; currentScreenX: number;
currentScreenY: number }` — the fields of the current `ConnectionDragState`.

### 2. Move the connection lifecycle into the machine

Port `startConnection` and its rAF-throttled `handlePointerMove` / `handlePointerUp`
into `useGesture`, driven by a `beginConnect(sourceNodeId, sourceHandle, clientX,
clientY)` entry called from `ConnectionHandle`'s native `on:pointerdown`. Keep the
`screenToCanvas` anchor, the rAF flush, and the drop-target resolution + validity
check. On connect, call the host's `onConnect`.

### 3. Render the preview from machine state (`Canvas.tsx`)

Replace the `connectionDragState()` preview block (`Canvas.tsx:569-589`) with a
`<Match when={gesture().kind === 'connecting'}>` reading the coordinates off the
gesture and calling the host's `renderConnectionPreview`. Remove the
`useConnectionDrag` call and its plumbing from `Canvas.tsx`; keep the
`connectionDrag`/`renderConnectionPreview` props on `CanvasProps`.

### 4. Tests

Add jsdom coverage: `beginConnect` → `gesture().kind === 'connecting'`; move updates
the preview coords; pointerup over a `data-connection-target` fires `onConnect` with
the right source/target; pointerup over empty space does not; `isValidConnection`
returning false suppresses `onConnect`.

## Files to Modify

- `packages/cactus/src/interactions/useGesture.ts` — add `connecting` variant + lifecycle + `beginConnect`.
- `packages/cactus/src/Canvas.tsx` — render preview from machine state; drop `useConnectionDrag` wiring.
- `packages/cactus/src/ConnectionHandle.tsx` — native `on:pointerdown` calling `beginConnect`.
- `packages/cactus/tests/useGesture.test.tsx` — connection coverage.
- `packages/cactus/src/interactions/useConnectionDrag.ts` — remove if no remaining importers; else leave.

## Verification

```bash
pnpm -C packages/cactus exec tsgo --noEmit
pnpm -C packages/client exec tsgo --noEmit
pnpm -C packages/cactus exec vitest run
```

Existing suites stay green; connection coverage passes.

## Out of Scope

- Resize migration (phase 3).
- Any change to connection validation, edge routing, or preview visuals.

## Surface after this phase

- `Gesture` gains `{ kind: 'connecting'; sourceId; sourceHandle; startCanvasX;
  startCanvasY; currentScreenX; currentScreenY }`; the machine owns the lifecycle
  via `beginConnect(...)` and calls `onConnect` with `isValidConnection` gating.
- The preview renders from `gesture()` in `Canvas.tsx`; the `useConnectionDrag`
  call is gone from `Canvas.tsx`. `connectionDrag` / `renderConnectionPreview`
  props preserved.
- `ConnectionHandle` enters via native `on:pointerdown`.
- Still present: node drag + marquee via the machine, `useNodeResize`,
  `useSelection`.
- Not yet migrated: resize.
