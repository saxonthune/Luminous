import type {
  MerinoAction,
  MerinoContainerLayout,
  MerinoDash,
  MerinoDocument,
  MerinoEdge,
  MerinoEdgeType,
  MerinoNode,
  MerinoNodeType,
  MerinoPorts,
  MerinoTab,
} from './types.ts';

export type MerinoResult = { ok: true; doc: MerinoDocument } | { ok: false; error: string };

function nodeById(doc: MerinoDocument, id: string): MerinoNode | undefined {
  return doc.nodes.find(n => n.id === id);
}

function anyIdTaken(doc: MerinoDocument, id: string): boolean {
  return doc.nodes.some(n => n.id === id) || doc.edges.some(e => e.id === id);
}

/** Every node id in the subtree rooted at `id` (the node and all its
 * Subnodes, recursively). */
export function descendantIds(doc: MerinoDocument, id: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const n of doc.nodes) {
    if (n.parent === undefined) continue;
    const list = childrenOf.get(n.parent) ?? [];
    list.push(n.id);
    childrenOf.set(n.parent, list);
  }
  const out: string[] = [];
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop()!;
    out.push(current);
    for (const child of childrenOf.get(current) ?? []) stack.push(child);
  }
  return out;
}

// ── Node Types ────────────────────────────────────────────────────────────

export function addNodeType(
  doc: MerinoDocument,
  fields: { id: string; name: string; color: MerinoNodeType['color']; layout?: MerinoContainerLayout },
): MerinoResult {
  if (doc.nodeTypes.some(t => t.id === fields.id)) {
    return { ok: false, error: `node type "${fields.id}" already exists` };
  }
  const type: MerinoNodeType = { id: fields.id, name: fields.name, color: fields.color };
  if (fields.layout !== undefined) type.layout = fields.layout;
  return { ok: true, doc: { ...doc, nodeTypes: [...doc.nodeTypes, type] } };
}

export function setNodeType(
  doc: MerinoDocument,
  id: string,
  patch: { name?: string; color?: MerinoNodeType['color']; layout?: MerinoContainerLayout | null },
): MerinoResult {
  const index = doc.nodeTypes.findIndex(t => t.id === id);
  if (index === -1) return { ok: false, error: `node type "${id}" does not exist` };
  const next = { ...doc.nodeTypes[index] };
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.color !== undefined) next.color = patch.color;
  if ('layout' in patch) {
    if (patch.layout === null || patch.layout === undefined) delete next.layout;
    else next.layout = patch.layout;
  }
  const nodeTypes = [...doc.nodeTypes];
  nodeTypes[index] = next;
  return { ok: true, doc: { ...doc, nodeTypes } };
}

export function removeNodeType(doc: MerinoDocument, id: string): MerinoResult {
  if (!doc.nodeTypes.some(t => t.id === id)) {
    return { ok: false, error: `node type "${id}" does not exist` };
  }
  const users = doc.nodes.filter(n => n.type === id).map(n => n.id);
  if (users.length > 0) {
    return {
      ok: false,
      error: `node type "${id}" is still used by ${users.length} node(s) (${users.slice(0, 3).join(', ')}${users.length > 3 ? ', …' : ''}); reassign them first`,
    };
  }
  return { ok: true, doc: { ...doc, nodeTypes: doc.nodeTypes.filter(t => t.id !== id) } };
}

// ── Edge Types ────────────────────────────────────────────────────────────

export function addEdgeType(
  doc: MerinoDocument,
  fields: { id: string; name: string; color: MerinoEdgeType['color']; dash: MerinoDash; arrowHead: boolean; directed: boolean },
): MerinoResult {
  if (doc.edgeTypes.some(t => t.id === fields.id)) {
    return { ok: false, error: `edge type "${fields.id}" already exists` };
  }
  return { ok: true, doc: { ...doc, edgeTypes: [...doc.edgeTypes, { ...fields }] } };
}

