import { dagLayout } from "@luminous/cactus/layout";
import { validateFunctionInfo, type FunctionInfo } from "./functionInfo";
export { functionParts, validateFunctionInfo } from "./functionInfo";
export type { FunctionInfo, FunctionPart } from "./functionInfo";
export * from "./map";

export interface HempSource {
  file: string;
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}
export interface HempNode {
  id: string;
  name: string;
  kind:
    | "crate"
    | "module"
    | "function"
    | "method"
    | "constant"
    | "static"
    | "struct"
    | "enum"
    | "variant"
    | "field"
    | "trait"
    | "impl"
    | "type"
    | "macro"
    | "item"
    | "match"
    | "arm"
    | "call"
    | "branch"
    | "closure";
  parent?: string;
  description: string;
  source: HempSource;
  target?: string;
  targetKind?: string[];
  cfg?: string[];
}
export interface HempDependency {
  from: string;
  to: string;
  kind: "cargo" | "import" | "reference" | "call";
  evidence: (HempSource & { text: string })[];
}
export interface HempDocument {
  functionInfo?: FunctionInfo;
  version: 1;
  projection?: "items";
  name: string;
  analysis: { method: string; scope: string; warnings: string[]; sourceRoot?: string };
  nodes: HempNode[];
  dependencies: HempDependency[];
  views: Record<string, Record<string, { x: number; y: number }>>;
  containers?: Record<string, { x: number; y: number; width: number; height: number }>;
  crateOverview?: { x: number; y: number; width: number; height: number };
  collapsed?: string[];
  unplacedContainers?: string[];
}
export const HEMP_WIDTH = 280;
export const HEMP_HEIGHT = 96;
export const HEMP_ROOT = "workspace";

/** Kind-based visual identity, not a claim that an item has no dependencies. */
export function hempNodeSize(node: Pick<HempNode, "kind">) {
  const stadium = ![
    "crate",
    "module",
    "function",
    "method",
    "match",
    "arm",
    "branch",
    "closure",
    "call",
  ].includes(node.kind);
  return { width: stadium ? 220 : HEMP_WIDTH, height: stadium ? 64 : HEMP_HEIGHT, stadium };
}

