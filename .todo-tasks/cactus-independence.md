# Cactus Independence: Inline Geometry, Zero Monorepo Dependencies

## Motivation

Cactus should be splittable into its own repo at any time. Today it's 95% there — the only monorepo coupling is `@carta/geometry` imports in two files (`containment.ts`, `containerOps.ts`). Inlining these ~8 functions/types into cactus eliminates the last cross-package dependency.

## Do NOT

- Touch anything outside `packages/web-client/src/cactus/` and its tests
- Modify `@carta/geometry` itself — other packages still use it via `@carta/schema`
- Add new dependencies — the inlined code is pure TypeScript with zero deps
- Change any public API signatures — cactus consumers should see no difference
- Reorganize or rename existing cactus files beyond what's needed for the inline

## Plan

### 1. Create `cactus/geometry.ts` with inlined functions

Create a new file `packages/web-client/src/cactus/geometry.ts` containing only the functions and types cactus actually uses:

**From `@carta/geometry` containment.ts:**
- `Rect` (interface)
- `ComputeBoundsOptions` (interface)
- `computeBounds` (function)
- `isPointInRect` (function)

**From `@carta/geometry` organizer-geometry.ts:**
- `Position` (interface)
- `Size` (interface)
- `NodeGeometry` (interface)
- `OrganizerLayoutConfig` (interface)
- `OrganizerFitResult` (interface)
- `DEFAULT_ORGANIZER_LAYOUT` (const)
- `toAbsolutePosition` (function)
- `toRelativePosition` (function)
- `computeOrganizerFit` (function)

Copy the implementations verbatim. Add a header comment: `/** Inlined from @carta/geometry — cactus has no monorepo dependencies. */`

### 2. Update `containment.ts` imports

In `packages/web-client/src/cactus/containment.ts`, change:
```ts
export { computeBounds, isPointInRect } from '@carta/geometry';
export type { Rect, ComputeBoundsOptions } from '@carta/geometry';
```
to:
```ts
export { computeBounds, isPointInRect } from './geometry.js';
export type { Rect, ComputeBoundsOptions } from './geometry.js';
```

### 3. Update `containerOps.ts` imports

In `packages/web-client/src/cactus/containerOps.ts`, change the `@carta/geometry` import to:
```ts
import {
  toAbsolutePosition,
  toRelativePosition,
  computeOrganizerFit,
  type NodeGeometry,
  type OrganizerLayoutConfig,
  type OrganizerFitResult,
  DEFAULT_ORGANIZER_LAYOUT,
} from './geometry.js';
```

### 4. Export geometry types from cactus barrel

In `packages/web-client/src/cactus/index.ts`, add:
```ts
export type { Rect, ComputeBoundsOptions, Position, Size, NodeGeometry, OrganizerLayoutConfig, OrganizerFitResult } from './geometry.js';
export { DEFAULT_ORGANIZER_LAYOUT } from './geometry.js';
```

This ensures any consumer that was getting these types through cactus re-exports still can.

### 5. Update test imports

In `packages/web-client/tests/integration/container-ops.test.ts` (line 9), change:
```ts
import { DEFAULT_ORGANIZER_LAYOUT, type NodeGeometry } from '@carta/geometry';
```
to import from cactus instead:
```ts
import { DEFAULT_ORGANIZER_LAYOUT, type NodeGeometry } from '../../src/cactus/index.js';
```

In `packages/web-client/tests/integration/layout-geometry.test.ts` (line 10), change:
```ts
import { toRelativePosition } from '@carta/geometry';
```
to:
```ts
import { toRelativePosition } from '../../src/cactus/geometry.js';
```

### 6. Verify no remaining `@carta/` imports in cactus

Grep `packages/web-client/src/cactus/` for any `@carta/` imports. There should be zero.

## Files to Modify

- `packages/web-client/src/cactus/geometry.ts` — **new file**, inlined geometry functions
- `packages/web-client/src/cactus/containment.ts` — update imports from `@carta/geometry` to `./geometry.js`
- `packages/web-client/src/cactus/containerOps.ts` — update imports from `@carta/geometry` to `./geometry.js`
- `packages/web-client/src/cactus/index.ts` — add geometry type re-exports
- `packages/web-client/tests/integration/container-ops.test.ts` — update test import
- `packages/web-client/tests/integration/layout-geometry.test.ts` — update test import

## Verification

- `grep -r "@carta/" packages/web-client/src/cactus/` returns zero results
- `pnpm --filter @carta/web-client run build` succeeds (TypeScript compiles)
- `pnpm --filter @carta/web-client run test` passes (existing tests still green)
- All exported types/functions from cactus barrel remain unchanged

## Out of Scope

- Extracting cactus into its own package.json or repo (future step)
- Modifying `@carta/geometry` or its other consumers
- The 3 feature upgrades (handle-less edges, universal nesting, note nodes) — see `cactus-upgrades`

## Notes

- The inlined functions are ~120 lines of pure coordinate math. No risk of divergence since cactus doesn't need the rest of geometry (flow layout, pin constraints, etc.)
- `@carta/schema` re-exports all of geometry (`export * from '@carta/geometry'`), so other packages are unaffected
