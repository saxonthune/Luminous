# Agent Result: atlas-drag-moves-subtree

date: 2026-07-17T13:55:16-04:00
session: completed
verification: passed
commits: 1
branch: chain-atlas-node-geometry_claude_atlas-drag-moves-subtree
surface deviations: none
turns: 24/200
cost: $0.7121560999999998/$10.00
uncommitted: none
session id: 7690638a-1195-41f5-8c37-fbd6eafee28a


## Summary

None.

## Commits

```
b539946 feat: drag on a container moves its whole subtree live
```

## Build & Test Output (last 30 lines)

```
 ✓ src/apps/atlas/__tests__/history.test.ts (7 tests) 6ms
 ✓ src/layers/__tests__/layerState.test.ts (3 tests) 6ms
 ✓ tests/CanvasHostPackResolution.test.ts (6 tests) 7ms
 ✓ src/ws/__tests__/watchClient.test.ts (5 tests) 4ms
 ✓ tests/staticSources.test.ts (6 tests) 8ms
stderr | src/pack/__tests__/siblingLoader.test.ts > loadAndRegisterSiblingPack — 404 → fallback, no throw > does not throw and leaves pack unregistered on 404 for an unknown pack
[siblingLoader] pack "test-pack" not found at /api/pack/workspace%2Fgraphs%2Ftest-pack.pack.json; falling back to unvalidated rendering

stderr | src/pack/__tests__/siblingLoader.test.ts > loadAndRegisterSiblingPack — malformed pack → fallback, no throw > does not throw when the pack JSON is malformed
[siblingLoader] sibling pack "test-pack" unusable, trying builtin: Error: parsePackJson: invalid JSON: Expected property name or '}' in JSON at position 2 (line 1 column 3)
    at parsePackJson (/home/saxon/code/github/saxonthune/agent-Luminous-atlas-drag-moves-subtree/packages/core/src/pack/parsePackJson.ts:138:11)
    at loadAndRegisterSiblingPack [90m(/home/saxon/code/github/saxonthune/agent-Luminous-atlas-drag-moves-subtree/packages/client/[39msrc/pack/siblingLoader.ts:77:20[90m)[39m
[90m    at processTicksAndRejections (node:internal/process/task_queues:104:5)[39m
    at [90m/home/saxon/code/github/saxonthune/agent-Luminous-atlas-drag-moves-subtree/packages/client/[39msrc/pack/__tests__/siblingLoader.test.ts:128:5
    at file:///home/saxon/code/github/saxonthune/agent-Luminous-atlas-drag-moves-subtree/node_modules/[4m.pnpm[24m/@vitest+runner@3.2.4/node_modules/[4m@vitest/runner[24m/dist/chunk-hooks.js:752:20
[siblingLoader] pack "test-pack" not found at /api/pack/workspace%2Fgraphs%2Ftest-pack.pack.json; falling back to unvalidated rendering

 ✓ src/pack/__tests__/siblingLoader.test.ts (11 tests) 61ms
 ✓ tests/matchGating.test.ts (9 tests) 4ms
 ✓ src/apps/atlas/__tests__/projection.test.ts (11 tests) 7ms
 ✓ src/apps/atlas/__tests__/arrange.test.ts (7 tests) 5ms
 ✓ tests/PgCanvasView.test.ts (9 tests) 40ms
 ✓ src/apps/atlas/__tests__/AtlasCanvas.test.ts (3 tests) 4ms
 ✓ src/__tests__/deepLodMeasure.test.ts (5 tests) 51ms
 ✓ src/inspector/__tests__/InspectorPanel.test.tsx (5 tests) 69ms

 Test Files  20 passed (20)
      Tests  164 passed (164)
   Start at  13:55:13
   Duration  2.91s (transform 3.49s, setup 0ms, collect 15.70s, tests 366ms, environment 10.79s, prepare 2.05s)
```