export function parseHempDocument(text: string): HempDocument {
  const d = JSON.parse(text) as HempDocument;
  if (
    d?.version !== 1 ||
    (d.projection !== undefined && d.projection !== "items") ||
    typeof d.name !== "string" ||
    !Array.isArray(d.nodes) ||
    !Array.isArray(d.dependencies) ||
    !d.analysis ||
    typeof d.analysis.scope !== "string" ||
    !Array.isArray(d.analysis.warnings) ||
    !d.views ||
    typeof d.views !== "object" ||
    Array.isArray(d.views)
  )
    throw new Error("Invalid Hemp document");
  if (d.analysis.sourceRoot !== undefined && typeof d.analysis.sourceRoot !== "string")
    throw new Error("Invalid source root");
  const ids = new Set<string>();
  for (const n of d.nodes) {
    if (
      !n ||
      typeof n.id !== "string" ||
      ids.has(n.id) ||
      ![
        "crate",
        "module",
        "function",
        "method",
        "constant",
        "static",
        "struct",
        "enum",
        "variant",
        "field",
        "trait",
        "impl",
        "type",
        "macro",
        "item",
        "match",
        "arm",
        "call",
        "branch",
        "closure",
      ].includes(n.kind) ||
      typeof n.name !== "string" ||
      typeof n.description !== "string" ||
      typeof n.source?.file !== "string" ||
      !Number.isInteger(n.source.line)
    )
      throw new Error("Invalid or duplicate Hemp node");
    ids.add(n.id);
  }
  for (const n of d.nodes) {
    if (n.parent !== undefined && !ids.has(n.parent))
      throw new Error(`Unknown parent: ${n.parent}`);
    const visited = new Set([n.id]);
    let parent = n.parent;
    while (parent) {
      if (visited.has(parent)) throw new Error("Cyclic Hemp containment");
      visited.add(parent);
      parent = d.nodes.find((n) => n.id === parent)?.parent;
    }
  }
  for (const e of d.dependencies) {
    if (
      !ids.has(e.from) ||
      !ids.has(e.to) ||
      !["cargo", "import", "reference", "call"].includes(e.kind) ||
      !Array.isArray(e.evidence) ||
      e.evidence.some(
        (s) =>
          typeof s.file !== "string" || typeof s.text !== "string" || !Number.isInteger(s.line),
      )
    )
      throw new Error("Invalid Hemp dependency");
  }
  if (
    d.collapsed !== undefined &&
    (!Array.isArray(d.collapsed) || d.collapsed.some((id) => !ids.has(id)))
  )
    throw new Error("Invalid Hemp disclosure");
  if (
    d.unplacedContainers !== undefined &&
    (!Array.isArray(d.unplacedContainers) || d.unplacedContainers.some((id) => !ids.has(id)))
  )
    throw new Error("Invalid unplaced containers");
  for (const positions of Object.values(d.views)) {
    if (
      !positions ||
      typeof positions !== "object" ||
      Object.values(positions).some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))
    )
      throw new Error("Invalid Hemp positions");
  }
  if (
    d.crateOverview !== undefined &&
    (!d.crateOverview ||
      ![d.crateOverview.x, d.crateOverview.y, d.crateOverview.width, d.crateOverview.height].every(
        Number.isFinite,
      ) ||
      d.crateOverview.width <= 0 ||
      d.crateOverview.height <= 0)
  )
    throw new Error("Invalid crate overview");
  if (d.containers !== undefined) {
    if (!d.containers || typeof d.containers !== "object" || Array.isArray(d.containers))
      throw new Error("Invalid crate-containers");
    for (const [id, rect] of Object.entries(d.containers)) {
      if (
        !d.nodes.some((n) => n.id === id && (d.projection === "items" || n.kind === "crate")) ||
        !rect ||
        ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
        rect.width <= 0 ||
        rect.height <= 0
      )
        throw new Error("Invalid crate-container");
    }
  }
  if (d.functionInfo) validateFunctionInfo(d.functionInfo, ids);
  return d;
}

export function hempProjection(doc: HempDocument, scope = HEMP_ROOT) {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const collapsed = new Set(doc.projection === "items" ? doc.collapsed : []);
  function representative(id: string): string {
    let result = id;
    let parent = byId.get(id)?.parent;
    while (parent) {
      if (collapsed.has(parent)) result = parent;
      parent = byId.get(parent)?.parent;
    }
    return result;
  }
  function crateOf(id: string): string {
    let node = byId.get(id)!;
    while (node.parent) node = byId.get(node.parent)!;
    return node.id;
  }
  const nodes = doc.nodes.filter((n) =>
    scope === HEMP_ROOT
      ? doc.projection === "items"
        ? representative(n.id) === n.id
        : n.kind === "crate"
      : crateOf(n.id) === scope,
  );
  const visible = new Set(nodes.map((n) => n.id));
  const edges = new Map<
    string,
    { id: string; from: string; to: string; evidence: HempDependency[] }
  >();
  for (const dep of doc.dependencies) {
    const lift = scope === HEMP_ROOT && doc.projection !== "items";
    const from = lift ? crateOf(dep.from) : representative(dep.from);
    const to = lift ? crateOf(dep.to) : representative(dep.to);
    if (
      (from === to && (lift || from !== dep.from || to !== dep.to)) ||
      !visible.has(from) ||
      !visible.has(to)
    )
      continue;
    const id = JSON.stringify([from, to]);
    const edge = edges.get(id) ?? { id, from, to, evidence: [] };
    edge.evidence.push(dep);
    edges.set(id, edge);
  }
  return { nodes, edges: [...edges.values()] };
}

