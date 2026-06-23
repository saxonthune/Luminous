# Canvas edge-render performance wins (large graphs)

## Motivation

A graph with ~773 nodes / 1642 edges renders unusably slowly on lower-powered
machines. Profiling the render path identified the dominant cost as **edge label
placement**, not node rendering. Four concrete, low-risk wins remove the
per-zoom-frame recompute, bound the overlap-scan constant factor, cut offscreen
SVG, and replace an O(roots) lookup. These are mitigations, not a rewrite — a
separate draft (`elk-driven-edge-label-placement`) tracks the full algorithm
swap and must not be pre-empted here.

## Do NOT

- Do NOT rewrite the label-placement algorithm or `routeEdges` / `chooseLabelAnchor`'s
  core geometry. These are bounded mitigations only. The full rework lives in the
  `elk-driven-edge-label-placement` draft.
- Do NOT change the visual output in the common case (zoom ~1, small/medium graphs).
  Label positions and edge appearance must stay effectively identical when culling
  and the node-scan gate are inactive.
- Do NOT add new dependencies or introduce a spatial-index library. The gate in
  win #2 is a simple node-count threshold, not a quadtree.
- Do NOT touch node rendering, layout algorithms (elk/mrtree), or the pack/graph schema.
- Do NOT change `routed`'s input set — keep routing over the full `props.edges`
  (it may rely on the full set for bundle grouping). Cull only at render + via the
  node-count gate.

## Plan

### 1. Win #1 — Decouple label anchors from zoom (`packages/cactus/src/EdgeLayer.tsx`)

The `labelAnchors` memo (lines ~110-130) reads `labelFontSize()` (line ~113), which
changes on **every zoom tick**, so the whole ~O(edges×nodes) anchor pass re-runs per
wheel notch. The font size is only used to estimate the label box for overlap dodging —
the chosen anchor *position* does not need to track zoom continuously.

- Add a module-level constant near `LABEL_CAP`:
  ```ts
  // Reference font size for label-overlap box estimation. Fixed so anchor
  // placement does not recompute on every zoom tick (positions are zoom-stable;
  // only the rendered label box scales with zoom, handled separately below).
  const LABEL_ANCHOR_REF_FS = 13;
  ```
- In the `labelAnchors` memo, replace `const fs = labelFontSize();` with
  `const fs = LABEL_ANCHOR_REF_FS;`. The memo must no longer call `labelFontSize()`.
- Leave the per-edge `labelBox` memo (lines ~151-159) and the rendered `<text>`
  `font-size` using the live `labelFontSize()` — the visible label still scales with zoom.

### 2. Win #2 — Gate the per-edge node-overlap scan (`packages/cactus/src/EdgeLayer.tsx`)

`chooseLabelAnchor` (lines ~55-91) loops over **all** node rects (line ~77) for each of
7 offset candidates per labeled edge — the largest constant factor. Above a node
threshold, skip the node-vs-label scan (keep the cheap label-vs-label scan so labels
still avoid each other).

- Add a module-level constant:
  ```ts
  // Above this node count, skip node-vs-label overlap testing — the per-edge
  // O(nodes) scan dominates on large graphs. Label-vs-label dodging still runs.
  const NODE_DODGE_MAX_NODES = 400;
  ```
- Inside the `for (const t of offsets)` loop, guard the node loop:
  ```ts
  if (rects.size <= NODE_DODGE_MAX_NODES) {
    for (const [id, r] of rects) {
      if (id === sourceId || id === targetId) continue;
      if (lx < r.x + r.w && lx + box.w > r.x && ly < r.y + r.h && ly + box.h > r.y) n++;
    }
  }
  ```
  Keep the existing `for (const p of placedLabels)` scan unconditional.

### 3. Win #3 — Viewport-cull edges (`EdgeLayer.tsx` + `Canvas.tsx`)

All edges render as SVG regardless of visibility. Filter to edges whose endpoint
bounding box intersects a padded viewport.

In `packages/cactus/src/Canvas.tsx`:
- Add a viewport accessor near the existing `getNodeRects` (after line ~122), computing
  the visible rect in **canvas coordinates** from `transform()` and `containerEl()`:
  ```ts
  // Visible viewport in canvas coords — used by EdgeLayer to cull offscreen edges.
  const edgeViewport = (): { x: number; y: number; w: number; h: number } | null => {
    const el = containerEl();
    const t = transform();
    if (!el) return null;
    return { x: -t.x / t.k, y: -t.y / t.k, w: el.clientWidth / t.k, h: el.clientHeight / t.k };
  };
  ```
- Pass `viewport={edgeViewport}` to **both** `<EdgeLayer>` instances (the `layer="lines"`
  one ~line 287 and the `layer="labels"` one ~line 306).

