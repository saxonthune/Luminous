import type { AtlasColorToken } from './colors.ts';
import type { AtlasAction, AtlasContent, AtlasDocument, AtlasEdge, AtlasNode } from './types.ts';

export type AtlasResult = { ok: true; doc: AtlasDocument } | { ok: false; error: string };

export function addNode(
  doc: AtlasDocument,
  fields: { id: string; name: string; parent?: string; x?: number; y?: number; color?: AtlasColorToken },
): AtlasResult {
  if (doc.nodes.some(n => n.id === fields.id)) {
    return { ok: false, error: `node "${fields.id}" already exists` };
  }
  if (fields.parent !== undefined && !doc.nodes.some(n => n.id === fields.parent)) {
    return { ok: false, error: `parent "${fields.parent}" does not exist` };
  }
  const node: AtlasNode = { id: fields.id, name: fields.name };
  if (fields.parent !== undefined) node.parent = fields.parent;
  if (fields.x !== undefined) node.x = fields.x;
  if (fields.y !== undefined) node.y = fields.y;
  if (fields.color !== undefined) node.color = fields.color;
  return { ok: true, doc: { ...doc, nodes: [...doc.nodes, node] } };
}

export function setNode(
  doc: AtlasDocument,
  id: string,
  patch: {
    name?: string;
    content?: AtlasContent;
    x?: number;
    y?: number;
    color?: AtlasColorToken;
    contentHeight?: number;
    contentWidth?: number;
  },
): AtlasResult {
  const index = doc.nodes.findIndex(n => n.id === id);
  if (index === -1) {
    return { ok: false, error: `node "${id}" does not exist` };
  }
  const node = { ...doc.nodes[index] };
  if (patch.name !== undefined) node.name = patch.name;
  if ('content' in patch) {
    if (patch.content === undefined) {
      delete node.content;
    } else {
      node.content = patch.content;
    }
  }
  if ('x' in patch) {
    if (patch.x === undefined) {
      delete node.x;
    } else {
      node.x = patch.x;
    }
  }
  if ('y' in patch) {
    if (patch.y === undefined) {
      delete node.y;
    } else {
      node.y = patch.y;
    }
  }
  if ('color' in patch) {
    if (patch.color === undefined) {
      delete node.color;
    } else {
      node.color = patch.color;
    }
  }
  if ('contentHeight' in patch) {
    if (patch.contentHeight === undefined) {
      delete node.contentHeight;
    } else {
      node.contentHeight = patch.contentHeight;
    }
  }
  if ('contentWidth' in patch) {
    if (patch.contentWidth === undefined) {
      delete node.contentWidth;
    } else {
      node.contentWidth = patch.contentWidth;
    }
  }
  const nodes = [...doc.nodes];
  nodes[index] = node;
  return { ok: true, doc: { ...doc, nodes } };
}

/** Every node reachable from `id` by following child -> parent links in reverse. */
function descendantIds(doc: AtlasDocument, id: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const n of doc.nodes) {
    if (n.parent !== undefined) {
      const list = children.get(n.parent) ?? [];
      list.push(n.id);
      children.set(n.parent, list);
    }
  }
  const result = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const child of children.get(current) ?? []) {
      if (!result.has(child)) {
        result.add(child);
        stack.push(child);
      }
    }
  }
  return result;
}

export function removeNode(doc: AtlasDocument, id: string): AtlasResult {
  if (!doc.nodes.some(n => n.id === id)) {
    return { ok: false, error: `node "${id}" does not exist` };
  }
  const removed = new Set([id, ...descendantIds(doc, id)]);
  return {
    ok: true,
    doc: {
      ...doc,
      nodes: doc.nodes.filter(n => !removed.has(n.id)),
      edges: doc.edges.filter(e => !removed.has(e.from) && !removed.has(e.to)),
    },
  };
}