/** Geometry is delegated to cactus; Hemp supplies the visible dependency projection. */
export function hempLayout(doc: HempDocument, scope = HEMP_ROOT) {
  const { nodes, edges } = hempProjection(doc, scope);
  return Object.fromEntries(
    dagLayout(
      nodes.map((n) => ({
        id: n.id,
        w: hempNodeSize(n).width,
        h: hempNodeSize(n).height,
        parentId: null,
      })),
      edges.map((e) => ({ source: e.from, target: e.to })),
      { direction: "LR", horizontalGap: 64, verticalGap: 96 },
    ),
  );
}
export function arrangeHemp(doc: HempDocument, scope = HEMP_ROOT): HempDocument {
  if (doc.projection === "items" && scope === HEMP_ROOT) return arrangeHempItems(doc);
  if (scope !== HEMP_ROOT && !doc.nodes.some((n) => n.id === scope && n.kind === "crate"))
    throw new Error(`Unknown crate: ${scope}`);
  return {
    ...doc,
    ...(scope === HEMP_ROOT ? { crateOverview: undefined } : {}),
    views: { ...doc.views, [scope]: hempLayout(doc, scope) },
  };
}

/** Each owner retains a card; its direct children occupy a separate frame. */
export function arrangeHempItems(doc: HempDocument): HempDocument {
  const childrenByParent = new Map<string, HempNode[]>();
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  for (const n of doc.nodes) {
    if (!n.parent) continue;
    const children = childrenByParent.get(n.parent) ?? [];
    children.push(n);
    childrenByParent.set(n.parent, children);
  }
  const owners = doc.nodes.filter((n) => n.kind === "module" || childrenByParent.has(n.id));
  const views: HempDocument["views"] = {};
  const containers: NonNullable<HempDocument["containers"]> = {};
  for (const owner of owners) {
    const children = childrenByParent.get(owner.id) ?? [];
    const ids = new Set(children.map((n) => n.id));
    const local = dagLayout(
      children.map((n) => ({
        id: n.id,
        w: hempNodeSize(n).width,
        h: hempNodeSize(n).height,
        parentId: null,
      })),
      doc.dependencies
        .filter((e) => ids.has(e.from) && ids.has(e.to))
        .map((e) => ({ source: e.from, target: e.to })),
      { direction: "LR", horizontalGap: 64, verticalGap: 48 },
    );
    const minX = Math.min(0, ...[...local.values()].map((p) => p.x));
    const minY = Math.min(0, ...[...local.values()].map((p) => p.y));
    views[owner.id] = Object.fromEntries(
      [...local].map(([id, p]) => [id, { x: p.x - minX + 24, y: p.y - minY + 64 }]),
    );
    containers[owner.id] = {
      x: 0,
      y: 0,
      width: Math.max(
        360,
        ...children.map((n) => views[owner.id][n.id].x + hempNodeSize(n).width + 24),
      ),
      height: Math.max(
        200,
        ...children.map((n) => views[owner.id][n.id].y + hempNodeSize(n).height + 24),
      ),
    };
  }
  const roots = doc.nodes.filter((n) => !n.parent);
  const frameKey = (id: string) => `item-container:${id}`;
  // Hidden frames are placed next to their owner on first expansion. Never
  // build a global layout of thousands of invisible body containers.
  const deferred = new Set(doc.unplacedContainers ?? []);
  const topOwners = owners.filter((n) => !deferred.has(n.id));
  const top = dagLayout(
    [
      ...roots.map((n) => ({
        id: n.id,
        w: hempNodeSize(n).width,
        h: hempNodeSize(n).height,
        parentId: null,
      })),
      ...topOwners.map((n) => ({
        id: frameKey(n.id),
        w: containers[n.id].width,
        h: containers[n.id].height,
        parentId: null,
      })),
    ],
    topOwners.map((n) => ({
      source: n.parent ? frameKey(n.parent) : n.id,
      target: frameKey(n.id),
    })),
    { direction: "LR", horizontalGap: 100, verticalGap: 96 },
  );
  views.workspace = Object.fromEntries(roots.map((n) => [n.id, top.get(n.id)!]));
  for (const owner of topOwners) Object.assign(containers[owner.id], top.get(frameKey(owner.id)));
  // Hidden contents must not spread a collapsed overview across their full area.
  // Keep their fallback geometry so disclosure does not discard saved contents.
  if (doc.collapsed?.length) {
    const projection = hempProjection(doc);
    const visible = new Set(projection.nodes.map((n) => n.id));
    const frames = owners.filter((n) => visible.has(n.id) && !doc.collapsed!.includes(n.id));
    const frameIds = new Set(frames.map((n) => n.id));
    const endpoint = (id: string) => {
      const node = byId.get(id)!;
      return node.parent ? frameKey(node.parent) : id;
    };
    const compact = dagLayout(
      [
        ...roots.map((n) => ({
          id: n.id,
          w: hempNodeSize(n).width,
          h: hempNodeSize(n).height,
          parentId: null,
        })),
        ...frames.map((n) => ({
          id: frameKey(n.id),
          w: containers[n.id].width,
          h: containers[n.id].height,
          parentId: null,
        })),
      ],
      [
        ...frames.map((n) => ({ source: endpoint(n.id), target: frameKey(n.id) })),
        ...projection.edges
          .map((e) => ({ source: endpoint(e.from), target: endpoint(e.to) }))
          .filter((e) => e.source !== e.target),
      ],
      { direction: "LR", horizontalGap: 100, verticalGap: 96 },
    );
    views.workspace = Object.fromEntries(roots.map((n) => [n.id, compact.get(n.id)!]));
    for (const owner of owners) {
      if (frameIds.has(owner.id))
        Object.assign(containers[owner.id], compact.get(frameKey(owner.id)));
    }
  }
  return { ...doc, views, containers, crateOverview: undefined };
}

