# Agent Result: gesture-machine-node-drag

date: 2026-07-17T12:12:59-04:00
session: completed
verification: passed
commits: 2
branch: feat260713_claude_gesture-machine-node-drag
surface deviations: none
turns: 44/200
cost: $1.8115474/$10.00
uncommitted: none
session id: e87e4b99-d698-4ed8-964d-9e2191f89d55


## Summary

None.

## Commits

```
a6a3ebf fix: remove unused var flagged by tsgo in useGesture test
0c2d522 feat: gesture state machine, route Atlas node drag through it
```

## Build & Test Output (last 30 lines)

```
[cactus] perf decline: factor=0.9

stderr | tests/createPerformanceMonitor.test.ts > createPerformanceMonitor > incline detection — sustained high FPS increases factor
[cactus] perf incline: factor=0.6

stderr | tests/createPerformanceMonitor.test.ts > createPerformanceMonitor > reset() returns factor to initialFactor and clears history
[cactus] perf decline: factor=0.9

stderr | tests/createPerformanceMonitor.test.ts > createPerformanceMonitor > flipflop detection — stabilizes factor after oscillations
[cactus] perf incline: factor=0.6
[cactus] perf decline: factor=0.5
[cactus] perf incline: factor=0.6
[cactus] perf stabilized at factor=0.6 after 2 flipflops

 ✓ tests/createPerformanceMonitor.test.ts (11 tests) 7ms
 ✓ tests/useViewport.test.tsx (7 tests) 5ms
 ✓ tests/compositeLayout.test.ts (5 tests) 4ms
 ✓ tests/hotkeys.test.ts (10 tests) 3ms
 ✓ tests/tidyLayout.test.ts (6 tests) 4ms
 ✓ tests/dagLayout.test.ts (4 tests) 5ms
 ✓ tests/edgeRouting.test.ts (8 tests) 4ms
 ✓ tests/useSelection.test.ts (4 tests) 3ms
 ✓ tests/layoutOverride.test.ts (5 tests) 3ms
 ✓ tests/cactus-themes.test.ts (2 tests) 2ms
 ✓ tests/edgeEmphasis.test.ts (6 tests) 2ms

 Test Files  24 passed (24)
      Tests  194 passed (194)
   Start at  12:12:52
   Duration  6.86s (transform 1.11s, setup 0ms, collect 2.00s, tests 890ms, environment 6.78s, prepare 1.29s)
```
