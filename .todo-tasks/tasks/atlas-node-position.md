# Atlas node position: add x/y to the document format

## Motivation

Atlas positions are computed by `layoutAtlas` on every render and discarded. A
user's drag survives only until the next document change. Atlas is authored, not
regenerated (doc01.07.01) — a hand-placed Node is authored data and belongs in the
document.

This task adds the fields and nothing else. **Nothing reads them yet.** The next
task makes `layoutAtlas` and the drag path consume them; keeping the format change
separate keeps that task's diff about behavior rather than about parsing.

Approved decisions for this task:

- **Parent-relative frame.** A Node's `x`/`y` is an offset from its parent's
  origin. A root Node's `x`/`y` is canvas-absolute. This matches what `tidyLayout`
  already emits (`tidyLayout.ts:141` positions children from `padding`, not from 0)
  and what the renderer already folds via `resolveAbsolutePositionByParentOf`.
- **Optional.** `x?: number; y?: number`. A Node with no position is *unplaced* —
  the state a newly added Node is in before anything places it.
- **No version bump.** `v` stays `1`. Nothing consumes the format outside this
  repo.

## Do NOT

- **Do NOT bump `v`.** It stays `1`. Do not add a migration, a version guard, or a
  compatibility branch. Atlas has no consumers beyond this repo's two fixtures.
- **Do NOT make anything read `x`/`y`.** `packages/client/src/apps/atlas/layout.ts`
  keeps calling `tidyLayout` and keeps ignoring the document's positions. The drag
  path keeps discarding its override. This task ends with fields that round-trip
  and nothing else. **Do not "finish the job" — the next task does.**
- **Do NOT touch `packages/client/src/apps/atlas/layout.ts`.**
- **Do NOT add `w` or `h`.** Authored sizes are a separate change with a separate
  cost — `tidyLayout:152` derives every container's size from its children and
  cannot express an authored one. Out of scope. (R5 depends on that; R5 stays
  unimplemented.)
- **Do NOT add rebasing to `reparent`.** A parent-relative coordinate must be
  rebased on reparent or the Node jumps, but nothing reads coordinates yet so
  nothing can jump. See Notes — it is the next task's first obligation.
- **Do NOT add glossary terms.** `.rhidoc/01-product/07-atlas/03-glossary.md`'s
  `## Layout` section is an approval-pending stub. Leave it alone. Vocabulary is
  approved by the human, not invented here.
- **Do NOT rewrite the fixtures' nodes.** The fields are optional; existing
  fixtures stay valid unchanged. See Plan step 4 for the one small addition.

## Plan

### 1. Types — `packages/core/src/atlas/types.ts`

Add to `AtlasNode` (currently lines 7-12):

```ts
export interface AtlasNode {
  id: string;
  name: string;
  parent?: string;
  content?: AtlasContent;
  x?: number;
  y?: number;
}
```

The frame is not visible from `x?: number`, so it needs a doc comment on the
fields — an offset from the parent's origin, canvas-absolute for a root Node.
State the invariant; do not restate the type.

Also extend `SetNodeAction` (lines 34-39) with optional `x` and `y` so a position
is writable through the existing action union. `AddNodeAction` takes them too — an
agent adding a Node may know where it goes.

### 2. Parser — `packages/core/src/atlas/document.ts`

- `NODE_FIELDS` (line 12): add `'x'` and `'y'`.
- `parseNode` (lines 42-72): validate each of `x`/`y` when present, following the
  existing `parent` branch's shape (lines 58-61) — accumulate an issue, set
  `ok = false`, and copy onto the returned node only when defined.
- **Reject non-finite numbers.** `typeof NaN === 'number'` and JSON's `1e999`
  parses to `Infinity`, so a bare `typeof` check passes both. Use
  `Number.isFinite`. A non-finite coordinate poisons every downstream sum.
- **`x` and `y` must appear together.** A Node with one and not the other is a
  half-position and means nothing; reject it with an issue naming both fields.
- `serializeNode` (lines 200-205): emit `x` and `y` when defined, following the
  existing `parent`/`content` conditional-copy shape.

Everything else in the parser — unknown-field rejection, duplicate ids, unknown
parent, `parentCycleIssues`, edge endpoint checks, all-issues accumulation — is
unchanged.

### 3. Operations — `packages/core/src/atlas/operations.ts`

`setNode` and `addNode` carry `x`/`y` through to the node. This is plumbing, not
logic: no rebasing, no defaulting, no placement rule. Setting a position to
`undefined` clears it, matching how `content` already clears.

