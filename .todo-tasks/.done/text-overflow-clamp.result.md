# Agent Result: text-overflow-clamp

**Date**: 2026-05-22T12:56:42-04:00
**Branch**: feat/260410_claude_text-overflow-clamp
**Worktree**: /home/saxon/code/github/saxonthune/Luminous/../agent-text-overflow-clamp
**Session**: completed
**Verification**: passed
**Merge**: clean
**Commits**: 4
**Retried**: false


## Commits

```
b075ef7 docs: document clamp primitive in luminous-pipeline skill reference
2e59fa2 test: add tests for Clamp primitive and Text auto-clamp behavior
d4230b0 feat: plumb currentNodeId and expanded through render contexts
a46df2d feat: add clamp primitive and auto-clamp default for body/caption text
```

## Claude Summary

All 278 tests pass (231 core + 47 client-next).

---

## Implementation Summary

Implemented all 7 steps of the plan across 4 commits:

1. **`RenderContext` extended** (`types.ts`) — added `currentNodeId?: () => NodeId | undefined` and `expanded?: () => boolean`.

2. **`useOverflowInspect` hook** (`render/useOverflowInspect.ts`) — shared overflow-detect + click-to-inspect logic with a 4px drag-distance guard. Uses `ResizeObserver` with a `typeof` guard so it degrades gracefully in jsdom.

3. **`Clamp` primitive** (`render/primitives/Clamp.tsx`) — wraps children with CSS `display:-webkit-box` line-clamp. Applies `cursor:pointer` and `title="Click to expand"` when overflowed; suppresses clamping entirely when `ctx.expanded?.()` is true. Registered in `primitive-names.ts` and `builtins.ts`.

4. **`Text.tsx` auto-clamp** — replaced the magic `max-width:320px` workaround with a real 4-line clamp for `body`/`caption` styles. `heading` and `mono` are unchanged. Clamp is suppressed when `ctx.expanded?.()` is true (expanded branch renders a plain `<span>`).

5. **`PgCanvasView.tsx`** — per-node `renderCtx` with `currentNodeId: () => nodeId` inside the `For` loop.

6. **`InspectorPanel.tsx`** — added `currentNodeId: () => id` and `expanded: () => true` to suppress clamping in the inspector.

7. **`deepLodMeasure.tsx`** — added `currentNodeId: () => nodeId` per node; `expanded` left unset with an explanatory comment.

8. **`primitives-reference.md`** — documented the `clamp` primitive so pipeline agents can discover and use it.

## Notes

- **rtp-statechart pack not in this repo.** `packages/core/packs/rtp-statechart.pack.json` doesn't exist here (it's in RankThePlanet). The plan's Step 4 pack audit is covered by the auto-clamp default — any `text caption` render will auto-clamp. Explicit `clamp` wrappers with higher line counts for `open`/`deep` renders should be added in that repo separately.

- **jsdom limitation for overflow detection.** In jsdom `scrollHeight === clientHeight === 0`, so the `overflowed` signal always starts `false`. Tests can't test the "click triggers inspect" happy path without mocking `scrollHeight`. The tests verify the wiring (no inspect call when not overflowed, correct CSS applied) rather than the detection itself.

- **Conditional `useOverflowInspect` call in `Text.tsx`.** The hook is only called when `isClampable && !ctx.expanded?.()`. This is valid in Solid.js (unlike React hooks), but a reviewer should note the conditional signal creation is intentional — headings and mono don't need overflow detection.

- **`expanded` is computed once at render-time**, not reactively tracked. This is intentional: `expanded` is a stable context property (always `true` in inspector, never set in canvas), so there's no reactive case to handle.

- **`PgCanvasView.tsx` per-node ctx is a plain object spread**, not a reactive wrapper. All signal functions from the shared `renderCtx` are copied by reference, so reactivity is preserved.

## Build & Test Output (last 30 lines)

```
packages/core test:  ✓ tests/render/fallback.test.ts (8 tests) 4ms
packages/core test:  Test Files  14 passed (14)
packages/core test:       Tests  231 passed (231)
packages/core test:    Start at  12:56:35
packages/core test:    Duration  4.18s (transform 477ms, setup 0ms, collect 934ms, tests 387ms, environment 4.24s, prepare 784ms)
packages/core test: Done
packages/client-next test$ vitest run
packages/client-next test:  RUN  v3.2.4 /home/saxon/code/github/saxonthune/agent-text-overflow-clamp/packages/client-next
packages/client-next test:  ✓ src/layers/__tests__/layerState.test.ts (3 tests) 4ms
packages/client-next test:  ✓ src/disclosure/__tests__/levelFromZoom.test.ts (7 tests) 3ms
packages/client-next test:  ✓ src/sources/__tests__/serverSources.test.ts (3 tests) 6ms
packages/client-next test:  ✓ tests/CanvasHostPackResolution.test.ts (6 tests) 4ms
packages/client-next test: stderr | src/pack/__tests__/siblingLoader.test.ts > loadAndRegisterSiblingPack — 404 → fallback, no throw > does not throw and leaves pack unregistered on 404 for an unknown pack
packages/client-next test: [siblingLoader] pack "test-pack" not found at /api/pack/workspace%2Fgraphs%2Ftest-pack.pack.json; falling back to unvalidated rendering
packages/client-next test: stderr | src/pack/__tests__/siblingLoader.test.ts > loadAndRegisterSiblingPack — malformed pack → fallback, no throw > does not throw when the pack JSON is malformed
packages/client-next test: [siblingLoader] pack "test-pack" is malformed: Error: parsePackJson: invalid JSON: Expected property name or '}' in JSON at position 2 (line 1 column 3)
packages/client-next test:     at parsePackJson (/home/saxon/code/github/saxonthune/agent-text-overflow-clamp/packages/core/src/pack/parsePackJson.ts:138:11)
packages/client-next test:     at loadAndRegisterSiblingPack [90m(/home/saxon/code/github/saxonthune/agent-text-overflow-clamp/packages/client-next/[39msrc/pack/siblingLoader.ts:80:12[90m)[39m
packages/client-next test: [90m    at processTicksAndRejections (node:internal/process/task_queues:105:5)[39m
packages/client-next test:     at [90m/home/saxon/code/github/saxonthune/agent-text-overflow-clamp/packages/client-next/[39msrc/pack/__tests__/siblingLoader.test.ts:128:5
packages/client-next test:     at file:///home/saxon/code/github/saxonthune/agent-text-overflow-clamp/node_modules/[4m.pnpm[24m/@vitest+runner@3.2.4/node_modules/[4m@vitest/runner[24m/dist/chunk-hooks.js:752:20
packages/client-next test:  ✓ src/pack/__tests__/siblingLoader.test.ts (11 tests) 43ms
packages/client-next test:  ✓ tests/PgCanvasView.test.ts (7 tests) 30ms
packages/client-next test:  ✓ src/__tests__/deepLodMeasure.test.ts (5 tests) 46ms
packages/client-next test:  ✓ src/inspector/__tests__/InspectorPanel.test.tsx (5 tests) 60ms
packages/client-next test:  Test Files  8 passed (8)
packages/client-next test:       Tests  47 passed (47)
packages/client-next test:    Start at  12:56:40
packages/client-next test:    Duration  2.15s (transform 1.36s, setup 0ms, collect 5.11s, tests 197ms, environment 3.29s, prepare 875ms)
packages/client-next test: Done
```