export function reparent(doc: AtlasDocument, id: string, parent: string | undefined): AtlasResult {
  const byId = new Map(doc.nodes.map(n => [n.id, n]));
  if (!byId.has(id)) {
    return { ok: false, error: `node "${id}" does not exist` };
  }
  if (parent !== undefined) {
    if (parent === id) {
      return { ok: false, error: `node "${id}" cannot be its own parent` };
    }
    if (!byId.has(parent)) {
      return { ok: false, error: `parent "${parent}" does not exist` };
    }
    let current: AtlasNode | undefined = byId.get(parent);
    const visited = new Set<string>();
    while (current) {
      if (current.id === id) {
        return { ok: false, error: `reparenting "${id}" to "${parent}" would create a cycle` };
      }
      if (visited.has(current.id)) break;
      visited.add(current.id);
      current = current.parent !== undefined ? byId.get(current.parent) : undefined;
    }
  }
  const nodes = doc.nodes.map(n => {
    if (n.id !== id) return n;
    const next = { ...n };
    if (parent === undefined) {
      delete next.parent;
    } else {
      next.parent = parent;
    }
    return next;
  });
  return { ok: true, doc: { ...doc, nodes } };
}

export function addEdge(doc: AtlasDocument, from: string, to: string): AtlasResult {
  if (!doc.nodes.some(n => n.id === from)) {
    return { ok: false, error: `node "${from}" does not exist` };
  }
  if (!doc.nodes.some(n => n.id === to)) {
    return { ok: false, error: `node "${to}" does not exist` };
  }
  if (doc.edges.some(e => e.from === from && e.to === to)) {
    return { ok: true, doc };
  }
  const edge: AtlasEdge = { from, to };
  return { ok: true, doc: { ...doc, edges: [...doc.edges, edge] } };
}

export function removeEdge(doc: AtlasDocument, from: string, to: string): AtlasResult {
  if (!doc.nodes.some(n => n.id === from)) {
    return { ok: false, error: `node "${from}" does not exist` };
  }
  if (!doc.nodes.some(n => n.id === to)) {
    return { ok: false, error: `node "${to}" does not exist` };
  }
  return {
    ok: true,
    doc: { ...doc, edges: doc.edges.filter(e => !(e.from === from && e.to === to)) },
  };
}

/** Splits `A -> B` into `A -> newNode -> B`, carrying newNode's explanation as
 * its Content — a pure list of primitive actions, applied by the caller via
 * `applyAtlasBatch` so the batch flows through undo/redo inversion unchanged. */
export function buildBisectActions(
  _doc: AtlasDocument,
  edge: { from: string; to: string },
  newNode: { id: string; name?: string; content?: AtlasContent; x?: number; y?: number; parent?: string },
): AtlasAction[] {
  const actions: AtlasAction[] = [
    { type: 'removeEdge', from: edge.from, to: edge.to },
    { type: 'addNode', id: newNode.id, name: newNode.name ?? newNode.id, parent: newNode.parent, x: newNode.x, y: newNode.y },
  ];
  if (newNode.content !== undefined) {
    actions.push({ type: 'setNode', id: newNode.id, content: newNode.content });
  }
  actions.push(
    { type: 'addEdge', from: edge.from, to: newNode.id },
    { type: 'addEdge', from: newNode.id, to: edge.to },
  );
  return actions;
}

export function applyAtlasBatch(doc: AtlasDocument, actions: AtlasAction[]): AtlasResult {
  let current = doc;
  for (const action of actions) {
    let result: AtlasResult;
    switch (action.type) {
      case 'addNode':
        result = addNode(current, {
          id: action.id,
          name: action.name,
          parent: action.parent,
          x: action.x,
          y: action.y,
        });
        break;
      case 'setNode': {
        const patch: {
          name?: string;
          content?: AtlasContent;
          x?: number;
          y?: number;
          color?: AtlasColorToken;
          contentHeight?: number;
          contentWidth?: number;
        } = {};
        if (action.name !== undefined) patch.name = action.name;
        if ('content' in action) patch.content = action.content;
        if ('x' in action) patch.x = action.x;
        if ('y' in action) patch.y = action.y;
        if ('color' in action) patch.color = action.color;
        if ('contentHeight' in action) patch.contentHeight = action.contentHeight;
        if ('contentWidth' in action) patch.contentWidth = action.contentWidth;
        result = setNode(current, action.id, patch);
        break;
      }
      case 'removeNode':
        result = removeNode(current, action.id);
        break;
      case 'reparent':
        result = reparent(current, action.id, action.parent);
        break;
      case 'addEdge':
        result = addEdge(current, action.from, action.to);
        break;
      case 'removeEdge':
        result = removeEdge(current, action.from, action.to);
        break;
    }
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    current = result.doc;
  }
  return { ok: true, doc: current };
}
