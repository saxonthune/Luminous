import {
  functionParts,
  type HempDocument,
  type FunctionInfo,
  type MapItem,
} from "../packages/core/src/hemp/index.ts";

/** Semantic inventory -> transportable item facts. No visual decisions here. */
export function normalizeMapItems(doc: HempDocument): MapItem[] {
  const items = doc.nodes.map((node) => ({ ...node, namespace: "" }));
  const byId = new Map(items.map((n) => [n.id, n]));
  for (const item of items) {
    const names: string[] = [];
    let parent = item.parent;
    while (parent) {
      const n = byId.get(parent)!;
      names.unshift(n.name);
      parent = n.parent;
    }
    item.namespace = names.join("::");
  }
  return items;
}

/** Syntax spans + semantic occurrence evidence -> per-function connections. */
export function joinFunctionFacts(
  info: FunctionInfo,
  item: MapItem,
  source: string,
  references: HempDocument["dependencies"],
): FunctionInfo {
  const result = structuredClone(info);
  result.itemId = item.id;
  result.namespace = item.namespace;
  const lines = source.split("\n");
  const parts = functionParts(result.body);
  // syn uses Unicode scalar columns; LSP inventory uses UTF-16.
  for (const part of parts)
    for (const point of [part.start, part.end])
      point.column =
        [...(lines[point.line - 1] ?? "")].slice(0, point.column - 1).join("").length + 1;
  const deepest = [...parts].reverse();
  result.connections = references.flatMap((edge) =>
    edge.evidence.flatMap((e) => {
      const line = e.line,
        column = e.column ?? 1;
      const part = deepest.find(
        (p) =>
          (line > p.start.line || (line === p.start.line && column >= p.start.column)) &&
          (line < p.end.line || (line === p.end.line && column < p.end.column)),
      );
      return part
        ? [{ partId: part.id, targetId: edge.to, kind: "reference" as const, line, column }]
        : [];
    }),
  );
  return result;
}
