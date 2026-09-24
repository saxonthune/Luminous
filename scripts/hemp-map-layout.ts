import { dagLayout, gridLayout, retainLayout } from "../packages/cactus/src/layout-public.ts";
import type { HempMap, MapItem, MapRect, FunctionInfo } from "../packages/core/src/hemp/index.ts";
import { mapItemSize } from "../packages/client/src/apps/hemp/mapPresentation.ts";

/** Project sizes; cactus owns packing and DAG algorithms. Existing anchors win. */
export function layoutHempMap(
  items: MapItem[],
  references: HempMap["references"],
  functions: Map<string, FunctionInfo>,
  previous?: HempMap,
) {
  const children = new Map<string, string[]>();
  for (const item of items)
    if (item.parent) {
      const list = children.get(item.parent) ?? [];
      list.push(item.id);
      children.set(item.parent, list);
    }
  const roots = items.filter((n) => !n.parent).map((n) => n.id);
  const packed = gridLayout(
    {
      rootIds: roots,
      childrenOf: children,
      edges: [],
      headerHeight: 100,
      headerHeights: new Map(
        items
          .filter((n) => functions.has(n.id))
          .map((n) => [n.id, mapItemSize(n, functions.get(n.id)).h]),
      ),
      headerWidths: new Map(items.map((n) => [n.id, mapItemSize(n, functions.get(n.id)).w])),
      nodeSizes: new Map(items.map((n) => [n.id, mapItemSize(n, functions.get(n.id))])),
    },
    { padding: 60, gap: 120 },
  );
  const rootOf = (id: string): string => {
    const item = byId.get(id)!;
    return item.parent ? rootOf(item.parent) : id;
  };
  const byId = new Map(items.map((n) => [n.id, n]));
  const rootEdges = new Map<string, { source: string; target: string }>();
  for (const e of references) {
    const from = rootOf(e.from),
      to = rootOf(e.to);
    if (from !== to) rootEdges.set(`${from}\0${to}`, { source: from, target: to });
  }
  const dag = dagLayout(
    roots.map((id) => ({ id, parentId: null, ...packed.sizes.get(id)! })),
    [...rootEdges.values()],
    { direction: "LR", verticalGap: 500 },
  );
  const layout: Record<string, MapRect> = {};
  const warnings: string[] = [];
  for (const item of items) {
    const size = packed.sizes.get(item.id)!;
    const position = item.parent ? packed.positions.get(item.id)! : dag.get(item.id)!;
    layout[item.id] = { ...position, width: size.w, height: size.h };
  }
  if (previous) {
    const retained = retainLayout(items, layout, previous.layout);
    if (retained.changed.length)
      warnings.push(
        "Saved anchors retained while content changed; --relayout repacks regions if they overlap.",
      );
    return { layout: retained.layout, warnings };
  }
  return { layout, warnings };
}
