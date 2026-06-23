# Durable text-overflow policy with click-to-expand

## Motivation

The `node-size-from-deep-lod` task landed a quick `max-width: 320px; white-space: normal; overflow-wrap: break-word` in `Text.tsx` so long descriptions don't blow node sizes out under the deep-LOD measurement regime. That's a symptom fix — the wrap width is a magic number, and prose-heavy nodes still get tall (no line cap).

The durable solution is a real overflow policy: a `clamp` wrapper primitive that pack authors can put around any region of content, plus a sensible auto-clamp default for `body`/`caption` text. Clamped regions show an ellipsis preview on the canvas and open the existing inspector panel when clicked. The deep-LOD measurement utility measures the clamped DOM, so node sizes stay bounded by what's visible — not by underlying content length.

The inspector panel already exists, already renders nodes at `level: 'open'`, and is opened via `RenderContext.inspect(nodeId)`. So the expanded-view UI is solved — this task wires clamp affordances into that existing surface, no new panels/popovers/modals.

## Do NOT

- Do NOT build a new popover, modal, or per-node-state in-place expansion. The inspector panel is the expanded view. Reuse it.
- Do NOT implement per-LOD clamping (e.g. "clamp to 2 lines at card, 5 at open"). One clamp value per declared region, independent of zoom. LOD already controls *which* primitives render via `kind.render[level]`; clamp controls *how much* of a given region.
- Do NOT remove the magic `max-width: 320px` from `Text.tsx` until the auto-clamp default in step 3 is in place — otherwise prose-heavy nodes regress to single-line stretching.
- Do NOT add a `clamp` prop to existing primitives in addition to the wrapper. One way to clamp content (the wrapper), full stop. The auto-default on text body/caption is an internal implementation detail, not a public prop.
- Do NOT make clamped regions clickable when they fit (i.e. when there's nothing to expand). The click-to-inspect affordance only appears when content actually overflows.
- Do NOT use the `-webkit-line-clamp` prefix without the standard `line-clamp` property alongside it — both should be set for forward compatibility.

## Plan

### 1. Add `currentNodeId` to `RenderContext`

In `packages/core/src/types.ts`, extend `RenderContext` with `currentNodeId: () => NodeId | undefined`. This lets primitives know which node they're rendering inside — required so the clamp primitive can call `inspect(currentNodeId())` without the pack author having to pass an id explicitly.

Update every `RenderContext` construction site to populate `currentNodeId`:

- `packages/client-next/src/PgCanvasView.tsx` — the main `renderCtx` (around lines 201–218) is shared across all nodes; needs to become per-node. Easiest: pass `currentNodeId` as part of the For loop in `renderNodes` (lines 142–171), construct a per-node `RenderContext` that wraps the shared one. Alternatively, make `currentNodeId` a signal set just before each node renders. Pick whichever fits Solid's reactivity model — the former is cleaner.
- `packages/client-next/src/inspector/InspectorPanel.tsx` (the `renderCtx` at lines 129–137) — set `currentNodeId: () => id`.
- `packages/client-next/src/deepLodMeasure.ts` (landed in the previous task) — set `currentNodeId: () => nodeId` for each node being measured.

The signature change is non-breaking-ish — existing callers that don't set it pass `() => undefined`, and the clamp primitive degrades gracefully when undefined (no inspect on click).

### 2. New `clamp` wrapper primitive

New file `packages/core/src/render/primitives/Clamp.tsx`:

```ts
export default function Clamp(
  props: Record<string, unknown>,
  ctx: RenderContext,
  children: () => JSX.Element,
): JSX.Element { ... }
```

Props:
- `lines` (number, default 3) — max number of lines before clamping kicks in.

Behavior:
- Render `children()` inside a `<div>` with:
  - `display: -webkit-box`
  - `-webkit-box-orient: vertical`
  - `-webkit-line-clamp: ${lines}`
  - `line-clamp: ${lines}` (standard, alongside the prefixed property)
  - `overflow: hidden`
  - `text-overflow: ellipsis`
- Detect overflow at render time: compare `scrollHeight > clientHeight` after mount (via `onMount` + ResizeObserver on the clamp div). Track via a signal `overflowed`.
- When `overflowed()`:
  - Add `cursor: pointer` to the div.
  - Add `title="Click to expand"` for hover affordance.
  - `onClick`: if `ctx.currentNodeId?.()` is defined, call `ctx.inspect(ctx.currentNodeId()!)`. Stop event propagation so it doesn't trigger node drag.
- When not overflowed: render plain, no click handler, no cursor change.

Register in:
- `packages/core/src/render/primitive-names.ts` — add `'clamp'`.
- `packages/core/src/render/registry.ts` (or wherever primitives are registered with `interpret.ts`) — register the `Clamp` component.
- `packages/core/src/render/interpret.ts` — if it has a hardcoded primitive switch, add the case.

### 3. Auto-clamp default in `Text.tsx` body/caption

In `packages/core/src/render/primitives/Text.tsx`:

- Remove the `max-width: 320px; white-space: normal; overflow-wrap: break-word` added by the previous task from the body/caption branches.
- For the `body` and `caption` branches (the `<Show>` block around lines 49–53), wrap the rendered output in a default clamp at 4 lines using the **same CSS approach** as the `Clamp` primitive (so the visual result matches):
  - `display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; line-clamp: 4; overflow: hidden; text-overflow: ellipsis`
  - `white-space: normal; overflow-wrap: break-word; max-width: 320px` to give text something to wrap against (yes, 320px stays — but now scoped to the auto-clamp default, not load-bearing for size stability).
- Add the same overflow-detect + click-to-inspect behavior as `Clamp`, conditional on `ctx.currentNodeId?.()` being defined. Factor the overflow-detect + click handler into a small shared hook (`packages/core/src/render/useOverflowInspect.ts`) so `Text.tsx` and `Clamp.tsx` share the logic.
- Heading branch stays unchanged — headings are short labels.
- Comment: `// Auto-clamp default for body/caption. Pack authors who need different behavior should wrap content in a 'clamp' primitive explicitly.`

### 4. Pack-side adoption: rtp-statechart

In `packages/core/packs/rtp-statechart.pack.json` (and the mirrored `.canvases/rtp-statechart.pack.json` if those are separate files):

- The `rtp.screen` card render currently has a long `{content.description}` rendered as plain `text` caption. Leave it — it'll pick up the auto-clamp default from step 3.
- The `rtp.screen` `open` and `deep` renders (if they exist or get added) should explicitly wrap the description in `{ type: 'clamp', lines: 8, children: [...] }` to allow more visible content at higher LODs while still bounding the node.

Do the same audit for any other pack with prose-y fields:
- `packages/core/packs/primitives.pack.json` — check for similar long-text fields.
- `RankThePlanet/.luminous/generated/02-design/02-interaction/01-navigation.canvas.pack.json` — `rtp.screen` description is the original culprit; verify auto-clamp covers it.

### 5. Inspector: make sure full content is visible

The inspector renders at `level: 'open'` (`InspectorPanel.tsx:130`). If `open` renders also use clamp wrappers, the inspector will render clamped content too — which defeats the purpose.

Two options:
- Have the inspector pass a different `currentNodeId`-less ctx that signals "no clamp" (e.g. `ctx.expanded: () => true`), and have Clamp + auto-clamp text check `if (ctx.expanded?.()) render without clamping`.
- Make the inspector always render at `level: 'deep'` if available, where pack authors are expected to provide unclamped content.

Pick option 1 (`expanded` flag on ctx). It's mechanical, doesn't require pack authors to declare a deep render, and the same primitive code paths work for both contexts.

Apply in `InspectorPanel.tsx`: set `expanded: () => true` on the inspector's `renderCtx`. In `Clamp.tsx` and the text auto-clamp branch, short-circuit clamping when `ctx.expanded?.()` is true.

### 6. Deep-LOD measurement compatibility

The deep-LOD measurement utility (`packages/client-next/src/deepLodMeasure.ts`) renders nodes at their deepest declared level with `ctx.zoom() = 1`. It should NOT set `expanded: true` — measurement reflects the clamped (visible) form, not the inspector form. That keeps node sizes bounded.

Verify by reading `deepLodMeasure.ts` after the previous task lands and confirming no expanded flag is set. Add a code comment to that effect so future contributors don't "fix" it.

### 7. Test the interaction

- Drag a node whose clamp region is overflowed. The click-to-inspect handler must `stopPropagation` or check `event.defaultPrevented` — otherwise dragging the node from its description area opens the inspector instead.
- Acceptable: small drag distance threshold before treating as click vs drag. Or simpler: `onMouseDown` records cursor position, `onClick` only inspects if cursor moved less than 4px. Add this guard to the shared `useOverflowInspect` hook.

## Files to Modify

- `packages/core/src/types.ts` — add `currentNodeId?: () => NodeId | undefined` and `expanded?: () => boolean` to `RenderContext`.
- `packages/core/src/render/primitives/Clamp.tsx` — NEW. Wrapper primitive.
- `packages/core/src/render/useOverflowInspect.ts` — NEW. Shared overflow-detect + click-to-inspect logic with drag-vs-click guard.
- `packages/core/src/render/primitives/Text.tsx` — replace magic `max-width` with auto-clamp default for body/caption; remove from heading; consume `useOverflowInspect`.
- `packages/core/src/render/primitive-names.ts` — register `'clamp'`.
- `packages/core/src/render/registry.ts` (or `interpret.ts`) — wire `Clamp` into the primitive resolver.
- `packages/client-next/src/PgCanvasView.tsx` — populate `currentNodeId` per node in `renderNodes`.
- `packages/client-next/src/inspector/InspectorPanel.tsx` — set `currentNodeId` and `expanded: () => true` on the inspector ctx.
- `packages/client-next/src/deepLodMeasure.ts` — set `currentNodeId` per node; leave `expanded` unset/false. Add comment.
- `packages/core/packs/rtp-statechart.pack.json` — audit prose fields; add explicit `clamp` wrappers in `open`/`deep` renders where appropriate.
- `RankThePlanet/.luminous/generated/02-design/02-interaction/01-navigation.canvas.pack.json` — same audit. (May be out-of-repo; do only the in-repo pack and document for the user to mirror.)
- `packages/core/src/__tests__/Clamp.test.tsx` — NEW. Render with overflowed/non-overflowed content; assert click handler attached only when overflowed; assert inspector callback invoked.
- `packages/core/src/__tests__/Text.test.tsx` — update or add tests for auto-clamp on body/caption; verify heading still unaffected.
- `packages/client-next/tests/PgCanvasView.test.ts` — verify `currentNodeId` is plumbed correctly.

## Verification

```bash
pnpm -r typecheck
pnpm -r test
```

## Manual Verification

After the automated gate passes, run `pnpm --filter @luminous/canvas dev` yourself and verify in a browser. Do NOT put the dev server command in the fenced block above — execute-plan runs every line in it and the dev server never exits.

1. Open the rtp-navigation canvas at card zoom.
2. EntryDrawer's description should clamp to ~4 lines with an ellipsis.
3. Hover the description: cursor changes to pointer, tooltip "Click to expand".
4. Click the description: inspector panel opens on the right showing full content.
5. Hover a node whose description fits (no overflow): cursor stays default, no tooltip.
6. Drag EntryDrawer by its description area: node drags, inspector does NOT open.
7. Click (no drag) on the description: inspector opens.
8. Inspector body shows full unclamped content (the `expanded` flag suppresses clamping).
9. Zoom in/out: node sizes stay stable (deep-LOD measurement sees clamped content).

## Out of Scope

- Rich-text editing in the expanded view.
- Per-user expanded-state persistence across sessions.
- Markdown-aware clamping (clamping in the middle of a list item, etc.). The CSS line-clamp approach truncates by visual line and is acceptable for v1; Markdown.tsx content can be wrapped in `clamp` like any other content.
- Search/highlight inside the expanded view.
- A `clamp` mode that adds an explicit "show more" link inside the clamped region (we picked whole-region-clickable). Could be added later as a `clamp` prop variant if there's user demand.
- Configurable click target (popover vs inspector vs modal). Inspector is the chosen target.
- Animation when expanding/collapsing.

## Notes

- This task assumes `node-size-from-deep-lod` has landed: `NodeContainer` uses fixed `width`/`height`, `deepLodMeasure` exists, and `Text.tsx` has the `max-width: 320px` magic number that this task replaces. Verify those preconditions before starting.
- The drag-vs-click guard in `useOverflowInspect` is critical — without it, clamped descriptions become un-draggable surfaces.
- Pack authors should treat `clamp` as the canonical way to bound any potentially-long content region, not just text. Anything that goes inside a card with prose, lists, or potentially-many children is a candidate.
- Future polish: a `clampHeight` variant (clamp to pixel height rather than line count) for non-text content like badge lists or kv-lists. Not in scope here — the line-count form covers the common prose case.
- Future polish: a small "+N more" hint at the bottom of the clamped region (instead of just an ellipsis) to make discoverability stronger. Not in scope; the cursor + tooltip is enough for v1.
