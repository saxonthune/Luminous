import { TRACE_NODE_KINDS, isTraceNodeKind } from './kind-descriptors.ts';
import type { LinenAction, LinenContract, LinenDocument, LinenModule, LinenTraceNode } from './types.ts';

export type LinenResult = { ok: true; doc: LinenDocument } | { ok: false; error: string };

export type LinenEndpointKind = 'module' | 'contract' | 'node';

export function endpointKind(doc: LinenDocument, id: string): LinenEndpointKind | undefined {
  if (doc.nodes.some(n => n.id === id)) return 'node';
  if (doc.modules.some(m => m.id === id)) return 'module';
  if (doc.contracts.some(c => c.id === id)) return 'contract';
  return undefined;
}

function idTaken(doc: LinenDocument, id: string): boolean {
  return endpointKind(doc, id) !== undefined;
}

export function addModule(
  doc: LinenDocument,
  fields: { id: string; name: string; parent?: string },
): LinenResult {
  if (idTaken(doc, fields.id)) {
    return { ok: false, error: `id "${fields.id}" already exists` };
  }
  if (fields.parent !== undefined && !doc.modules.some(m => m.id === fields.parent)) {
    return { ok: false, error: `parent module "${fields.parent}" does not exist` };
  }
  const module: LinenModule = { id: fields.id, name: fields.name };
  if (fields.parent !== undefined) module.parent = fields.parent;
  return { ok: true, doc: { ...doc, modules: [...doc.modules, module] } };
}

export function addContract(
  doc: LinenDocument,
  fields: { id: string; name: string; owner?: string; text?: string },
): LinenResult {
  if (idTaken(doc, fields.id)) {
    return { ok: false, error: `id "${fields.id}" already exists` };
  }
  if (fields.owner !== undefined && !doc.modules.some(m => m.id === fields.owner)) {
    return { ok: false, error: `owner module "${fields.owner}" does not exist` };
  }
  const contract: LinenContract = { id: fields.id, name: fields.name };
  if (fields.owner !== undefined) contract.owner = fields.owner;
  if (fields.text !== undefined) contract.text = fields.text;
  return { ok: true, doc: { ...doc, contracts: [...doc.contracts, contract] } };
}

export function addNode(
  doc: LinenDocument,
  fields: {
    id: string;
    kind: string;
    module: string;
    annotation?: string;
    x?: number;
    y?: number;
    to?: string;
    contract?: string;
  },
): LinenResult {
  if (idTaken(doc, fields.id)) {
    return { ok: false, error: `id "${fields.id}" already exists` };
  }
  if (!isTraceNodeKind(fields.kind)) {
    return { ok: false, error: `unknown kind "${fields.kind}" (allowed: ${TRACE_NODE_KINDS.join(', ')})` };
  }
  if (!doc.modules.some(m => m.id === fields.module)) {
    return { ok: false, error: `module "${fields.module}" does not exist` };
  }
  if ((fields.x !== undefined) !== (fields.y !== undefined)) {
    return { ok: false, error: '"x" and "y" must appear together' };
  }
  if (fields.kind === 'pass') {
    if (fields.to === undefined) {
      return { ok: false, error: 'a Pass must name the Module passed to ("to")' };
    }
    if (!doc.modules.some(m => m.id === fields.to)) {
      return { ok: false, error: `module "${fields.to}" does not exist` };
    }
  } else if (fields.to !== undefined) {
    return { ok: false, error: 'only a Pass names a Module passed to ("to")' };
  }
  if (fields.kind === 'type') {
    if (fields.contract !== undefined && !doc.contracts.some(c => c.id === fields.contract)) {
      return { ok: false, error: `contract "${fields.contract}" does not exist` };
    }
  } else if (fields.contract !== undefined) {
    return { ok: false, error: 'only a Type names a Contract ("contract")' };
  }
  const node = { id: fields.id, kind: fields.kind, module: fields.module } as LinenTraceNode;
  if (fields.annotation !== undefined) node.annotation = fields.annotation;
  if (fields.x !== undefined) node.x = fields.x;
  if (fields.y !== undefined) node.y = fields.y;
  if (node.kind === 'pass') node.to = fields.to as string;
  if (node.kind === 'type' && fields.contract !== undefined) node.contract = fields.contract;
  return { ok: true, doc: { ...doc, nodes: [...doc.nodes, node] } };
}