export function setEdgeType(
  doc: MerinoDocument,
  id: string,
  patch: { name?: string; color?: MerinoEdgeType['color']; dash?: MerinoDash; arrowHead?: boolean; directed?: boolean },
): MerinoResult {
  const index = doc.edgeTypes.findIndex(t => t.id === id);
  if (index === -1) return { ok: false, error: `edge type "${id}" does not exist` };
  const next = { ...doc.edgeTypes[index] };
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.color !== undefined) next.color = patch.color;
  if (patch.dash !== undefined) next.dash = patch.dash;
  if (patch.arrowHead !== undefined) next.arrowHead = patch.arrowHead;
  if (patch.directed !== undefined) next.directed = patch.directed;
  const edgeTypes = [...doc.edgeTypes];
  edgeTypes[index] = next;
  return { ok: true, doc: { ...doc, edgeTypes } };
}

export function removeEdgeType(doc: MerinoDocument, id: string): MerinoResult {
  if (!doc.edgeTypes.some(t => t.id === id)) {
    return { ok: false, error: `edge type "${id}" does not exist` };
  }
  const users = doc.edges.filter(e => e.type === id).map(e => e.id);
  if (users.length > 0) {
    return {
      ok: false,
      error: `edge type "${id}" is still used by ${users.length} edge(s); reassign them first`,
    };
  }
  return { ok: true, doc: { ...doc, edgeTypes: doc.edgeTypes.filter(t => t.id !== id) } };
}

// ── Nodes ─────────────────────────────────────────────────────────────────

export function addNode(
  doc: MerinoDocument,
  fields: { id: string; tab: MerinoTab; nodeType: string; name: string; text?: string; parent?: string; order?: number; x?: number; y?: number },
): MerinoResult {
  if (anyIdTaken(doc, fields.id)) {
    return { ok: false, error: `id "${fields.id}" already exists` };
  }
  if (!doc.nodeTypes.some(t => t.id === fields.nodeType)) {
    return { ok: false, error: `node type "${fields.nodeType}" does not exist` };
  }
  if ((fields.x !== undefined) !== (fields.y !== undefined)) {
    return { ok: false, error: '"x" and "y" must appear together' };
  }
  if (fields.parent !== undefined) {
    const parent = nodeById(doc, fields.parent);
    if (parent === undefined) {
      return { ok: false, error: `parent node "${fields.parent}" does not exist` };
    }
    if (parent.tab !== fields.tab) {
      return { ok: false, error: `a Subnode shares its parent's Tab ("${parent.tab}")` };
    }
  }
  const node: MerinoNode = { id: fields.id, tab: fields.tab, type: fields.nodeType, name: fields.name };
  if (fields.text !== undefined) node.text = fields.text;
  if (fields.parent !== undefined) node.parent = fields.parent;
  if (fields.order !== undefined) node.order = fields.order;
  if (fields.x !== undefined) node.x = fields.x;
  if (fields.y !== undefined) node.y = fields.y;
  return { ok: true, doc: { ...doc, nodes: [...doc.nodes, node] } };
}

