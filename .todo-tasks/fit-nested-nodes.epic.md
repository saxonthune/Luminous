# Fit nested nodes — two-region layout (header + body)

## Motivation

After landing the `prim.contains` edge kind and nesting Beta over Parser/Evaluator/Cache in `.canvases/sample-primitives.graph.json`, both grid and ELK views render parents that do not actually enclose their children (Cache spills below Beta in grid view; Beta's right edge clips Cache in ELK view). The root cause is the layout's lack of correct inputs: it doesn't know the rendered sizes of leaves and doesn't reserve enough header space for parents' intrinsic content (BoxCard label + description).

The fix is the two-region model — every parent rect has a header region (its own intrinsic content) and a body region (packed children) — implemented in three unfolding steps so each step is independently testable and useful.

## Steps

- **01 — layout-wiring**: wire `sizeOf` (measured leaf rects from the canvas registry) and a constant `headerHeight` into `gridLayout` and `elkLayout` calls from `PgCanvasView`. Extend `gridLayout` to accept `sizeOf` (it doesn't today). This alone should make Beta visually contain all three children in both views.
- **02 — renderer-context**: add `hasChildren: (id) => boolean` to `RenderContext`; let `BoxCard` render compactly (no description, smaller padding) when the node is a container. Removes visual clutter.
- **03 — node-header-primitive**: add `<NodeHeader>` cactus primitive with its own `ResizeObserver` that registers measured header heights into the canvas context. `PgCanvasView` reads these per-parent and passes them to the layout instead of a global constant. Replaces the step-01 constant with real measurement.

## Order and dependencies

Strictly sequential: 01 → 02 → 03. Step 02 depends on `hasChildren` being available, but it doesn't depend on 01's output — both can technically land in either order, but 01 is the visible-bug unblocker. Step 03 supersedes the constant introduced in step 01 once it lands.

## Out of scope

- Per-side connection ports (`PortRail`).
- Manual user-resize gestures (`useNodeResize` is not currently wired in client-next; that's a separate task).
- ELK direction/layered routing changes — leave at current settings.
- Re-layout throttling beyond the basic "only re-run when measured sizes change" guard.
