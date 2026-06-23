# Connected-edge highlight on selection

## Motivation

For N-tier / route-tracing canvases the key interaction is "click a node, see what it connects
to." Selection already exists (`useSelection`, `CanvasContext.selectedIds()`, selected nodes get an
outline in `NodeShell`) but nothing highlights connected edges — `EdgeLayer` doesn't read selection,
and edges render at a fixed opacity. This task makes edges incident to the selected node(s) stand
out by dimming the rest. 1-hop only; transitive route tracing is a separate follow-on.

## Do NOT

- Do NOT add fields to `EdgeDeclaration` or `EdgeStyling` (`types.ts`). Highlight is runtime-derived
  from selection, NOT authored styling — compute it in `EdgeLayer`, don't persist it on the edge.
- Do NOT make edges clickable/hoverable or selectable. Selection is driven from nodes only; edges
  stay non-interactive (the existing label-reveal onClick is unrelated — leave it).
- Do NOT dim or restyle nodes. Edges only (keeps this isolated to `EdgeLayer.tsx` and minimal).
- Do NOT implement multi-hop / transitive path tracing. Direct incidence only.
- Do NOT thread selection through new props from `Canvas.tsx` — `EdgeLayer` renders inside the
  `CanvasContext.Provider` (`Canvas.tsx:258,281,300`), so read it via `useCanvasContext()`.

## Plan

### 1. Pure incidence helper — `packages/cactus/src/EdgeLayer.tsx`

Add a tiny pure function (exported for testing) that classifies an edge's emphasis given the
selection set:

```ts
export type EdgeEmphasis = 'neutral' | 'incident' | 'dimmed';
export function edgeEmphasis(
  edge: { sourceId: string; targetId: string },
  selectedIds: ReadonlyArray<string>,
): EdgeEmphasis {
  if (selectedIds.length === 0) return 'neutral';
  return selectedIds.includes(edge.sourceId) || selectedIds.includes(edge.targetId)
    ? 'incident'
    : 'dimmed';
}
```

### 2. Read selection & modulate opacity — `packages/cactus/src/EdgeLayer.tsx`

- Call `const { selectedIds } = useCanvasContext();` at the top of `EdgeLayer` (mirror `NodeShell.tsx:19`).
- Per edge (inside the `For`), compute a reactive `emphasis = createMemo(() => edgeEmphasis(edge, selectedIds()))`.
  Derive an `opacity`: `neutral` → 1, `incident` → 1, `dimmed` → ~0.15 (use a named const
  `DIMMED_OPACITY = 0.15`).
- Apply the opacity to BOTH render layers so lines and labels dim together:
  - lines layer: set `opacity` on the `<line>` and the arrowhead `<path>` (lines 160-172).
  - labels layer: set `opacity` on the label `<rect>` background and `<text>` (lines 177-210).
  Apply via the SVG `opacity` attribute (or `style={{ opacity }}`) — do not touch the existing
  `stroke`/`fill`/`width` logic.
- Keep it fully reactive: when `selectedIds()` changes (including back to empty → all `neutral`),
  opacity recomputes. No selection → every edge at opacity 1 (current appearance unchanged).

### 3. Tests — `packages/cactus/tests/` (new `edgeEmphasis.test.ts`)

- Empty selection → every edge `neutral`.
- Selection containing an edge's `sourceId` → `incident`; containing its `targetId` → `incident`.
- Selection containing neither endpoint → `dimmed`.
- Multi-select: an edge incident to ANY selected node is `incident`.

(Unit-test the pure helper; do not attempt a DOM/opacity render test.)

## Files to Modify

- `packages/cactus/src/EdgeLayer.tsx` — `edgeEmphasis` helper, read `selectedIds()`, modulate opacity on lines/arrows/labels
- `packages/cactus/tests/edgeEmphasis.test.ts` — new unit tests for the helper

## Verification

```bash
pnpm --filter @luminous/cactus test
pnpm --filter @luminous/cactus typecheck
```

## Out of Scope

- Multi-hop / transitive route tracing (follow-on).
- Node dimming, edge interactivity, authored highlight styling.
- Any change outside `EdgeLayer.tsx` + its test.

## Notes

- `EdgeLayer` is rendered twice (layer `'lines'` and `'labels'`) — make sure the opacity logic
  applies in both passes so a dimmed edge dims its label too.
- `DIMMED_OPACITY = 0.15` is a starting value; fine to tune. Incident edges stay at full opacity
  (the contrast against dimmed neighbors is what does the work — no need to brighten/thicken).
- Companion task: [[container-layout-override-ui]].
