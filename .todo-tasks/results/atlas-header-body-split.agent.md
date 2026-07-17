# Agent Result: atlas-header-body-split

date: 2026-07-17T14:00:58-04:00
session: completed
verification: passed
commits: 1
branch: chain-atlas-node-geometry_claude_atlas-header-body-split
surface deviations: none
turns: 53/200
cost: $2.384268500000001/$10.00
uncommitted: none
session id: fb7971d6-08d1-45aa-902d-51d8e318f339


## Summary

None.

## Commits

```
f2d2ff6 feat: atlas container header band / child area split
```

## Build & Test Output (last 30 lines)

```
 ✓ src/ws/__tests__/watchClient.test.ts (5 tests) 3ms
 ✓ src/disclosure/__tests__/levelFromZoom.test.ts (7 tests) 5ms
 ✓ tests/staticSources.test.ts (6 tests) 6ms
 ✓ tests/matchGating.test.ts (9 tests) 5ms
stderr | src/pack/__tests__/siblingLoader.test.ts > loadAndRegisterSiblingPack — 404 → fallback, no throw > does not throw and leaves pack unregistered on 404 for an unknown pack
[siblingLoader] pack "test-pack" not found at /api/pack/workspace%2Fgraphs%2Ftest-pack.pack.json; falling back to unvalidated rendering

stderr | src/pack/__tests__/siblingLoader.test.ts > loadAndRegisterSiblingPack — malformed pack → fallback, no throw > does not throw when the pack JSON is malformed
[siblingLoader] sibling pack "test-pack" unusable, trying builtin: Error: parsePackJson: invalid JSON: Expected property name or '}' in JSON at position 2 (line 1 column 3)
    at parsePackJson (/home/saxon/code/github/saxonthune/agent-Luminous-atlas-header-body-split/packages/core/src/pack/parsePackJson.ts:138:11)
    at loadAndRegisterSiblingPack [90m(/home/saxon/code/github/saxonthune/agent-Luminous-atlas-header-body-split/packages/client/[39msrc/pack/siblingLoader.ts:77:20[90m)[39m
[90m    at processTicksAndRejections (node:internal/process/task_queues:104:5)[39m
    at [90m/home/saxon/code/github/saxonthune/agent-Luminous-atlas-header-body-split/packages/client/[39msrc/pack/__tests__/siblingLoader.test.ts:128:5
    at file:///home/saxon/code/github/saxonthune/agent-Luminous-atlas-header-body-split/node_modules/[4m.pnpm[24m/@vitest+runner@3.2.4/node_modules/[4m@vitest/runner[24m/dist/chunk-hooks.js:752:20
[siblingLoader] pack "test-pack" not found at /api/pack/workspace%2Fgraphs%2Ftest-pack.pack.json; falling back to unvalidated rendering

 ✓ src/pack/__tests__/siblingLoader.test.ts (11 tests) 46ms
 ✓ tests/CanvasHostPackResolution.test.ts (6 tests) 6ms
 ✓ src/apps/atlas/__tests__/arrange.test.ts (8 tests) 5ms
 ✓ src/apps/atlas/__tests__/mutations.test.ts (30 tests) 13ms
 ✓ src/apps/atlas/__tests__/projection.test.ts (14 tests) 12ms
 ✓ src/apps/atlas/__tests__/AtlasCanvas.test.ts (3 tests) 3ms
 ✓ tests/PgCanvasView.test.ts (9 tests) 34ms
 ✓ src/__tests__/deepLodMeasure.test.ts (5 tests) 63ms
 ✓ src/inspector/__tests__/InspectorPanel.test.tsx (5 tests) 65ms

 Test Files  20 passed (20)
      Tests  169 passed (169)
   Start at  14:00:56
   Duration  2.73s (transform 3.20s, setup 0ms, collect 15.44s, tests 354ms, environment 10.27s, prepare 1.87s)
```
