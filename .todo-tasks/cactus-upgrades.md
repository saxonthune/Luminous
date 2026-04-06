# Cactus Engine: Handle-Optional Connections

## Motivation

The cactus canvas engine requires handle IDs on both source and target for edge connections. For the unfolding architecture (PDR doc01.03), we need freeform node-to-node connections where either end can omit a handle (drag from node body to node body). This is the one engine-level change needed — domain features (nesting, note nodes) will be built in `client-next`.

## Do NOT

- Touch anything outside `packages/web-client/src/cactus/` and its tests
- Change the existing ConnectionHandle behavior for typed handles — existing port-based connections must continue working identically
- Add domain-level changes (no MapV2, no organizerLogic, no new node types)
- Change the hit-testing mechanism (`document.elementsFromPoint` + data attributes) — just relax what's required
- Remove or rename existing exported types — extend them with optional fields

## Plan

### 1. Update connection types to allow null handles

In `packages/web-client/src/cactus/useConnectionDrag.ts`:

**`ConnectionDragState` (lines 3-12):** Change `sourceHandle: string` to `sourceHandle: string | null`.

**`UseConnectionDragOptions` (lines 14-29):** In both `onConnect` and `isValidConnection` callback signatures, change `sourceHandle` and `targetHandle` from `string` to `string | null`.

**`UseConnectionDragResult` (lines 31-34):** Change `startConnection` signature from `(sourceNodeId: string, sourceHandle: string, ...)` to `(sourceNodeId: string, sourceHandle: string | null, ...)`.

### 2. Update startConnection to accept null sourceHandle

In the same file, `startConnection` callback (line 59-60): Change parameter type from `sourceHandle: string` to `sourceHandle: string | null`. The rest of the function body works unchanged — it just stores `sourceHandle` in state.

### 3. Relax target hit-test to allow missing handle ID

In the same file, `handlePointerUp` (lines 93-129):

Change lines 106-112 from:
```typescript
if (targetNodeId && targetHandleId) {
  const connection = {
    source: sourceNodeId,
    sourceHandle,
    target: targetNodeId,
    targetHandle: targetHandleId,
  };
```

To:
```typescript
if (targetNodeId) {
  const connection = {
    source: sourceNodeId,
    sourceHandle,
    target: targetNodeId,
    targetHandle: targetHandleId ?? null,
  };
```

This allows connections where the target element has `data-connection-target` and `data-node-id` but no `data-handle-id`.

### 4. Update Canvas.tsx types

In `packages/web-client/src/cactus/Canvas.tsx`:

**`ConnectionPreviewCoords` (lines 10-19):** Change `sourceHandle: string` to `sourceHandle: string | null`.

**`CanvasProps.connectionDrag` (lines 25-38):** Update both `onConnect` and `isValidConnection` callback types — change `sourceHandle` and `targetHandle` from `string` to `string | null`.

### 5. Update CanvasContext.ts types

In `packages/web-client/src/cactus/CanvasContext.ts`:

**Line 11:** Change `startConnection` signature from `(nodeId: string, handleId: string, ...)` to `(nodeId: string, handleId: string | null, ...)`.

### 6. Update ConnectionHandle to support node-body mode

In `packages/web-client/src/cactus/ConnectionHandle.tsx`:

Make `id` optional in `ConnectionHandleProps` (line 5): `id?: string`.

**Source mode (lines 24-34):** When `onStartConnection` is called, pass `id ?? null` instead of `id`:
```typescript
onStartConnection(nodeId, id ?? null, rect.right, rect.top + rect.height / 2);
```

**Target mode data attributes (lines 37-46):** When `id` is provided, emit all three attributes as today. When `id` is undefined, emit only `data-connection-target` and `data-node-id` (omit `data-handle-id`):
```typescript
const dataAttributes =
  type === 'target'
    ? {
        'data-connection-target': 'true',
        'data-node-id': nodeId,
        ...(id ? { 'data-handle-id': id } : {}),
      }
    : {
        'data-no-pan': 'true',
      };
```

### 7. Update barrel exports

In `packages/web-client/src/cactus/index.ts`: No changes needed — the types are already exported via their source files. The `string | null` change propagates automatically.

### 8. Update existing tests

In `packages/web-client/tests/integration/cactus-components.test.tsx`:

Existing tests pass `id="body"` or `id="E"` — these should continue to work unchanged since `id` is now optional, not removed.

Add new tests:

- **"target without id omits data-handle-id"**: Render `<ConnectionHandle type="target" nodeId="node-1" />` (no `id`). Assert `data-connection-target` is `"true"`, `data-node-id` is `"node-1"`, and `data-handle-id` is null.

- **"source without id calls onStartConnection with null handle"**: Render `<ConnectionHandle type="source" nodeId="node-1" onStartConnection={spy} />`. Simulate pointer-down. Assert spy was called with `("node-1", null, ...)`.

## Files to Modify

- `packages/web-client/src/cactus/useConnectionDrag.ts` — nullable handle types in interfaces + relaxed hit-test
- `packages/web-client/src/cactus/Canvas.tsx` — nullable handle types in ConnectionPreviewCoords and CanvasProps
- `packages/web-client/src/cactus/CanvasContext.ts` — nullable handleId in startConnection signature
- `packages/web-client/src/cactus/ConnectionHandle.tsx` — optional `id` prop, conditional data-handle-id attribute
- `packages/web-client/tests/integration/cactus-components.test.tsx` — add 2 new tests for handle-optional behavior

## Verification

- `pnpm --filter @carta/web-client run build` succeeds (TypeScript compiles with all nullable types)
- `pnpm --filter @carta/web-client run test` passes (all existing tests green + 2 new tests)
- Existing ConnectionHandle tests with explicit `id` still pass (backward compatible)
- `grep -r "sourceHandle: string[^|]" packages/web-client/src/cactus/` returns zero hits (all signatures updated)

## Out of Scope

- Domain-layer changes (MapV2, organizerLogic, connectionLogic)
- Note node rendering
- Universal nesting policy
- New node types
- Edge rendering changes for handle-less edges (visual — domain layer)

## Notes

- This is purely a type-level + hit-test relaxation. No new rendering, no new DOM elements, no new hooks.
- Consumer code (MapV2) that passes `sourceHandle: string` will still compile — `string` is assignable to `string | null`.
- The `ConnectionHandle` component with `id` omitted is how `client-next` will implement node-body connection targets.
