import type { HempNode, HempDependency } from "./index";
import type { FunctionInfo } from "./functionInfo";

/** Analysis facts are independent of projection and saved geometry. */
export interface MapItem extends HempNode {
  namespace: string;
  functionFile?: string;
  lineCount?: number;
}
export interface MapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface HempMap {
  format: "hemp2";
  name: string;
  collection: string;
  analysis: { sourceRoot: string; warnings: string[] };
  items: MapItem[];
  references: HempDependency[];
  /** Parent-relative positions. Kept independently from analysis facts. */
  layout: Record<string, MapRect>;
}
export interface FunctionChunk {
  format: "hemp2-function";
  info: FunctionInfo;
}

export function parseHempMap(text: string): HempMap {
  const map = JSON.parse(text) as HempMap;
  if (
    map?.format !== "hemp2" ||
    !Array.isArray(map.items) ||
    !Array.isArray(map.references) ||
    typeof map.collection !== "string" ||
    !map.layout ||
    !map.analysis
  )
    throw new Error("Invalid Hemp map");
  const ids = new Set(map.items.map((n) => n.id));
  if (ids.size !== map.items.length) throw new Error("Duplicate map item");
  const byId = new Map(map.items.map((n) => [n.id, n]));
  for (const item of map.items) {
    if (
      typeof item.name !== "string" ||
      typeof item.namespace !== "string" ||
      !item.source ||
      (item.parent && !ids.has(item.parent))
    )
      throw new Error("Invalid map item");
    const seen = new Set([item.id]);
    let parent = item.parent;
    while (parent) {
      if (seen.has(parent)) throw new Error("Cyclic map containment");
      seen.add(parent);
      parent = byId.get(parent)?.parent;
    }
    const r = map.layout[item.id];
    if (
      !r ||
      ![r.x, r.y, r.width, r.height].every(Number.isFinite) ||
      r.width <= 0 ||
      r.height <= 0
    )
      throw new Error(`Invalid layout for ${item.name}`);
    if (item.functionFile && !/^[a-zA-Z0-9._-]+\.hemp2-part\.json$/.test(item.functionFile))
      throw new Error("Invalid function chunk filename");
  }
  for (const edge of map.references)
    if (!ids.has(edge.from) || !ids.has(edge.to)) throw new Error("Unknown reference endpoint");
  return map;
}

/** Construct once per artifact, not per keystroke or camera movement. */
export function indexHempMap(map: HempMap) {
  const byId = new Map(map.items.map((item) => [item.id, item]));
  const outgoing = new Map<string, HempDependency[]>();
  const incoming = new Map<string, HempDependency[]>();
  for (const edge of map.references) {
    for (const [index, id] of [
      [outgoing, edge.from],
      [incoming, edge.to],
    ] as const) {
      const list = index.get(id) ?? [];
      list.push(edge);
      index.set(id, list);
    }
  }
  const searchable = map.items.map((item) => ({
    item,
    text: `${item.name} ${item.namespace}`.toLowerCase(),
  }));
  return {
    byId,
    outgoing,
    incoming,
    search(query: string) {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      return searchable
        .filter((n) => n.text.includes(q))
        .sort(
          (a, b) =>
            Number(b.item.name.toLowerCase() === q) - Number(a.item.name.toLowerCase() === q),
        )
        .slice(0, 40)
        .map((n) => n.item);
    },
    neighborhood(id: string, direction: "dependencies" | "usages") {
      const edges = (direction === "dependencies" ? outgoing : incoming).get(id) ?? [];
      return { edges, ids: new Set([id, ...edges.flatMap((e) => [e.from, e.to])]) };
    },
  };
}