export function setNode(
  doc: MerinoDocument,
  id: string,
  patch: { name?: string; text?: string; nodeType?: string; parent?: string | null; expanded?: boolean; order?: number; ports?: MerinoPorts; width?: number; height?: number; x?: number; y?: number },
): MerinoResult {
  const index = doc.nodes.findIndex(n => n.id === id);
  if (index === -1) return { ok: false, error: `node "${id}" does not exist` };
  const node = { ...doc.nodes[index] };
  if (patch.name !== undefined) node.name = patch.name;
  if (patch.expanded !== undefined) {
    if (patch.expanded) node.expanded = true;
    else delete node.expanded;
  }
  if ('order' in patch) {
    if (patch.order === undefined) delete node.order;
    else node.order = patch.order;
  }
  if ('ports' in patch) {
    if (patch.ports === undefined) delete node.ports;
    else node.ports = patch.ports;
  }
  for (const field of ['width', 'height'] as const) {
    if (!(field in patch)) continue;
    const value = patch[field];
    if (value === undefined) delete node[field];
    else if (!Number.isFinite(value) || value <= 0) return { ok: false, error: `"${field}" must be a positive finite number` };
    else node[field] = value;
  }
  if ('text' in patch) {
    if (patch.text === undefined) delete node.text;
    else node.text = patch.text;
  }
  if (patch.nodeType !== undefined) {
    if (!doc.nodeTypes.some(t => t.id === patch.nodeType)) {
      return { ok: false, error: `node type "${patch.nodeType}" does not exist` };
    }
    node.type = patch.nodeType;
  }
  if ('parent' in patch) {
    if (patch.parent === null || patch.parent === undefined) {
      delete node.parent;
    } else {
      if (patch.parent === id) return { ok: false, error: 'a node cannot be its own parent' };
      const parent = nodeById(doc, patch.parent);
      if (parent === undefined) return { ok: false, error: `parent node "${patch.parent}" does not exist` };
      if (parent.tab !== node.tab) return { ok: false, error: `a Subnode shares its parent's Tab ("${parent.tab}")` };
      if (descendantIds(doc, id).includes(patch.parent)) {
        return { ok: false, error: `"${patch.parent}" is already a descendant of "${id}"` };
      }
      node.parent = patch.parent;
    }
  }
  if (('x' in patch) !== ('y' in patch)) {
    return { ok: false, error: '"x" and "y" must appear together' };
  }
  if ('x' in patch) {
    if (patch.x === undefined || patch.y === undefined) {
      delete node.x;
      delete node.y;
    } else {
      node.x = patch.x;
      node.y = patch.y;
    }
  }
  const nodes = [...doc.nodes];
  nodes[index] = node;
  return { ok: true, doc: { ...doc, nodes } };
}

export function removeNode(doc: MerinoDocument, id: string): MerinoResult {
  if (!doc.nodes.some(n => n.id === id)) {
    return { ok: false, error: `node "${id}" does not exist` };
  }
  const removed = new Set(descendantIds(doc, id));
  return {
    ok: true,
    doc: {
      ...doc,
      nodes: doc.nodes.filter(n => !removed.has(n.id)),
      edges: doc.edges.filter(e => !removed.has(e.from) && !removed.has(e.to)),
    },
  };
}

// ── Edges ─────────────────────────────────────────────────────────────────

export function connect(
  doc: MerinoDocument,
  fields: { id: string; edgeType: string; from: string; to: string },
): MerinoResult {
  if (anyIdTaken(doc, fields.id)) {
    return { ok: false, error: `id "${fields.id}" already exists` };
  }
  if (!doc.edgeTypes.some(t => t.id === fields.edgeType)) {
    return { ok: false, error: `edge type "${fields.edgeType}" does not exist` };
  }
  const from = nodeById(doc, fields.from);
  const to = nodeById(doc, fields.to);
  if (from === undefined) return { ok: false, error: `node "${fields.from}" does not exist` };
  if (to === undefined) return { ok: false, error: `node "${fields.to}" does not exist` };
  if (from.tab !== to.tab) {
    return { ok: false, error: `an Edge stays within one Tab: "${fields.from}" is on ${from.tab}, "${fields.to}" on ${to.tab}` };
  }
  if (doc.edges.some(e => e.from === fields.from && e.to === fields.to && e.type === fields.edgeType)) {
    return { ok: false, error: `an Edge of type "${fields.edgeType}" from "${fields.from}" to "${fields.to}" already exists` };
  }
  const edge: MerinoEdge = { id: fields.id, tab: from.tab, type: fields.edgeType, from: fields.from, to: fields.to };
  return { ok: true, doc: { ...doc, edges: [...doc.edges, edge] } };
}