export function setNode(
  doc: LinenDocument,
  id: string,
  patch: { annotation?: string; x?: number; y?: number; to?: string; contract?: string },
): LinenResult {
  const index = doc.nodes.findIndex(n => n.id === id);
  if (index === -1) {
    return { ok: false, error: `node "${id}" does not exist` };
  }
  const node = { ...doc.nodes[index] } as LinenTraceNode;
  if ('annotation' in patch) {
    if (patch.annotation === undefined) {
      delete node.annotation;
    } else {
      node.annotation = patch.annotation;
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
  if ('to' in patch) {
    if (node.kind !== 'pass') {
      return { ok: false, error: `node "${id}" is not a Pass and has no "to"` };
    }
    if (patch.to === undefined) {
      return { ok: false, error: 'a Pass must name the Module passed to ("to")' };
    }
    if (!doc.modules.some(m => m.id === patch.to)) {
      return { ok: false, error: `module "${patch.to}" does not exist` };
    }
    node.to = patch.to;
  }
  if ('contract' in patch) {
    if (node.kind !== 'type') {
      return { ok: false, error: `node "${id}" is not a Type and has no "contract"` };
    }
    if (patch.contract === undefined) {
      delete node.contract;
    } else {
      if (!doc.contracts.some(c => c.id === patch.contract)) {
        return { ok: false, error: `contract "${patch.contract}" does not exist` };
      }
      node.contract = patch.contract;
    }
  }
  const nodes = [...doc.nodes];
  nodes[index] = node;
  return { ok: true, doc: { ...doc, nodes } };
}

export function removeNode(doc: LinenDocument, id: string): LinenResult {
  if (!doc.nodes.some(n => n.id === id)) {
    return { ok: false, error: `node "${id}" does not exist` };
  }
  return {
    ok: true,
    doc: {
      ...doc,
      nodes: doc.nodes.filter(n => n.id !== id),
      edges: doc.edges.filter(e => e.from !== id && e.to !== id),
    },
  };
}

export function connect(doc: LinenDocument, from: string, to: string): LinenResult {
  const fromKind = endpointKind(doc, from);
  const toKind = endpointKind(doc, to);
  if (fromKind === undefined) {
    return { ok: false, error: `"${from}" does not exist` };
  }
  if (toKind === undefined) {
    return { ok: false, error: `"${to}" does not exist` };
  }
  const control = fromKind === 'node' && toKind === 'node';
  const toContract = (fromKind === 'node' || fromKind === 'module') && toKind === 'contract';
  if (!control && !toContract) {
    return {
      ok: false,
      error: `no Edge from ${fromKind} "${from}" to ${toKind} "${to}": an Edge joins two Trace Nodes, or a Trace Node or Module to a Contract`,
    };
  }
  if (doc.edges.some(e => e.from === from && e.to === to)) {
    return { ok: false, error: `edge "${from}" -> "${to}" already exists` };
  }
  return { ok: true, doc: { ...doc, edges: [...doc.edges, { from, to }] } };
}

export function disconnect(doc: LinenDocument, from: string, to: string): LinenResult {
  if (!doc.edges.some(e => e.from === from && e.to === to)) {
    return { ok: false, error: `edge "${from}" -> "${to}" does not exist` };
  }
  return {
    ok: true,
    doc: { ...doc, edges: doc.edges.filter(e => !(e.from === from && e.to === to)) },
  };
}

export function setAnnotation(doc: LinenDocument, id: string, annotation: string | undefined): LinenResult {
  return setNode(doc, id, { annotation });
}

export function applyLinenBatch(doc: LinenDocument, actions: LinenAction[]): LinenResult {
  let current = doc;
  for (const action of actions) {
    let result: LinenResult;
    switch (action.type) {
      case 'addModule':
        result = addModule(current, { id: action.id, name: action.name, parent: action.parent });
        break;
      case 'addContract':
        result = addContract(current, { id: action.id, name: action.name, owner: action.owner, text: action.text });
        break;
      case 'addNode':
        result = addNode(current, {
          id: action.id,
          kind: action.kind,
          module: action.module,
          annotation: action.annotation,
          x: action.x,
          y: action.y,
          to: action.to,
          contract: action.contract,
        });
        break;
      case 'setNode': {
        const patch: { annotation?: string; x?: number; y?: number; to?: string; contract?: string } = {};
        if ('annotation' in action) patch.annotation = action.annotation;
        if ('x' in action) patch.x = action.x;
        if ('y' in action) patch.y = action.y;
        if ('to' in action) patch.to = action.to;
        if ('contract' in action) patch.contract = action.contract;
        result = setNode(current, action.id, patch);
        break;
      }
      case 'removeNode':
        result = removeNode(current, action.id);
        break;
      case 'connect':
        result = connect(current, action.from, action.to);
        break;
      case 'disconnect':
        result = disconnect(current, action.from, action.to);
        break;
      case 'setAnnotation':
        result = setAnnotation(current, action.id, action.annotation);
        break;
    }
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    current = result.doc;
  }
  return { ok: true, doc: current };
}
