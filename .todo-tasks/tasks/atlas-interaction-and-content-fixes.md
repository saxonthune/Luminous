# Fix broken node interactions: defer pointer capture, native resize handle, bordered content section

## Motivation

Three defects, two root causes, found by driving the app after the header/body +
content-sizing work merged:

1. **Double-click never enters edit mode**, and **the MD/Code switcher no longer
   fires** — same root cause. `useGesture.beginPress` calls `setPointerCapture` on
   the NodeContainer **eagerly, on pointerdown**, before any drag threshold
   (`useGesture.ts:114-115`). Once an ancestor captures the pointer, the browser
   dispatches the resulting `click`/`dblclick` to the **capturing element**, not to
   the button or content actually under the cursor. So `ModeSwitcher`'s button
   `onClick` (`AtlasNodeContent.tsx:60`) and `AtlasNodeContent`'s `onDblClick`
   (`:156`) never run — the events are redirected to the NodeContainer and bubble
   away from both. This regressed the switcher when the Gesture machine replaced
   the old drag, and it is why double-click has never worked (old
   `atlas-interaction-bugs` item 2, now explained).

2. **The content resize handle is undiscoverable and fights the node drag.** It
   exists (`AtlasNodeContent.tsx:241-246`) but is a transparent 6px strip, and it
   uses a **delegated** `onPointerDown` + `stopPropagation`, which cannot stop
   NodeContainer's **native** `on:pointerdown` (`NodeContainer.tsx:63`) — the native
   listener fires first, during bubbling, before Solid's delegated dispatch at the
   document root. So dragging the handle also starts a node move.

## Do NOT

- **Do NOT** remove pointer capture entirely — drags still need it so the pointer
  stays locked to the node when it leaves the element. **Defer** it to the moment a
  drag actually begins, not on press.
- **Do NOT** "fix" the switcher/double-click by adding more `stopPropagation` on
  delegated handlers — that's the trap that doesn't work (native ancestor listener
  fires first). The capture deferral is the real fix; where a child must block the
  native press (the resize handle), switch that handler to native `on:pointerdown`.
- **Do NOT** change the drag threshold, the Gesture union, or any other gesture
  (marquee/connect/resize). Only the press→drag capture timing.
- **Do NOT** regress the existing behavior that a press with no movement selects
  the node (`ctx.onNodePointerDown` at `AtlasCanvas.tsx:151`).

## Plan

### 1. Defer pointer capture to the drag-threshold crossing (`useGesture.ts`)

Remove the eager capture at `useGesture.ts:114-115`. Capture the `target` element
and `event.pointerId` in the closure (as now), but call `setPointerCapture` only
when `pressing → draggingNode` transitions (`:127`), tracking a `captured` flag.
In `handlePointerUp` (`:138`) release only if `captured`. A click or double-click
never moves, so it never captures, and `click`/`dblclick` dispatch normally to the
button/content.

### 2. Make the resize handle native so it blocks the node press (`AtlasNodeContent.tsx`)

Change the handle's `onPointerDown` (`:244`) to native `on:pointerdown`. Its
`beginResize` already calls `e.stopPropagation()` (`:105`); native stopPropagation
now genuinely stops NodeContainer's native `on:pointerdown` during bubbling, so
resizing the content band no longer starts a node drag.

### 3. Give the content its own bordered, resizable section (`AtlasNodeContent.tsx`)

Redesign the read view so the Content is a visually distinct section beneath the
title/switcher row: its own border, and a **visible** resize handle at its bottom
edge (a grip, not a transparent strip) so the affordance is discoverable. Keep the
existing `overflow-auto` scroll for overflow. For a container this section is the
header band; for a leaf it is the whole content area below the title. Preserve the
color styling and the header-band clamp (`:154`).

### 4. Regression tests

None exist for any of this. Add:
- **cactus** (`packages/cactus/tests/`): a `useGesture` test that a press without
  movement does **not** capture the pointer, and that a `click` on a child element
  fires after such a press (assert via a spy that the child handler runs). And that
  crossing the threshold **does** capture.
- **client** (`AtlasCanvas` / `AtlasNodeContent` test): double-click a node enters
  edit mode (`editingId` set); clicking the switcher dispatches a mode change; a
  pointerdown on the resize handle does not begin a node drag.

## Files to Modify

- `packages/cactus/src/interactions/useGesture.ts` — defer `setPointerCapture` to the drag transition; conditional release.
- `packages/client/src/apps/atlas/AtlasNodeContent.tsx` — native resize handle; bordered, visibly-resizable content section.
- `packages/cactus/tests/useGesture.test.ts` (new or existing) — capture-timing + click-fires coverage.
- `packages/client/src/apps/atlas/AtlasNodeContent.test.tsx` (or `AtlasCanvas.test.tsx`) — dblclick, switcher, resize-handle-does-not-drag.

## Verification

```bash
pnpm -C packages/cactus exec tsgo --noEmit
pnpm -C packages/client exec tsgo --noEmit
pnpm -C packages/cactus exec vitest run
pnpm -C packages/client exec vitest run
```

## Out of Scope

- Ctrl-drag container expansion (R5) — the next phase, `atlas-ctrl-drag-expand-container`.
- Touch pointer capture (the `touchstart` path) — record if noticed, don't fix here.
- Auto-sizing content to fit — the stored `contentHeight` resize is the mechanism.

## Notes

- The capture fix is an **engine** change and benefits every app (Dataflow's node
  clicks too), not just Atlas. Verify Dataflow still drags after the change.
- Why capture at all: without it, a fast drag that outruns the pointer off the
  element would drop events. Deferring to threshold keeps that benefit for drags
  while freeing clicks.

## Surface after this phase

- `useGesture` captures the pointer only once a drag crosses the threshold, not on
  press; plain click and double-click dispatch normally to child elements in every
  app.
- Atlas double-click enters edit mode; the MD/Code switcher changes mode; the
  content resize handle resizes without moving the node.
- The Atlas node's Content is a bordered section with a visible resize grip.
- Node press-to-select (no movement) still works; drags still capture.