export function setEdge(doc: MerinoDocument, id: string, edgeType: string): MerinoResult {
  const index = doc.edges.findIndex(e => e.id === id);
  if (index === -1) return { ok: false, error: `edge "${id}" does not exist` };
  if (!doc.edgeTypes.some(t => t.id === edgeType)) {
    return { ok: false, error: `edge type "${edgeType}" does not exist` };
  }
  const edges = [...doc.edges];
  edges[index] = { ...edges[index], type: edgeType };
  return { ok: true, doc: { ...doc, edges } };
}

export function disconnect(doc: MerinoDocument, id: string): MerinoResult {
  if (!doc.edges.some(e => e.id === id)) {
    return { ok: false, error: `edge "${id}" does not exist` };
  }
  return { ok: true, doc: { ...doc, edges: doc.edges.filter(e => e.id !== id) } };
}

// ── Batch ─────────────────────────────────────────────────────────────────

export function applyMerinoBatch(doc: MerinoDocument, actions: MerinoAction[]): MerinoResult {
  let current = doc;
  for (const action of actions) {
    let result: MerinoResult;
    switch (action.type) {
      case 'addNodeType':
        result = addNodeType(current, { id: action.id, name: action.name, color: action.color, layout: action.layout });
        break;
      case 'setNodeType': {
        const patch: { name?: string; color?: MerinoNodeType['color']; layout?: MerinoContainerLayout | null } = {};
        if ('name' in action) patch.name = action.name;
        if ('color' in action) patch.color = action.color;
        if ('layout' in action) patch.layout = action.layout ?? null;
        result = setNodeType(current, action.id, patch);
        break;
      }
      case 'removeNodeType':
        result = removeNodeType(current, action.id);
        break;
      case 'addEdgeType':
        result = addEdgeType(current, {
          id: action.id, name: action.name, color: action.color,
          dash: action.dash, arrowHead: action.arrowHead, directed: action.directed,
        });
        break;
      case 'setEdgeType':
        result = setEdgeType(current, action.id, {
          name: action.name, color: action.color, dash: action.dash,
          arrowHead: action.arrowHead, directed: action.directed,
        });
        break;
      case 'removeEdgeType':
        result = removeEdgeType(current, action.id);
        break;
      case 'addNode':
        result = addNode(current, {
          id: action.id, tab: action.tab, nodeType: action.nodeType, name: action.name,
          text: action.text, parent: action.parent, order: action.order, x: action.x, y: action.y,
        });
        break;
      case 'setNode': {
        const patch: { name?: string; text?: string; nodeType?: string; parent?: string | null; expanded?: boolean; order?: number; ports?: MerinoPorts; width?: number; height?: number; x?: number; y?: number } = {};
        if ('name' in action) patch.name = action.name;
        if ('text' in action) patch.text = action.text;
        if ('nodeType' in action) patch.nodeType = action.nodeType;
        if ('parent' in action) patch.parent = action.parent;
        if ('expanded' in action) patch.expanded = action.expanded;
        if ('order' in action) patch.order = action.order;
        if ('ports' in action) patch.ports = action.ports;
        if ('width' in action) patch.width = action.width;
        if ('height' in action) patch.height = action.height;
        if ('x' in action) patch.x = action.x;
        if ('y' in action) patch.y = action.y;
        result = setNode(current, action.id, patch);
        break;
      }
      case 'removeNode':
        result = removeNode(current, action.id);
        break;
      case 'connect':
        result = connect(current, { id: action.id, edgeType: action.edgeType, from: action.from, to: action.to });
        break;
      case 'setEdge':
        result = setEdge(current, action.id, action.edgeType);
        break;
      case 'disconnect':
        result = disconnect(current, action.id);
        break;
    }
    if (!result.ok) return { ok: false, error: result.error };
    current = result.doc;
  }
  return { ok: true, doc: current };
}
