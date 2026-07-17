# Arrange as Column: a layout command over a multi-Node selection (Phase B)

## Motivation

Phase B of the layout partition, building on `atlas-loose-canvas` (Phase A), which
established position intent (`NodePosition = auto | manual`), read stored positions
with tidy fallback, and persisted positions on drop. Phase B adds the first
**arrange command**: the user selects several Nodes, right-clicks, and picks
"Arrange as ▸ Column". The command computes a column layout for the selection and
**bakes** the result as `manual` positions (doc01.07.04 R27–R30).

The key architectural decision (from the layout design): an arrange command is a
pure `doc → doc` mutation that writes `manual` positions — NOT a persistent
constraint or live solver. "Column" is forgotten once baked; the Nodes are just
manually positioned afterward. This keeps the model flat until forces demand a
constraint system.

## Do NOT

- **Do NOT** introduce a constraint solver, a persistent "column" relationship, or
  any live re-layout. Arrange computes positions once and writes them as `manual`
  intent (Phase A's representation). It is a one-shot command.
- **Do NOT** enable the command for a selection whose Nodes span **different
  Containers** (different `parent`). Grey it out (R29).
- **Do NOT** build the sophisticated space-finding algorithm here. Ship a simple,
  predictable placement (see Plan step 3) and file the advanced version as a
  follow-up. Do not block this task on it.
- **Do NOT** change the Gesture machine, the pan filter, or Phase A's reader/persist
  paths. Reuse them.
- **Do NOT** move the camera on arrange (R23).

## Plan

### 1. Read the current selection in the context menu (`AtlasCanvas.tsx`)

`nodeContextMenu(nodeId)` builds the menu. Extend it to consult the current
selection (`canvasRef.getSelectedIds()` / the selection context). When 2+ Nodes are
selected, add an **"Arrange as"** submenu with a **"Column"** item (R28). Follow the
existing submenu pattern used for Color (`AtlasCanvas.tsx:242-259`).

- **Disable rule (R29):** if the selected Nodes do not all share the same `parent`,
  render "Column" disabled/greyed (a disabled `MenuItem` — check `MenuSchema`
  supports a disabled flag; if not, add minimal support in cactus chrome types, or
  render it non-actionable with muted styling).
- When 0–1 Nodes are selected, do not show "Arrange as".

### 2. The arrange command (`packages/client/src/apps/atlas/arrange.ts` — new)

```ts
export function arrangeAsColumn(doc: AtlasDocument, ids: string[]): AtlasDocument;
```

Pure `doc → doc`. Precondition (caller-guaranteed): all `ids` share one parent.
Compute a vertical stack of parent-relative positions for the selected Nodes and
write each via `setNode(doc, id, { x, y })` (Phase A's persist path), returning the
updated doc. Order the column by the Nodes' current vertical position (stable,
predictable). Column x = a shared left edge (e.g. the min current x of the
selection); spacing = node height + a gap constant.

### 3. Simple space-finding v1 (R30, minimal)

Place the column so it does not overlap **other** (non-selected) Nodes in the same
Container:

- Compute the bounding column rect at the anchor (min-x / top of selection).
- If it intersects any non-selected sibling's rect, shift the whole column right
  (by column width + gap) and retest, up to a small bounded number of tries; if no
  clear slot is found within the cap, place at the anchor anyway and `log`/accept
  the overlap (v1 does not guarantee zero overlap in a crowded Container).

This is deliberately dumb and bounded. The real algorithm is a follow-up.

### 4. Wire the action (`AtlasCanvas.tsx` `onAction`)

Add an `arrange.column` action: read the selected ids, call `arrangeAsColumn(doc,
ids)`, `dispatchDoc` the result. Guard again on same-parent (defense in depth).

### 5. Tests (`arrange.test.ts` — new)

- `arrangeAsColumn` stacks selected Nodes vertically at a shared x, ordered by
  current y, with the expected gap; returns `manual` positions on each.
- Given non-selected siblings occupying the anchor column, the result column is
  shifted to a non-overlapping slot (within the try cap).
- Selection spanning two parents is never passed in — but assert the menu-level
  same-parent predicate (extract it as a pure `sameParent(doc, ids): boolean`
  helper and test it).

## Files to Modify

- `packages/client/src/apps/atlas/arrange.ts` — new: `arrangeAsColumn`, `sameParent`.
- `packages/client/src/apps/atlas/AtlasCanvas.tsx` — "Arrange as ▸ Column" submenu (disabled when multi-Container), `arrange.column` action.
- `packages/cactus/src/chrome/types.ts` — only if a disabled `MenuItem` flag is missing and must be added.
- `packages/client/src/apps/atlas/arrange.test.ts` — new coverage.

## Verification

```bash
pnpm -C packages/cactus exec tsgo --noEmit
pnpm -C packages/client exec tsgo --noEmit
pnpm -C packages/client exec vitest run
```

## Out of Scope

- **The sophisticated space-finding algorithm** — packing a rearrangement into a
  Container's free space without overlap, expanding the Container when needed,
  handling dense Containers. File as `atlas-arrange-space-finding`.
- Other arrange options (row, grid, align, distribute) — each a later `doc → doc`
  command reusing this scaffolding.
- Any persistent/constraint-based "keep aligned" behavior.
- Undo/redo (separate task) — though arrange is a single `dispatchDoc`, so it lands
  as one history entry once history exists.

## Notes

- Reuse cactus layout primitives where natural (`gridLayout` can compute a single
  column); but a hand-rolled vertical stack is fine and clearer for v1.
- If `MenuSchema` lacks a disabled state, prefer adding a minimal `disabled?:
  boolean` to the `action` menu item over inventing a new item type.

## Surface after this phase

- `packages/client/src/apps/atlas/arrange.ts` exports
  `arrangeAsColumn(doc, ids): AtlasDocument` (pure; bakes `manual` positions) and
  `sameParent(doc, ids): boolean`.
- The Atlas node context menu shows "Arrange as ▸ Column" when 2+ Nodes are
  selected, disabled when they span different Containers (R28, R29).
- Choosing it stacks the selection into a column and persists `manual` positions,
  shifted to avoid overlapping non-selected siblings within a bounded try count
  (R27, R30 v1).
- Arrange is a one-shot `doc → doc` command, not a live constraint.
- Not built here: advanced space-finding, other arrange shapes, undo/redo.
