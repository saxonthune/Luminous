# Atlas edge operations: label-less edges, add/remove, and bisection

## Motivation

`@luminous/core/atlas` has node operations (`addNode`, `setNode`, `removeNode`,
`reparent`, `applyAtlasBatch`) but **no edge operations** and no edge `AtlasAction`.
Edges are parsed, serialized, and cascade-removed with their nodes, but nothing can
*create* one. This blocks authoring edges programmatically (the MCP tool group) and
in the UI.

Design decision (settled with the user): **Edges carry no label.** An `AtlasEdge`
is just `{from, to}`. Where an edge needs explanation, the user **bisects** it —
inserts a Node between the two ends (`A → B` becomes `A → N → B`), and N carries the
explanation as its Content (doc01.07.03 Bisection; doc01.07.04 R31–R32).

## Do NOT

- **Do NOT** keep or add edge labels. Remove `label` from `AtlasEdge` and stop
  writing it. Parsing must **tolerate** a legacy `label` field (existing docs like
  braincrawl have some) by ignoring it, not erroring.
- **Do NOT** touch cactus's `EdgeLayer` or its label support — other apps
  (Dataflow) still use edge labels. This change is Atlas-scoped: only Atlas's
  `toEdgeDeclarations` stops passing `labelText`.
- **Do NOT** make `bisectEdge` a monolithic opaque action. Express bisection as a
  batch of primitive `AtlasAction`s so it flows through `applyAtlasBatch`, the MCP
  batch, and undo/redo inversion unchanged.
- **Do NOT** add an edge `id`. Address edges by the `(from, to)` pair; `addEdge`
  is idempotent (no-op if the pair exists), `removeEdge` removes that pair. With no
  labels, a duplicate edge between a pair is degenerate.

## Plan

### 1. Label-less edge type and (de)serialization (`types.ts`, `document.ts`)

- `AtlasEdge = { from: string; to: string }` (drop `label`).
- `parseEdge` (`document.ts:110`): read `from`/`to`, **ignore** any `label` key.
- `serializeEdge` (`document.ts:248`): emit only `from`/`to`.

### 2. Edge operations (`operations.ts`)

```ts
export function addEdge(doc, from: string, to: string): AtlasResult;      // idempotent
export function removeEdge(doc, from: string, to: string): AtlasResult;   // removes the pair
export function buildBisectActions(
  doc, edge: { from: string; to: string }, newNode: { id: string; name?: string; content?: AtlasContent; x?: number; y?: number; parent?: string }
): AtlasAction[];
```

- `addEdge`/`removeEdge` validate that `from`/`to` exist (mirror `addNode`'s guards).
- `buildBisectActions` returns
  `[{type:'removeEdge',from,to}, {type:'addNode',id,...}, {type:'addEdge',from,to:id}, {type:'addEdge',from:id,to}]`
  — a pure list, applied by the caller via `applyAtlasBatch`.

### 3. Edge actions in the union and reducer (`types.ts`, `operations.ts`)

Add `AddEdgeAction { type:'addEdge'; from; to }` and `RemoveEdgeAction {
type:'removeEdge'; from; to }` to `AtlasAction`. Handle both in `applyAtlasBatch`
(`operations.ts:164`), dispatching to `addEdge`/`removeEdge`.

### 4. Inversion (`history.ts`)

In `invertAtlasAction`: `addEdge`→`removeEdge` (same pair), `removeEdge`→`addEdge`.
This makes bisection fully undoable. As a knock-on it now makes a user-initiated
`removeNode` invertible too (its cascaded edges can be re-added) — **note this in a
comment but keep `removeNode` inversion out of scope here** (no delete-Node UI yet).

### 5. Atlas projection stops passing labels (`projection.ts`)

`toEdgeDeclarations` (`projection.ts:45`): drop `labelText`. Edges render bare.

### 6. Barrel + skill

Export `addEdge`, `removeEdge`, `buildBisectActions`, and the new action types from
`index.ts`. Update `.claude/skills/luminous-*` + any atlas schema mirror for the
edge shape and new actions (CLAUDE.md schema-change rule).

### 7. Tests (`operations.test.ts`, `history.test.ts`, `document.test.ts`)

- `addEdge` idempotent; validates endpoints; `removeEdge` removes the pair.
- `buildBisectActions` + `applyAtlasBatch` turns `A→B` into `A→N→B` with N present.
- Inversion round-trips `addEdge`/`removeEdge`, and a bisect batch inverts back to
  the original single edge with N gone.
- Parse ignores a legacy `label`; serialize omits it.

## Files to Modify

- `packages/core/src/atlas/types.ts` — label-less `AtlasEdge`; edge actions.
- `packages/core/src/atlas/document.ts` — parse/serialize edges without label.
- `packages/core/src/atlas/operations.ts` — `addEdge`, `removeEdge`, `buildBisectActions`, batch handling.
- `packages/core/src/atlas/history.ts` — edge-action inversion.
- `packages/core/src/atlas/index.ts` — exports.
- `packages/client/src/apps/atlas/projection.ts` — drop `labelText`.
- Atlas schema mirror / `.claude/skills/` — edge shape + actions.
- `packages/core/src/atlas/{operations,history,document}.test.ts` — coverage.

## Verification

```bash
pnpm -C packages/core exec tsgo --noEmit
pnpm -C packages/client exec tsgo --noEmit
pnpm -C packages/core exec vitest run
pnpm -C packages/client exec vitest run
```

## Out of Scope

- The MCP atlas tool group — next phase (`atlas-mcp-tool-group`).
- The bisect UI (edge right-click → Bisect) — a separate client task.
- Inverting user-initiated `removeNode` (now possible, still deferred — no delete UI).
- Removing cactus `EdgeLayer` label support (other apps use it).

## Surface after this phase

- `@luminous/core/atlas` exports `addEdge(doc, from, to)`, `removeEdge(doc, from,
  to)` (both `AtlasResult`, edges keyed by `(from,to)`, `addEdge` idempotent), and
  `buildBisectActions(doc, edge, newNode): AtlasAction[]`.
- `AtlasAction` includes `AddEdgeAction`/`RemoveEdgeAction`; `applyAtlasBatch`
  applies them; `invertAtlasAction` inverts them (bisection is one undoable step).
- `AtlasEdge` is `{from, to}` — no label; parse tolerates legacy `label`, serialize
  omits it; Atlas renders edges bare.
- Not built: MCP tool group, bisect UI, `removeNode` inversion, cactus label removal.