/** Upgrade the initial flat projection without rewriting existing saved frames. */
export function hempItemContainers(doc: HempDocument): HempDocument {
  if (doc.projection !== "items") return doc;
  // Generated/saved documents already have geometry. Do not rerun the entire
  // hidden graph's layout on every move, selection, or disclosure change.
  const owners = new Set(doc.nodes.flatMap((n) => (n.parent ? [n.parent] : [])));
  for (const n of doc.nodes) if (n.kind === "module") owners.add(n.id);
  if (
    [...owners].every((id) => doc.containers?.[id] && doc.views[id]) &&
    doc.nodes.every((n) => doc.views[n.parent ?? HEMP_ROOT]?.[n.id])
  )
    return doc;
  const defaults = arrangeHempItems(doc);
  return {
    ...doc,
    containers: { ...defaults.containers, ...doc.containers },
    views: {
      ...defaults.views,
      ...Object.fromEntries(
        Object.entries(doc.views)
          .filter(([id]) =>
            id === HEMP_ROOT
              ? Object.keys(doc.containers ?? {}).length > 0
              : !!doc.containers?.[id],
          )
          .map(([id, positions]) => [id, { ...defaults.views[id], ...positions }]),
      ),
    },
  };
}
export function moveHempNode(
  doc: HempDocument,
  scope: string,
  id: string,
  x: number,
  y: number,
): HempDocument {
  if (doc.projection === "items") {
    const next = hempItemContainers(doc);
    const node = next.nodes.find((n) => n.id === id);
    if (
      !node ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      (scope !== HEMP_ROOT && node.parent !== scope)
    )
      throw new Error("Invalid Hemp move");
    const owner = node.parent ?? HEMP_ROOT;
    const frame = node.parent ? next.containers?.[node.parent] : undefined;
    const position = scope === HEMP_ROOT && frame ? { x: x - frame.x, y: y - frame.y } : { x, y };
    return { ...next, views: { ...next.views, [owner]: { ...next.views[owner], [id]: position } } };
  }
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !hempProjection(doc, scope).nodes.some((n) => n.id === id)
  )
    throw new Error("Invalid Hemp move");
  return {
    ...doc,
    views: {
      ...doc.views,
      [scope]: { ...(doc.views[scope] ?? hempLayout(doc, scope)), [id]: { x, y } },
    },
  };
}
export { functionResources } from "./functionResources.js";
