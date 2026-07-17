# Content scrolls only when it overflows, otherwise the wheel zooms the canvas

## Motivation

Wheel-over-a-Node always zooms the canvas today — d3-zoom's filter passes every
wheel event (`useViewport.ts:33`, `if (event.type === 'wheel') return true`) and it
listens on the container, so the content's `overflow-auto` never gets to scroll.
The desired behavior: when the content **overflows** its section, the wheel scrolls
the content; when it **fits**, the wheel bubbles through and zooms the canvas as
usual. The user should not lose canvas zoom just for hovering a Node whose content
fits.

## Do NOT

- **Do NOT** unconditionally trap the wheel on content — that would break canvas
  zoom over every Node. Trap **only** when the element actually overflows and is not
  at the scroll boundary in the wheel's direction.
- **Do NOT** change `useViewport`/d3's wheel filter. The gate is a wheel handler on
  the Atlas content section that conditionally stops propagation; d3 stays as-is.
- **Do NOT** `preventDefault` when letting the wheel through — only when the content
  itself consumes the scroll.

## Plan

### 1. Conditional wheel handler on the content section (`AtlasNodeContent.tsx`)

On the scrollable content element, add a native `on:wheel` handler:

- Compute `overflowing = el.scrollHeight > el.clientHeight`.
- If `overflowing` **and** the scroll isn't past a boundary in the wheel direction
  (scrolling down with room below, or up with room above), let the browser scroll
  the element and `stopPropagation()` so d3 (listening on the container) does not
  also zoom.
- Otherwise (fits, or at the boundary), do nothing — the wheel bubbles to d3 and the
  canvas zooms.

Use `data-no-pan` presence as already set; the decision is purely the overflow +
boundary test. Add `overscroll-behavior: contain` on the content element so a
boundary scroll doesn't chain to an ancestor unexpectedly.

### 2. Test

- A unit/DOM test (or a focused component test) asserting: with `scrollHeight >
  clientHeight`, a wheel event has propagation stopped; with content fitting,
  propagation is not stopped. If jsdom can't measure layout, extract the decision
  as a pure `shouldConsumeWheel(el, deltaY)` helper and unit-test it against a
  stubbed `{scrollHeight, clientHeight, scrollTop}`.

## Files to Modify

- `packages/client/src/apps/atlas/AtlasNodeContent.tsx` — conditional `on:wheel` handler + `overscroll-behavior: contain`; extract `shouldConsumeWheel` if needed for testing.
- `packages/client/src/apps/atlas/AtlasNodeContent.test.tsx` (or a helper test) — the overflow/boundary decision.

## Verification

```bash
pnpm -C packages/client exec tsgo --noEmit
pnpm -C packages/client exec vitest run
```

## Out of Scope

- Horizontal content scroll (only vertical for now).
- Changing d3-zoom's wheel behavior or the pan filter.

## Notes

- Native `on:wheel` is required so `stopPropagation` reaches d3's native container
  listener (delegated handlers fire too late — the recurring native-vs-delegated
  lesson).
- Extracting `shouldConsumeWheel(el, deltaY)` keeps the boundary logic testable
  without a real layout.

## Surface after this phase

- Atlas content scrolls on the wheel only when it overflows and isn't at a boundary;
  otherwise the wheel zooms the canvas.
- A pure `shouldConsumeWheel(el, deltaY)` decision helper exists (if extracted).
- d3-zoom / pan filter unchanged.