In `packages/cactus/src/EdgeLayer.tsx`:
- Add to `EdgeLayerProps`: `viewport?: () => { x: number; y: number; w: number; h: number } | null;`
- Add a `visibleEdges` memo (after `routed`) that returns `props.edges` filtered to edges
  whose routed-endpoint bbox overlaps the viewport padded by one viewport dimension on each
  side. If `props.viewport` is absent or returns null, return `props.edges` unchanged (no culling):
  ```ts
  const visibleEdges = createMemo(() => {
    const vp = props.viewport?.();
    if (!vp) return props.edges;
    const r = routed();
    const padX = vp.w, padY = vp.h; // 1 viewport of slack each side
    const minX = vp.x - padX, maxX = vp.x + vp.w + padX;
    const minY = vp.y - padY, maxY = vp.y + vp.h + padY;
    return props.edges.filter((edge) => {
      const pts = r.get(edge.id);
      if (!pts) return false;
      const eMinX = Math.min(pts.x1, pts.x2), eMaxX = Math.max(pts.x1, pts.x2);
      const eMinY = Math.min(pts.y1, pts.y2), eMaxY = Math.max(pts.y1, pts.y2);
      return eMaxX >= minX && eMinX <= maxX && eMaxY >= minY && eMinY <= maxY;
    });
  });
  ```
- Change `<For each={props.edges}>` (line ~144) to `<For each={visibleEdges()}>`.
- Leave `labelAnchors` and `revealedPopover` iterating `props.edges` — they are bounded by
  win #2 and `revealedPopover` must still resolve a clicked edge by id.

### 4. Win #4 — O(1) root index for section color (`types.ts` + `graph.ts` + `PgCanvasView.tsx`)

`sectionColorOf` (PgCanvasView.tsx ~line 221) does `ct.rootIds.indexOf(ancestor)` per node
render — O(roots) each. The palette needs the root's **ordinal**, so a `Set.has` is not
enough; add a precomputed id→index map.

- `packages/core/src/types.ts` — in `ContainmentTree` (after `rootIds`, line ~189), add:
  ```ts
  /** Root id → its index in `rootIds`, for O(1) palette lookup. */
  rootIndex: ReadonlyMap<NodeId, number>;
  ```
- `packages/core/src/graph.ts` — at the return (lines ~145-147), build and include it:
  ```ts
  const rootIds = spatialNodeIds.filter((id) => !parentOf.has(id));
  const rootIndex = new Map(rootIds.map((id, i) => [id, i] as const));

  return { rootIds, rootIndex, childrenOf, parentOf, warnings };
  ```
- `packages/client-next/src/PgCanvasView.tsx` — replace the `indexOf` block (line ~221):
  ```ts
  const idx = ct.rootIndex.get(ancestor);
  return idx === undefined ? undefined : PALETTE[idx % PALETTE.length];
  ```
- Grep for any other place constructing a `ContainmentTree` literal (tests/fixtures) and add
  `rootIndex` there too, or the type will not compile.

## Files to Modify

- `packages/cactus/src/EdgeLayer.tsx` — wins #1, #2, #3 (constants, fs decouple, node-scan gate, viewport prop + `visibleEdges` memo + `<For>` source)
- `packages/cactus/src/Canvas.tsx` — win #3 (`edgeViewport` accessor; pass `viewport` to both EdgeLayer instances)
- `packages/core/src/types.ts` — win #4 (`rootIndex` field on `ContainmentTree`)
- `packages/core/src/graph.ts` — win #4 (build `rootIndex`)
- `packages/client-next/src/PgCanvasView.tsx` — win #4 (use `rootIndex`)
- Any test/fixture that builds a `ContainmentTree` literal — add `rootIndex` (search first)

## Verification

```bash
pnpm -r typecheck
pnpm -r build
pnpm -r test
```

All three must pass. The `rootIndex` field is the only type-surface change — a failing
typecheck most likely means a `ContainmentTree` literal somewhere needs the new field.

## Out of Scope

- The full ELK-driven label placement rework (`elk-driven-edge-label-placement` draft).
- Node-level viewport virtualization (only edges are culled here).
- Memoizing `evaluateContainment` / projection across the two call sites.
- Replacing the JSON.stringify content key in `deepLodMeasure`.

## Notes

- Culling uses an endpoint **bounding-box** test with a full extra viewport of padding, so
  long edges crossing the viewport with both endpoints offscreen are retained (their bbox
  still overlaps). Verify visually that edges do not pop in/out at the screen border.
- Win #1 makes label anchors zoom-stable: positions are computed at a fixed reference font
  size while the rendered glyph still scales. A tiny shift in dodge behavior vs. the old
  zoom-coupled estimate is expected and acceptable.
- Win #2's gate means very large graphs (>400 nodes) keep label-vs-label dodging but not
  node-avoidance — an intentional graceful degradation.
```