Leave `reparent` alone.

### 4. Fixtures

Fixtures stay as they are — the fields are optional and every existing node is
valid unchanged.

Add positions to **one small subtree** of `.canvases/braincrawl.atlas.json` (a
container and its children, three or four nodes) purely so the round-trip is
exercised against a real file. Nothing renders them differently; this is parser
coverage, not layout.

### 5. Tests — `packages/core/tests/atlas/`

`document.test.ts`:
- round-trip a node with `x`/`y`, and one without — both valid
- `x` without `y` (and `y` without `x`) is an issue naming both
- a non-number `x` is an issue
- **`NaN` and `Infinity` are issues** — cover `1e999` in the raw JSON text, since
  that is how `Infinity` actually arrives through `JSON.parse`
- serializing a node with no position omits both keys rather than emitting `null`
- `examples.test.ts` should need no change — it parses the real fixtures and must
  still pass

`operations.test.ts`:
- `setNode` sets a position, and clears it with `undefined`
- `addNode` carries a position
- a `setNode` carrying only `name` leaves an existing position untouched

## Files to Modify

- `packages/core/src/atlas/types.ts` — `x`/`y` on `AtlasNode`, `SetNodeAction`, `AddNodeAction`
- `packages/core/src/atlas/document.ts` — parse, validate, serialize
- `packages/core/src/atlas/operations.ts` — carry `x`/`y` through `setNode`/`addNode`
- `.canvases/braincrawl.atlas.json` — positions on one small subtree
- `packages/core/tests/atlas/document.test.ts` — the cases above
- `packages/core/tests/atlas/operations.test.ts` — the cases above

## Verification

```bash
just typecheck
pnpm -C packages/core exec vitest run tests/atlas
pnpm -C packages/client exec vitest run src/apps/atlas
just lint
just build
```

## Out of Scope

- Reading `x`/`y` anywhere — `layout.ts`, the drag path, the renderer
- Rebasing coordinates on reparent
- `w`/`h` and authored container sizes; R5
- Placement of new Nodes
- Layout as a scoped command, pinning, relations, MCP tools

## Notes

- **The unplaced case is deliberate.** A Node with no position draws at its
  parent's origin once positions are consumed, so unplaced Nodes will pile up and
  overlap. That is accepted for now — it makes "nothing places new Nodes yet" a
  visible gap rather than a hidden fallback.
- **Rebasing on reparent is the next task's first obligation.** Parent-relative
  means a reparent must recompute the coordinate against the new parent
  (`new_local = old_absolute - new_parent_absolute`) or the Node jumps on drop.
  It is deliberately absent here because nothing reads coordinates yet, so the bug
  cannot manifest. Do not add it; do not leave a TODO for it — this note is the
  record.
- **`x`/`y` both-or-neither is a decision, not an inherited rule.** A half-position
  is meaningless, and rejecting it at the parser keeps every consumer from having
  to ask. If a reviewer wants independently optional axes, this is the line to
  argue with.
- The parser's existing style is hand-rolled validation with strict unknown-field
  rejection and all-issues accumulation — no schema library. Follow it exactly
  rather than introducing a validator.

## Surface after this phase

- `AtlasNode` is `{ id, name, parent?, content?, x?, y? }`. `x` and `y` are
  parent-relative offsets, canvas-absolute for a root Node, and must appear
  together or not at all.
- The parser accepts, validates, and round-trips `x`/`y`; it rejects a half
  position, a non-number, and a non-finite number including `1e999` → `Infinity`.
  `serializeAtlasDocument` omits both keys for an unplaced Node.
- `SetNodeAction` and `AddNodeAction` carry optional `x`/`y`; `setNode` clears a
  position when passed `undefined`. `reparent` is unchanged and does not rebase.
- `AtlasDocument` is still `{ v: 1, nodes, edges }` — `v` is unchanged. `AtlasEdge`
  is still `{ from, to, label? }`.
- One small subtree of `.canvases/braincrawl.atlas.json` carries positions; every
  other node is unplaced and unchanged.
- Negative space: **nothing reads `x`/`y`.** `layout.ts` still calls `tidyLayout`
  and still ignores the document's positions; a drag still discards its override on
  drop. No `w`/`h`, no authored container sizes, R5 still unimplemented. No
  reparent rebasing. No glossary changes — the `## Layout` stub is untouched. No
  pinning, no relations, no MCP tools. Dataflow and Canvas unchanged.
